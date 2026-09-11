import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { MuxService } from '../mux/mux.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { ModuleVideoState, MuxWebhookEvent, PlaybackGrant, UploadTicket, VideoStatus } from './content.types';

/** Pedido de URL de escrita do video. */
export interface VideoUploadInput {
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

/** Confirmacao do upload do video. */
export interface VideoConfirmInput {
  storagePath: string;
  fileName: string;
  contentType: string;
}

/**
 * Validade da URL que o Mux recebe como `input`. Precisa cobrir o download do
 * arquivo inteiro pelo lado do Mux, nao apenas o instante da chamada.
 */
const INGEST_URL_TTL_SECONDS = 60 * 60;

/** Modulo como vem do banco, no que o video usa. */
interface ModuleRow {
  id: string;
  order: number;
  title: string;
  videoStoragePath: string | null;
  videoOriginalName: string | null;
  videoSizeBytes: number | null;
  muxAssetId: string | null;
  muxPlaybackId: string | null;
  videoStatus: VideoStatus | null;
  videoError: string | null;
}

/**
 * Video do modulo: upload para o Storage, ingestao no Mux e playback assinado.
 *
 * O arquivo nunca passa pela API (decisao 3) e sobe uma vez so (decisao 4): o
 * Storage e a fonte e o backup, o Mux e a distribuicao.
 */
@Injectable()
export class VideoService {
  private readonly logger = new Logger(VideoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly mux: MuxService,
  ) {}

  /** Passo 1: permissao de escrita direto no bucket. */
  async createUploadUrl(moduleId: string, input: VideoUploadInput): Promise<UploadTicket> {
    await this.requireModule(moduleId);

    return this.storage.createUploadUrl({
      kind: 'video',
      moduleId,
      fileName: input.fileName,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
    });
  }

  /**
   * Passo 3: com o arquivo ja no bucket, gera uma URL assinada de leitura e a
   * entrega ao Mux como `input`. O Mux puxa o arquivo por conta propria — o
   * servidor serverless nunca baixaria e reenviaria um video de aula.
   */
  async confirmUpload(moduleId: string, input: VideoConfirmInput): Promise<ModuleVideoState> {
    const module = (await this.requireModule(moduleId)) as ModuleRow;

    if (!input.storagePath?.startsWith(`modules/${moduleId}/video/`)) {
      throw new BadRequestException('O arquivo enviado nao pertence a este modulo.');
    }

    const uploaded = await this.storage.requireUploaded(input.storagePath);

    // Substituir o video de um modulo apaga o asset anterior: deixa-lo vivo
    // manteria a aula antiga reproduzivel por quem guardou o playbackId, e
    // seguiria sendo cobrado.
    if (module.muxAssetId) {
      await this.mux.deleteAsset(module.muxAssetId).catch((error: Error) => {
        this.logger.warn(`Falha ao apagar o asset ${module.muxAssetId} no Mux: ${error.message}`);
      });
    }

    // O objeto antigo so sai do bucket quando o caminho muda; com o mesmo nome
    // o PUT ja o sobrescreveu.
    if (module.videoStoragePath && module.videoStoragePath !== input.storagePath) {
      await this.storage.remove(module.videoStoragePath);
    }

    const ingest = await this.storage.createReadUrl(input.storagePath, INGEST_URL_TTL_SECONDS);
    const asset = await this.mux.createAsset(ingest.url);

    const updated = (await this.prisma.module.update({
      where: { id: moduleId },
      data: {
        videoStoragePath: input.storagePath,
        videoOriginalName: input.fileName.trim(),
        videoSizeBytes: uploaded.sizeBytes,
        muxAssetId: asset.assetId,
        muxPlaybackId: asset.playbackId,
        videoStatus: asset.status,
        videoError: null,
      },
    })) as ModuleRow;

    return this.toState(updated);
  }

  /**
   * Estado da ingestao para o painel. Enquanto o video processa, o Mux e
   * reconsultado: o webhook e a fonte oficial (decisao 5), mas ele nao alcanca
   * um `localhost`, e sem esta reconsulta o painel ficaria preso em
   * PROCESSING durante todo o desenvolvimento.
   */
  async getState(moduleId: string): Promise<ModuleVideoState> {
    const module = (await this.requireModule(moduleId)) as ModuleRow;

    if (module.videoStatus !== 'PROCESSING' || !module.muxAssetId) {
      return this.toState(module);
    }

    try {
      const asset = await this.mux.getAsset(module.muxAssetId);

      if (asset.status === module.videoStatus) {
        return this.toState(module);
      }

      const updated = (await this.prisma.module.update({
        where: { id: moduleId },
        data: {
          videoStatus: asset.status,
          muxPlaybackId: asset.playbackId ?? module.muxPlaybackId,
          videoError:
            asset.status === 'ERRORED'
              ? (asset.error ?? 'O Mux nao conseguiu processar o arquivo.')
              : null,
        },
      })) as ModuleRow;

      return this.toState(updated);
    } catch (error) {
      // Mux fora do ar nao pode derrubar a tela do admin: o estado gravado
      // continua sendo a melhor resposta disponivel.
      this.logger.warn(`Nao foi possivel reconsultar o asset do modulo ${moduleId}.`, error as Error);

      return this.toState(module);
    }
  }

  /**
   * Token de playback do aluno. Os assets tem policy `signed`: o playbackId
   * sozinho nao reproduz nada, e um id vazado em print nao vira acesso
   * vitalicio ao curso (decisao 6).
   */
  async createPlaybackToken(moduleId: string): Promise<PlaybackGrant> {
    const state = await this.getState(moduleId);

    if (!state.hasVideo) {
      throw new ConflictException('Este modulo ainda nao tem video publicado.');
    }

    if (state.status !== 'READY' || !state.playbackId) {
      throw new ConflictException(
        state.status === 'ERRORED'
          ? 'O video deste modulo falhou no processamento. Avise o suporte.'
          : 'O video deste modulo ainda esta sendo processado. Tente de novo em instantes.',
      );
    }

    const signed = this.mux.signPlayback(state.playbackId);

    return { playbackId: state.playbackId, token: signed.token, expiresAt: signed.expiresAt };
  }

  /**
   * Aplica um evento do webhook. `updateMany` pelo `muxAssetId`: o evento nao
   * conhece o modulo, e um asset que ja nao pertence a ninguem (video
   * substituido) simplesmente nao casa com nenhuma linha.
   */
  async applyWebhookEvent(event: MuxWebhookEvent): Promise<void> {
    const assetId = event.data?.id;

    if (!assetId) {
      return;
    }

    if (event.type === 'video.asset.ready') {
      await this.prisma.module.updateMany({
        where: { muxAssetId: assetId },
        data: {
          videoStatus: 'READY',
          videoError: null,
          ...(event.data.playback_ids?.[0]?.id
            ? { muxPlaybackId: event.data.playback_ids[0].id }
            : {}),
        },
      });

      return;
    }

    if (event.type === 'video.asset.errored') {
      await this.prisma.module.updateMany({
        where: { muxAssetId: assetId },
        data: {
          videoStatus: 'ERRORED',
          videoError:
            event.data.errors?.messages?.join(' ') ?? 'O Mux nao conseguiu processar o arquivo.',
        },
      });
    }

    // Evento fora desses dois nao diz nada sobre o estado do modulo: ignorar e
    // o tratamento correto, e responder 200 evita reentrega infinita do Mux.
  }

  private async requireModule(moduleId: string) {
    const module = await this.prisma.module.findUnique({ where: { id: moduleId } });

    if (!module) {
      throw new NotFoundException(`Modulo "${moduleId}" nao encontrado.`);
    }

    return module;
  }

  private toState(module: ModuleRow): ModuleVideoState {
    return {
      moduleId: module.id,
      hasVideo: Boolean(module.videoStoragePath),
      status: module.videoStatus,
      playbackId: module.muxPlaybackId,
      fileName: module.videoOriginalName,
      sizeBytes: module.videoSizeBytes,
      error: module.videoError,
    };
  }
}
