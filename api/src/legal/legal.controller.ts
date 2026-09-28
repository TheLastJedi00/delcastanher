import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { PublicCache } from '../common/cache-control.decorator';
import { LegalDocumentsService } from './legal-documents.service';
import { ParseLegalKindPipe } from './legal-kind.pipe';
import type { LegalDocumentKind, PublicLegalDocument } from './legal.types';

/**
 * Leitura publica dos documentos legais (Spec 022), **sem sessao**: as paginas
 * legais sao abertas a qualquer visitante, e o banner de cookies de toda pagina
 * pergunta a versao da politica.
 *
 * Nenhuma resposta daqui depende de quem pede, e por isso nenhuma rota le
 * cookie ou `Authorization` (decisao 16).
 */
@Controller('legal')
export class LegalController {
  constructor(private readonly legal: LegalDocumentsService) {}

  /**
   * Versao publicada vigente; 404 enquanto o documento nao foi publicado. O
   * 404 tambem vai para a CDN (decisao 16).
   */
  @Get('documents/:kind')
  @PublicCache()
  async document(@Param('kind', ParseLegalKindPipe) kind: LegalDocumentKind): Promise<PublicLegalDocument> {
    const current = await this.legal.current(kind);

    if (!current) {
      throw new NotFoundException('Este documento ainda não foi publicado.');
    }

    return {
      kind: current.kind,
      content: current.content,
      policyVersion: current.policyVersion,
      publishedAt: current.publishedAt,
    };
  }

  /**
   * A versao da politica vigente, do conjunto dos tres documentos (decisao 8),
   * e quais estao publicados — o rotulo do aceite no onboarding lista so eles
   * (decisao 6).
   */
  @Get('policy-version')
  @PublicCache()
  async policyVersion(): Promise<{ version: string | null; published: LegalDocumentKind[] }> {
    const [version, published] = await Promise.all([this.legal.policyVersion(), this.legal.published()]);

    return { version, published };
  }
}
