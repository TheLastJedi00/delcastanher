import { ChangeDetectionStrategy, Component, OnInit, computed, inject } from '@angular/core';
import {
  AdminLegalDocument,
  AdminLegalService,
  LEGAL_DOCUMENT_KINDS,
  LEGAL_DOCUMENT_TITLES,
  LegalDocumentKind,
  LegalDocumentVersion,
} from '../../../core/services/admin-legal.service';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { SectionHeader } from '../../../shared/ui/section-header/section-header';

/** Data no formato da tela: 13/09/2026. */
export function formatLegalDate(value: string): string {
  return new Date(value).toLocaleDateString('pt-BR');
}

/** "versão 2026-09-13, em 13/09/2026 por fulano@x" — a linha de autoria de uma versão. */
export function describeVersion(version: LegalDocumentVersion): string {
  const author = version.publishedByEmail ? ` por ${version.publishedByEmail}` : ' (carga inicial)';

  return `versão ${version.policyVersion}, em ${formatLegalDate(version.publishedAt)}${author}`;
}

/**
 * Aba "Politicas & Termos" do painel (Spec 022).
 *
 * Mora num componente proprio, como o `AdminFinanceiro`: a aba deixa de ser
 * maquete e ganha lista, editor, publicacao e historico, que nao cabem no
 * template do `AdminDashboard`.
 */
@Component({
  selector: 'app-admin-politicas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Badge, Button, Card, SectionHeader],
  templateUrl: './admin-politicas.html',
})
export class AdminPoliticas implements OnInit {
  protected readonly legal = inject(AdminLegalService);

  protected readonly titles = LEGAL_DOCUMENT_TITLES;

  /**
   * Os tres documentos, sempre na mesma ordem e sempre os tres: um documento
   * que a API nao devolver aparece como nao publicado, e nao some da lista.
   */
  protected readonly documents = computed<AdminLegalDocument[]>(() => {
    const loaded = this.legal.result()?.documents ?? [];

    return LEGAL_DOCUMENT_KINDS.map(
      kind => loaded.find(doc => doc.kind === kind) ?? { kind, current: null, draft: null },
    );
  });

  ngOnInit(): void {
    this.reload();
  }

  protected reload(): void {
    this.legal.load().subscribe({ error: () => undefined });
  }

  protected status(doc: AdminLegalDocument): string {
    return doc.current ? `Publicado — ${describeVersion(doc.current)}` : 'Não publicado';
  }

  protected date(value: string): string {
    return formatLegalDate(value);
  }

  protected title(kind: LegalDocumentKind): string {
    return this.titles[kind];
  }
}
