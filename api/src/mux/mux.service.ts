import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, createSign, timingSafeEqual } from 'node:crypto';
import { muxCredentials, muxSigningKey, muxWebhookSecret } from '../config/media.config';

const MUX_API = 'https://api.mux.com/video/v1';

/** Validade do token de playback. Curta: cabe uma aula, nao uma temporada. */
const PLAYBACK_TTL_SECONDS = 2 * 60 * 60;

/** Janela aceita entre o timestamp assinado pelo Mux e o relogio da API. */
const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

/** Estado da ingestao, no vocabulario do banco (enum `VideoStatus`). */
export type AssetStatus = 'PROCESSING' | 'READY' | 'ERRORED';

/** Asset do Mux reduzido ao que a API guarda. */
export interface MuxAsset {
  assetId: string;
  playbackId: string | null;
  status: AssetStatus;
  /** Motivo da falha, quando o asset veio `errored`. */
  error: string | null;
}

/** Token de playback e o instante em que ele deixa de valer. */
export interface PlaybackToken {
  token: string;
  expiresAt: string;
}

/** Resposta do Mux para um asset, no que interessa aqui. */
interface AssetResponse {
  id: string;
  status: string;
  errors?: { messages?: string[] };
  playback_ids?: { id: string; policy?: string }[];
}

const STATUS_MAP: Record<string, AssetStatus> = {
  preparing: 'PROCESSING',
  ready: 'READY',
  errored: 'ERRORED',
};

function base64url(value: string | Buffer): string {
  return Buffer.from(value as string).toString('base64url');
}

/**
 * CDN de streaming. Isolar as chamadas de rede aqui e o que permite as suites
 * de `content`, `certificates` e `progress` rodarem sem tocar no Mux (decisao
 * 16), no mesmo espirito do `FirebaseService`.
 *
 * Nenhuma credencial daqui e alcancavel a partir do `front/`: as chaves vivem
 * no `ConfigService` do backend (decisao 7).
 */
@Injectable()
export class MuxService {
  private readonly logger = new Logger(MuxService.name);

  constructor(private readonly config: ConfigService) {}

  /**
   * Cria o asset a partir de uma URL que o Mux busca sozinho — e por isso que
   * o video sobe uma vez so: o Storage guarda a fonte e o Mux puxa dela
   * (decisao 4). A policy e `signed` porque todo conteudo logado e pago: o
   * playbackId sozinho nao reproduz nada (decisao 6).
   */
  async createAsset(inputUrl: string): Promise<MuxAsset> {
    const asset = await this.request<AssetResponse>('/assets', {
      method: 'POST',
      body: JSON.stringify({
        inputs: [{ url: inputUrl }],
        playback_policies: ['signed'],
        video_quality: 'basic',
      }),
    });

    return this.toAsset(asset);
  }

  /** Estado atual do asset. O painel consulta enquanto o Mux ingere. */
  async getAsset(assetId: string): Promise<MuxAsset> {
    return this.toAsset(await this.request<AssetResponse>(`/assets/${assetId}`));
  }

  /** Apaga o asset. Ja inexistente e sucesso: o estado desejado e o mesmo. */
  async deleteAsset(assetId: string): Promise<void> {
    try {
      await this.request(`/assets/${assetId}`, { method: 'DELETE' });
    } catch (error) {
      if ((error as { muxStatus?: number }).muxStatus === 404) {
        return;
      }

      throw error;
    }
  }

  /**
   * JWT curto que libera a reproducao de um playbackId. Assinado com RS256 e a
   * chave privada do Mux — sem dependencia de SDK, porque o unico trabalho e
   * montar tres segmentos base64url e assinar o segundo.
   */
  signPlayback(playbackId: string, ttlSeconds = PLAYBACK_TTL_SECONDS): PlaybackToken {
    const { keyId, privateKey } = muxSigningKey(this.config);
    const exp = Math.floor(Date.now() / 1000) + ttlSeconds;

    const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: keyId }));
    // `aud: 'v'` e o publico de video do Mux; 'v' vale para o player, 't' para
    // thumbnail e 's' para storyboard.
    const payload = base64url(JSON.stringify({ sub: playbackId, aud: 'v', exp, kid: keyId }));

    const signature = createSign('RSA-SHA256')
      .update(`${header}.${payload}`)
      .sign(privateKey)
      .toString('base64url');

    return { token: `${header}.${payload}.${signature}`, expiresAt: new Date(exp * 1000).toISOString() };
  }

  /**
   * Verificacao da assinatura do webhook. `POST /webhooks/mux` e rota publica
   * por necessidade — o Mux nao tem sessao na plataforma — e e esta assinatura
   * que separa um evento legitimo de um POST qualquer da internet (decisao 5).
   */
  verifyWebhookSignature(rawBody: string, header: string): boolean {
    const parts = Object.fromEntries(
      (header ?? '')
        .split(',')
        .map(part => part.trim().split('='))
        .filter(pair => pair.length === 2),
    );

    const timestamp = Number(parts.t);
    const received = parts.v1;

    if (!Number.isFinite(timestamp) || !received) {
      return false;
    }

    // Janela de tolerancia: sem ela uma requisicao gravada valeria para sempre.
    if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > WEBHOOK_TOLERANCE_SECONDS) {
      return false;
    }

    const expected = createHmac('sha256', muxWebhookSecret(this.config))
      .update(`${timestamp}.${rawBody}`)
      .digest('hex');

    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(received, 'utf8');

    return a.length === b.length && timingSafeEqual(a, b);
  }

  private toAsset(asset: AssetResponse): MuxAsset {
    return {
      assetId: asset.id,
      playbackId: asset.playback_ids?.[0]?.id ?? null,
      status: STATUS_MAP[asset.status] ?? 'PROCESSING',
      // Sem isto o painel mostraria "Falhou" e nada mais, e o admin nao teria
      // como saber que o problema e o arquivo, e nao a plataforma.
      error: asset.errors?.messages?.join(' ') ?? null,
    };
  }

  /** Chamada generica a API do Mux, com Basic auth e erro traduzido. */
  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const { tokenId, tokenSecret } = muxCredentials(this.config);
    const authorization = `Basic ${Buffer.from(`${tokenId}:${tokenSecret}`).toString('base64')}`;

    let response: Response;

    try {
      response = await fetch(`${MUX_API}${path}`, {
        ...init,
        headers: { 'Content-Type': 'application/json', Authorization: authorization },
      });
    } catch (error) {
      this.logger.error(`Falha ao contatar o Mux (${path}).`, error as Error);
      throw new ServiceUnavailableException(
        'Nao foi possivel contatar o servico de video. Tente novamente.',
      );
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      this.logger.error(`Mux respondeu ${response.status} em ${path}: ${detail}`);

      // A resposta crua do Mux nao vai para o cliente: ela pode carregar
      // detalhe de conta e nao ajuda quem esta na tela.
      throw Object.assign(
        new ServiceUnavailableException(
          'O servico de video recusou a operacao. Tente novamente em instantes.',
        ),
        { muxStatus: response.status },
      );
    }

    const payload = (await response.json().catch(() => ({ data: null }))) as { data: T };

    return payload.data;
  }
}
