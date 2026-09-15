import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ContentService } from './content.service';
import type { LessonVideoState, MaterialItem, UploadTicket } from './content.types';
import { ConfirmMaterialDto, MaterialUploadUrlDto } from './dto/material.dto';
import { ConfirmVideoDto, VideoUploadUrlDto } from './dto/video.dto';
import { VideoService } from './video.service';

/**
 * Gestao de conteudo pelo administrador.
 *
 * Os dois guards sao aplicados na classe inteira, e nao por rota: aqui
 * **nenhum** endpoint e para aluno, e deixar a protecao no metodo faria da
 * proxima rota adicionada um furo por esquecimento (Spec 010, decisao 13).
 *
 * Desde a Spec 012 o dono do conteudo e a **aula**: as rotas
 * `/admin/modules/:moduleId/video|materials` deram lugar as de
 * `/admin/lessons/:lessonId/...` (decisao 10). A estrutura da grade — criar,
 * renomear e reordenar modulo e aula — vive no `AdminLessonsController`.
 */
@Controller('admin')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles('admin')
export class AdminContentController {
  constructor(
    private readonly content: ContentService,
    private readonly video: VideoService,
  ) {}

  /** Passo 1 do video: URL assinada de escrita no bucket. */
  @Post('lessons/:lessonId/video/upload-url')
  videoUploadUrl(
    @Param('lessonId') lessonId: string,
    @Body() dto: VideoUploadUrlDto,
  ): Promise<UploadTicket> {
    return this.video.createUploadUrl(lessonId, dto);
  }

  /**
   * Passo 3 do video: com o arquivo no bucket, a API assina uma URL de leitura
   * e o Mux puxa dela. Um upload, dois destinos (Spec 010, decisao 4).
   */
  @Post('lessons/:lessonId/video')
  confirmVideo(
    @Param('lessonId') lessonId: string,
    @Body() dto: ConfirmVideoDto,
  ): Promise<LessonVideoState> {
    return this.video.confirmUpload(lessonId, dto);
  }

  /** Estado do processamento, consultado pelo painel enquanto o Mux ingere. */
  @Get('lessons/:lessonId/video')
  videoState(@Param('lessonId') lessonId: string): Promise<LessonVideoState> {
    return this.video.getState(lessonId);
  }

  /** Passo 1: URL assinada para o navegador enviar o arquivo direto ao bucket. */
  @Post('lessons/:lessonId/materials/upload-url')
  materialUploadUrl(
    @Param('lessonId') lessonId: string,
    @Body() dto: MaterialUploadUrlDto,
  ): Promise<UploadTicket> {
    return this.content.createMaterialUploadUrl(lessonId, dto);
  }

  /** Passo 3: confirmacao do upload; e aqui que a referencia entra no banco. */
  @Post('lessons/:lessonId/materials')
  confirmMaterial(
    @Param('lessonId') lessonId: string,
    @Body() dto: ConfirmMaterialDto,
  ): Promise<MaterialItem> {
    return this.content.confirmMaterial(lessonId, dto);
  }

  /** Materiais ja enviados, para o painel listar e permitir remover. */
  @Get('lessons/:lessonId/materials')
  listMaterials(@Param('lessonId') lessonId: string): Promise<MaterialItem[]> {
    return this.content.listForLesson(lessonId);
  }

  @Delete('materials/:id')
  @HttpCode(204)
  removeMaterial(@Param('id') id: string): Promise<void> {
    return this.content.removeMaterial(id);
  }
}
