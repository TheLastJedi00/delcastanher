import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { ContentService } from './content.service';
import type { MaterialItem, PlaybackGrant } from './content.types';
import { VideoService } from './video.service';

/**
 * Conteudo como o aluno o consome. Exige sessao e nada alem disso: toda a
 * plataforma e paga e o portao, hoje, e estar autenticado (Spec 010, decisao
 * 6) — o vinculo com matricula entra neste mesmo ponto quando existir.
 *
 * As rotas sao por **aula** desde a Spec 012 (decisao 10): o que protege o
 * conteudo nao mudou, mudou quem e o dono dele.
 */
@Controller()
@UseGuards(FirebaseAuthGuard)
export class ContentController {
  constructor(
    private readonly content: ContentService,
    private readonly video: VideoService,
  ) {}

  /**
   * Autorizacao de reproducao. 409 enquanto o video nao esta pronto: o aluno
   * precisa saber que a aula existe e o video ainda nao, e nao receber um
   * player que so falha (Spec 010, decisoes 5 e 6).
   */
  @Get('lessons/:lessonId/playback-token')
  playbackToken(@Param('lessonId') lessonId: string): Promise<PlaybackGrant> {
    return this.video.createPlaybackToken(lessonId);
  }

  /** Materiais da aula, ja com a URL assinada de download. */
  @Get('lessons/:lessonId/materials')
  listByLesson(@Param('lessonId') lessonId: string): Promise<MaterialItem[]> {
    return this.content.listForLesson(lessonId);
  }

  /** Central de materiais: tudo o que o curso disponibiliza, por modulo e aula. */
  @Get('materials')
  listAll(): Promise<MaterialItem[]> {
    return this.content.listForCourse();
  }
}
