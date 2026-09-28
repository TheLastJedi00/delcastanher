import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { NoStore } from '../common/cache-control.decorator';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { PublishLegalDocumentDto } from './dto/publish-legal-document.dto';
import { SaveLegalDraftDto } from './dto/save-legal-draft.dto';
import { LegalDocumentsService } from './legal-documents.service';
import { ParseLegalKindPipe } from './legal-kind.pipe';
import type {
  AdminLegalDocumentsView,
  AdminLegalDraft,
  AdminLegalVersion,
  LegalDocumentKind,
} from './legal.types';

/**
 * Documentos legais no painel (Spec 022).
 *
 * Guards na classe, como em todo controller administrativo. **Nao ha** rota
 * que altere ou apague versao publicada (decisao 2): o que se edita e o
 * rascunho, e publicar cria uma versao nova.
 */
@Controller('admin/legal/documents')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles('admin')
@NoStore()
export class AdminLegalController {
  constructor(private readonly legal: LegalDocumentsService) {}

  /** Os tres documentos: vigente, rascunho e autor. */
  @Get()
  list(): Promise<AdminLegalDocumentsView> {
    return this.legal.adminList();
  }

  /** Salva o rascunho, sobrescrevendo o anterior. */
  @Put(':kind/draft')
  saveDraft(
    @CurrentUser() user: AuthUser,
    @Param('kind', ParseLegalKindPipe) kind: LegalDocumentKind,
    @Body() dto: SaveLegalDraftDto,
  ): Promise<AdminLegalDraft> {
    return this.legal.saveDraft(user, kind, dto.content);
  }

  /** Descarta o rascunho. O texto publicado nao muda. */
  @Delete(':kind/draft')
  @HttpCode(HttpStatus.NO_CONTENT)
  discardDraft(@Param('kind', ParseLegalKindPipe) kind: LegalDocumentKind): Promise<void> {
    return this.legal.discardDraft(kind);
  }

  /** Publica o rascunho como nova versao ou correcao (decisao 3). */
  @Post(':kind/publish')
  publish(
    @CurrentUser() user: AuthUser,
    @Param('kind', ParseLegalKindPipe) kind: LegalDocumentKind,
    @Body() dto: PublishLegalDocumentDto,
  ): Promise<AdminLegalVersion> {
    return this.legal.publish(user, kind, dto.changeKind);
  }

  /** Historico, da mais recente para a mais antiga. */
  @Get(':kind/versions')
  versions(@Param('kind', ParseLegalKindPipe) kind: LegalDocumentKind): Promise<AdminLegalVersion[]> {
    return this.legal.versions(kind);
  }
}
