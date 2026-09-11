import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ContentService } from './content.service';
import type { MaterialItem, ModuleVideoState, UploadTicket } from './content.types';
import { ConfirmMaterialDto, MaterialUploadUrlDto } from './dto/material.dto';
import { ConfirmVideoDto, VideoUploadUrlDto } from './dto/video.dto';
import { VideoService } from './video.service';

/**
 * Gestao de conteudo pelo administrador.
 *
 * Os dois guards sao aplicados na classe inteira, e nao por rota: aqui
 * **nenhum** endpoint e para aluno, e deixar a protecao no metodo faria da
 * proxima rota adicionada um furo por esquecimento (decisao 13).
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
  @Post('modules/:moduleId/video/upload-url')
  videoUploadUrl(
    @Param('moduleId') moduleId: string,
    @Body() dto: VideoUploadUrlDto,
  ): Promise<UploadTicket> {
    return this.video.createUploadUrl(moduleId, dto);
  }

  /**
   * Passo 3 do video: com o arquivo no bucket, a API assina uma URL de leitura
   * e o Mux puxa dela. Um upload, dois destinos (decisao 4).
   */
  @Post('modules/:moduleId/video')
  confirmVideo(
    @Param('moduleId') moduleId: string,
    @Body() dto: ConfirmVideoDto,
  ): Promise<ModuleVideoState> {
    return this.video.confirmUpload(moduleId, dto);
  }

  /** Estado do processamento, consultado pelo painel enquanto o Mux ingere. */
  @Get('modules/:moduleId/video')
  videoState(@Param('moduleId') moduleId: string): Promise<ModuleVideoState> {
    return this.video.getState(moduleId);
  }

  /** Passo 1: URL assinada para o navegador enviar o arquivo direto ao bucket. */
  @Post('modules/:moduleId/materials/upload-url')
  materialUploadUrl(
    @Param('moduleId') moduleId: string,
    @Body() dto: MaterialUploadUrlDto,
  ): Promise<UploadTicket> {
    return this.content.createMaterialUploadUrl(moduleId, dto);
  }

  /** Passo 3: confirmacao do upload; e aqui que a referencia entra no banco. */
  @Post('modules/:moduleId/materials')
  confirmMaterial(
    @Param('moduleId') moduleId: string,
    @Body() dto: ConfirmMaterialDto,
  ): Promise<MaterialItem> {
    return this.content.confirmMaterial(moduleId, dto);
  }

  /** Materiais ja enviados, para o painel listar e permitir remover. */
  @Get('modules/:moduleId/materials')
  listMaterials(@Param('moduleId') moduleId: string): Promise<MaterialItem[]> {
    return this.content.listForModule(moduleId);
  }

  @Delete('materials/:id')
  @HttpCode(204)
  removeMaterial(@Param('id') id: string): Promise<void> {
    return this.content.removeMaterial(id);
  }
}
