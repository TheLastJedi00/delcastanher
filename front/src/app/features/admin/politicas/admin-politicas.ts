import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import {
  AdminLegalDocument,
  AdminLegalService,
  LEGAL_DOCUMENT_KINDS,
  LEGAL_DOCUMENT_TITLES,
  LegalDocumentKind,
  LegalDocumentVersion,
} from '../../../core/services/admin-legal.service';
import { parseLegalText } from '../../legal/parse-legal-text';
import { LegalSections } from '../../legal/legal-sections';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { Input } from '../../../shared/ui/input/input';
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
  imports: [Badge, Button, Card, Input, LegalSections, SectionHeader],
  host: { '(window:beforeunload)': 'onBeforeUnload($event)' },
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

  /** Documento aberto no editor; nulo na lista. */
  protected readonly editing = signal<LegalDocumentKind | null>(null);
  /** Texto no editor. */
  protected readonly content = signal('');
  /** Texto ao abrir ou ao salvar por ultimo: e contra ele que se mede "nao salvo". */
  private readonly saved = signal('');

  protected readonly dirty = computed(() => this.content() !== this.saved());
  protected readonly saving = signal(false);
  protected readonly editorError = signal<string | null>(null);

  /** O documento aberto, como veio da API. */
  protected readonly editingDoc = computed(() => {
    const kind = this.editing();

    return kind ? (this.documents().find(doc => doc.kind === kind) ?? null) : null;
  });

  /**
   * Pre-visualizacao pelo mesmo parser e pelo mesmo componente da pagina
   * publica (decisao 1): o que se ve aqui e o que o aluno vai ler.
   */
  protected readonly preview = computed(() => parseLegalText(this.content()));

  ngOnInit(): void {
    this.reload();
  }

  protected reload(): void {
    this.legal.load().subscribe({ error: () => undefined });
  }

  /** Abre o rascunho ou, sem rascunho, o texto publicado. */
  protected open(doc: AdminLegalDocument): void {
    const text = doc.draft?.content ?? doc.current?.content ?? '';

    this.editorError.set(null);
    this.content.set(text);
    this.saved.set(text);
    this.editing.set(doc.kind);
  }

  /** Volta para a lista; com alteracao nao salva, pergunta antes. */
  protected close(): void {
    if (this.dirty() && !confirm('Sair do editor? As alterações não salvas serão perdidas.')) {
      return;
    }

    this.editing.set(null);
    this.editorError.set(null);
  }

  protected saveDraft(): void {
    const kind = this.editing();

    if (!kind) {
      return;
    }

    const text = this.content();

    this.saving.set(true);
    this.editorError.set(null);
    this.legal.saveDraft(kind, text).subscribe({
      next: () => {
        this.saving.set(false);
        this.saved.set(text);
      },
      error: (message: string) => {
        this.saving.set(false);
        this.editorError.set(message);
      },
    });
  }

  /** Descarta o rascunho e volta ao texto publicado. O site nao muda. */
  protected discardDraft(): void {
    const kind = this.editing();

    if (!kind || !confirm('Descartar o rascunho? O texto publicado continua no ar, sem mudança.')) {
      return;
    }

    this.saving.set(true);
    this.editorError.set(null);
    this.legal.discardDraft(kind).subscribe({
      next: () => {
        this.saving.set(false);
        const text = this.editingDoc()?.current?.content ?? '';
        this.content.set(text);
        this.saved.set(text);
      },
      error: (message: string) => {
        this.saving.set(false);
        this.editorError.set(message);
      },
    });
  }

  /** Fechar a aba do navegador com texto nao salvo tambem pergunta. */
  protected onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.editing() && this.dirty()) {
      event.preventDefault();
    }
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
