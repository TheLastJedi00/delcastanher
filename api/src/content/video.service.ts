import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { MuxService } from '../mux/mux.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { LessonVideoState, MuxWebhookEvent, PlaybackGrant, UploadTicket, VideoStatus } from './content.types';

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

/** Aula como vem do banco, no que o video usa. */
interface LessonRow {
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
  durationSeconds: number | null;
}

/**
 * Video da aula: upload para o Storage, ingestao no Mux e playback assinado.
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
  async createUploadUrl(lessonId: string, input: VideoUploadInput): Promise<UploadTicket> {
    await this.requireLesson(lessonId);

    return this.storage.createUploadUrl({
      kind: 'video',
      lessonId,
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
  async confirmUpload(lessonId: string, input: VideoConfirmInput): Promise<LessonVideoState> {
    const lesson = (await this.requireLesson(lessonId)) as LessonRow;

    if (!input.storagePath?.startsWith(`lessons/${lessonId}/video/`)) {
      throw new BadRequestException('O arquivo enviado nao pertence a esta aula.');
    }

    const uploaded = await this.storage.requireUploaded(input.storagePath);

    // Substituir o video de uma aula apaga o asset anterior: deixa-lo vivo
    // manteria a aula antiga reproduzivel por quem guardou o playbackId, e
    // seguiria sendo cobrado.
    if (lesson.muxAssetId) {
      await this.mux.deleteAsset(lesson.muxAssetId).catch((error: Error) => {
        this.logger.warn(`Falha ao apagar o asset ${lesson.muxAssetId} no Mux: ${error.message}`);
      });
    }

    // O objeto antigo so sai do bucket quando o caminho muda; com o mesmo nome
    // o PUT ja o sobrescreveu.
    if (lesson.videoStoragePath && lesson.videoStoragePath !== input.storagePath) {
      await this.storage.remove(lesson.videoStoragePath);
    }

    const ingest = await this.storage.createReadUrl(input.storagePath, INGEST_URL_TTL_SECONDS);
    const asset = await this.mux.createAsset(ingest.url);

    const updated = (await this.prisma.lesson.update({
      where: { id: lessonId },
      data: {
        videoStoragePath: input.storagePath,
        videoOriginalName: input.fileName.trim(),
        videoSizeBytes: uploaded.sizeBytes,
        muxAssetId: asset.assetId,
        muxPlaybackId: asset.playbackId,
        videoStatus: asset.status,
        videoError: null,
      },
    })) as LessonRow;

    return this.toState(updated);
  }

  /**
   * Estado da ingestao para o painel. Enquanto o video processa, o Mux e
   * reconsultado: o webhook e a fonte oficial (decisao 5), mas ele nao alcanca
   * um `localhost`, e sem esta reconsulta o painel ficaria preso em
   * PROCESSING durante todo o desenvolvimento.
   */
  async getState(lessonId: string): Promise<LessonVideoState> {
    const lesson = (await this.requireLesson(lessonId)) as LessonRow;

    if (lesson.videoStatus !== 'PROCESSING' || !lesson.muxAssetId) {
      return this.toState(lesson);
    }

    try {
      const asset = await this.mux.getAsset(lesson.muxAssetId);

      if (asset.status === lesson.videoStatus) {
        return this.toState(lesson);
      }

      const updated = (await this.prisma.lesson.update({
        where: { id: lessonId },
        data: {
          videoStatus: asset.status,
          muxPlaybackId: asset.playbackId ?? lesson.muxPlaybackId,
          videoError:
            asset.status === 'ERRORED'
              ? (asset.error ?? 'O Mux nao conseguiu processar o arquivo.')
              : null,
        },
      })) as LessonRow;

      return this.toState(updated);
    } catch (error) {
      // Mux fora do ar nao pode derrubar a tela do admin: o estado gravado
      // continua sendo a melhor resposta disponivel.
      this.logger.warn(`Nao foi possivel reconsultar o asset da aula ${lessonId}.`, error as Error);

      return this.toState(lesson);
    }
  }

  /**
   * Token de playback do aluno. Os assets tem policy `signed`: o playbackId
   * sozinho nao reproduz nada, e um id vazado em print nao vira acesso
   * vitalicio ao curso (decisao 6).
   */
  async createPlaybackToken(lessonId: string): Promise<PlaybackGrant> {
    const state = await this.getState(lessonId);

    if (!state.hasVideo) {
      throw new ConflictException('Esta aula ainda nao tem video publicado.');
    }

    if (state.status !== 'READY' || !state.playbackId) {
      throw new ConflictException(
        state.status === 'ERRORED'
          ? 'O video desta aula falhou no processamento. Avise o suporte.'
          : 'O video desta aula ainda esta sendo processado. Tente de novo em instantes.',
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
      await this.prisma.lesson.updateMany({
        where: { muxAssetId: assetId },
        data: {
          videoStatus: 'READY',
          videoError: null,
          ...(event.data.playback_ids?.[0]?.id
            ? { muxPlaybackId: event.data.playback_ids[0].id }
            : {}),
          // A duracao vem do proprio Mux (decisao 18) e alimenta o tempo na
          // trilha horizontal. Evento sem `duration` nao apaga a que ja
          // existe: o campo simplesmente nao entra no update.
          ...(typeof event.data.duration === 'number'
            ? { durationSeconds: Math.round(event.data.duration) }
            : {}),
        },
      });

      return;
    }

    if (event.type === 'video.asset.errored') {
      await this.prisma.lesson.updateMany({
        where: { muxAssetId: assetId },
        data: {
          videoStatus: 'ERRORED',
          videoError:
            event.data.errors?.messages?.join(' ') ?? 'O Mux nao conseguiu processar o arquivo.',
        },
      });
    }

    // Evento fora desses dois nao diz nada sobre o estado da aula: ignorar e
    // o tratamento correto, e responder 200 evita reentrega infinita do Mux.
  }

  private async requireLesson(lessonId: string) {
    const lesson = await this.prisma.lesson.findUnique({ where: { id: lessonId } });

    if (!lesson) {
      throw new NotFoundException(`Aula "${lessonId}" nao encontrada.`);
    }

    return lesson;
  }

  private toState(lesson: LessonRow): LessonVideoState {
    return {
      lessonId: lesson.id,
      hasVideo: Boolean(lesson.videoStoragePath),
      status: lesson.videoStatus,
      playbackId: lesson.muxPlaybackId,
      fileName: lesson.videoOriginalName,
      sizeBytes: lesson.videoSizeBytes,
      error: lesson.videoError,
      durationSeconds: lesson.durationSeconds,
    };
  }
}
