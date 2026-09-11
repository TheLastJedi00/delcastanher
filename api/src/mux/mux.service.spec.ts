import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, generateKeyPairSync } from 'node:crypto';
import { MuxService } from './mux.service';

/** Par RSA de teste: o Mux assina o playback token com RS256. */
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const PRIVATE_PEM = privateKey.export({ type: 'pkcs1', format: 'pem' }).toString();

const ENV: Record<string, string> = {
  MUX_TOKEN_ID: 'token-id',
  MUX_TOKEN_SECRET: 'token-secret',
  MUX_SIGNING_KEY_ID: 'signing-key-1',
  MUX_SIGNING_PRIVATE_KEY: Buffer.from(PRIVATE_PEM, 'utf8').toString('base64'),
  MUX_WEBHOOK_SECRET: 'segredo-do-webhook',
};

function build(env: Record<string, string> = ENV) {
  const config = { get: (key: string) => env[key] } as unknown as ConfigService;

  return new MuxService(config);
}

/** Resposta de sucesso da API do Mux. */
function ok(data: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ data }),
    text: async () => JSON.stringify({ data }),
  } as unknown as Response;
}

function fail(status: number, message = 'erro') {
  return {
    ok: false,
    status,
    json: async () => ({ error: { messages: [message] } }),
    text: async () => JSON.stringify({ error: { messages: [message] } }),
  } as unknown as Response;
}

/** Corpo do JWT, sem verificar assinatura: o teste so le o que foi assinado. */
function decodePayload(token: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
}

function decodeHeader(token: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString('utf8'));
}

describe('MuxService', () => {
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    fetchMock = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  describe('createAsset', () => {
    it('cria o asset a partir da URL de entrada, com playback policy signed', async () => {
      fetchMock.mockResolvedValue(
        ok({ id: 'asset-1', status: 'preparing', playback_ids: [{ id: 'pb-1', policy: 'signed' }] }),
      );

      const asset = await build().createAsset('https://storage.googleapis.com/leitura');

      expect(asset).toEqual({
        assetId: 'asset-1',
        playbackId: 'pb-1',
        status: 'PROCESSING',
        error: null,
      });

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api.mux.com/video/v1/assets');
      expect(init.method).toBe('POST');

      const body = JSON.parse(init.body as string);
      expect(body.inputs[0].url).toBe('https://storage.googleapis.com/leitura');
      // Toda a plataforma e paga: um playbackId publico dispensaria a sessao.
      expect(body.playback_policies ?? body.playback_policy).toContainEqual('signed');
    });

    it('autentica com Basic usando token id e secret', async () => {
      fetchMock.mockResolvedValue(
        ok({ id: 'asset-1', status: 'preparing', playback_ids: [{ id: 'pb-1' }] }),
      );

      await build().createAsset('https://storage.googleapis.com/leitura');

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const header = (init.headers as Record<string, string>).Authorization;
      const decoded = Buffer.from(header.replace('Basic ', ''), 'base64').toString('utf8');

      expect(decoded).toBe('token-id:token-secret');
    });

    it('traduz falha da API do Mux em 503, sem vazar a resposta crua', async () => {
      fetchMock.mockResolvedValue(fail(401, 'Unauthorized'));

      await expect(build().createAsset('https://x')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });

    it('traduz uma queda de rede em 503', async () => {
      fetchMock.mockRejectedValue(new Error('ECONNRESET'));

      await expect(build().createAsset('https://x')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });

  describe('getAsset', () => {
    it('consulta o estado do asset e traduz para o vocabulario do banco', async () => {
      fetchMock.mockResolvedValue(
        ok({ id: 'asset-1', status: 'ready', playback_ids: [{ id: 'pb-1' }] }),
      );

      const asset = await build().getAsset('asset-1');

      expect(asset).toEqual({ assetId: 'asset-1', playbackId: 'pb-1', status: 'READY', error: null });
      expect(fetchMock.mock.calls[0][0]).toBe('https://api.mux.com/video/v1/assets/asset-1');
    });

    it('traduz o asset com erro de ingestao', async () => {
      fetchMock.mockResolvedValue(ok({ id: 'asset-1', status: 'errored', playback_ids: [] }));

      await expect(build().getAsset('asset-1')).resolves.toMatchObject({ status: 'ERRORED' });
    });
  });

  describe('deleteAsset', () => {
    it('apaga o asset no Mux', async () => {
      fetchMock.mockResolvedValue(ok(null));

      await build().deleteAsset('asset-1');

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api.mux.com/video/v1/assets/asset-1');
      expect(init.method).toBe('DELETE');
    });

    it('trata asset ja inexistente como sucesso', async () => {
      fetchMock.mockResolvedValue(fail(404, 'Not found'));

      // Substituir o video de um modulo apaga o asset anterior; se ele ja nao
      // esta la, o estado desejado ja e o atual.
      await expect(build().deleteAsset('asset-1')).resolves.toBeUndefined();
    });
  });

  describe('signPlayback', () => {
    it('assina um JWT RS256 com o key id no header e o playbackId no sub', () => {
      const token = build().signPlayback('pb-1');

      expect(decodeHeader(token.token)).toMatchObject({ alg: 'RS256', kid: 'signing-key-1' });
      expect(decodePayload(token.token)).toMatchObject({ sub: 'pb-1', aud: 'v' });
    });

    it('emite token de vida curta', () => {
      const token = build().signPlayback('pb-1');
      const payload = decodePayload(token.token) as { exp: number };
      const ttl = payload.exp * 1000 - Date.now();

      expect(ttl).toBeGreaterThan(0);
      // Um id vazado em print ou DevTools nao pode virar acesso vitalicio.
      expect(ttl).toBeLessThanOrEqual(6 * 60 * 60 * 1000);
      expect(new Date(token.expiresAt).getTime()).toBe(payload.exp * 1000);
    });

    it('nao faz chamada de rede para assinar', () => {
      build().signPlayback('pb-1');

      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('verifyWebhookSignature', () => {
    const body = '{"type":"video.asset.ready"}';

    function signatureFor(timestamp: number, payload = body, secret = ENV.MUX_WEBHOOK_SECRET) {
      const digest = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');

      return `t=${timestamp},v1=${digest}`;
    }

    it('aceita uma assinatura valida e recente', () => {
      const timestamp = Math.floor(Date.now() / 1000);

      expect(build().verifyWebhookSignature(body, signatureFor(timestamp))).toBe(true);
    });

    it('recusa assinatura calculada com outro segredo', () => {
      const timestamp = Math.floor(Date.now() / 1000);

      expect(build().verifyWebhookSignature(body, signatureFor(timestamp, body, 'outro'))).toBe(
        false,
      );
    });

    it('recusa assinatura de um corpo diferente do recebido', () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const assinatura = signatureFor(timestamp, '{"type":"video.asset.errored"}');

      expect(build().verifyWebhookSignature(body, assinatura)).toBe(false);
    });

    it('recusa assinatura antiga, para nao aceitar replay', () => {
      const antigo = Math.floor(Date.now() / 1000) - 60 * 60;

      expect(build().verifyWebhookSignature(body, signatureFor(antigo))).toBe(false);
    });

    it('recusa header ausente ou malformado', () => {
      expect(build().verifyWebhookSignature(body, '')).toBe(false);
      expect(build().verifyWebhookSignature(body, 'nada-disso')).toBe(false);
    });
  });
});
