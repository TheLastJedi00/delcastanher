import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminLegalController } from './admin-legal.controller';
import { LegalController } from './legal.controller';
import { LegalDocumentsService } from './legal-documents.service';

/**
 * Documentos legais (Spec 022): Termos de Uso, Politica de Privacidade e
 * Politica de Cookies, com versoes publicadas e rascunho. Exporta o servico
 * porque o aceite do onboarding valida a versao da politica por ele.
 */
@Module({
  imports: [AuthModule],
  controllers: [LegalController, AdminLegalController],
  providers: [LegalDocumentsService],
  exports: [LegalDocumentsService],
})
export class LegalModule {}
