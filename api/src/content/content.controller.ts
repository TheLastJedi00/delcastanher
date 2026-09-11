import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { ContentService } from './content.service';
import type { MaterialItem } from './content.types';

/**
 * Conteudo como o aluno o consome. Exige sessao e nada alem disso: toda a
 * plataforma e paga e o portao, hoje, e estar autenticado (decisao 6) — o
 * vinculo com matricula entra neste mesmo ponto quando existir.
 */
@Controller()
@UseGuards(FirebaseAuthGuard)
export class ContentController {
  constructor(private readonly content: ContentService) {}

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
