import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { ContentService } from './content.service';
import type { MaterialItem, PlaybackGrant } from './content.types';
import { VideoService } from './video.service';

/**
 * Conteudo como o aluno o consome. Exige sessao e nada alem disso: toda a
 * plataforma e paga e o portao, hoje, e estar autenticado (decisao 6) — o
 * vinculo com matricula entra neste mesmo ponto quando existir.
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
   * precisa saber que o modulo existe e o video ainda nao, e nao receber um
   * player que so falha (decisoes 5 e 6).
   */
  @Get('modules/:moduleId/playback-token')
  playbackToken(@Param('moduleId') moduleId: string): Promise<PlaybackGrant> {
    return this.video.createPlaybackToken(moduleId);
  }

  /** Materiais do modulo, ja com a URL assinada de download. */
  @Get('modules/:moduleId/materials')
  listByModule(@Param('moduleId') moduleId: string): Promise<MaterialItem[]> {
    return this.content.listForModule(moduleId);
  }

  /** Central de materiais: tudo o que o curso disponibiliza, por modulo. */
  @Get('materials')
  listAll(): Promise<MaterialItem[]> {
    return this.content.listForCourse();
  }
}
