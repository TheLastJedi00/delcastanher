import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ContentService } from './content.service';
import type { MaterialItem, UploadTicket } from './content.types';
import { ConfirmMaterialDto, MaterialUploadUrlDto } from './dto/material.dto';

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
  constructor(private readonly content: ContentService) {}

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
