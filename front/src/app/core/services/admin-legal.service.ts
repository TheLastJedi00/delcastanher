import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, finalize, switchMap, tap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { LegalDocumentKind } from './legal-documents.service';

export type { LegalDocumentKind } from './legal-documents.service';
export { LEGAL_DOCUMENT_KINDS, LEGAL_DOCUMENT_TITLES } from './legal-documents.service';

/**
 * Tipo da publicacao (decisao 3). `INITIAL` e so a carga inicial; o painel
 * escolhe entre as outras duas.
 */
export type LegalChangeKind = 'INITIAL' | 'NEW_VERSION' | 'CORRECTION';

/**
 * Uma versao publicada. Imutavel: nenhuma rota altera nem apaga (decisao 2).
 * O autor e nulo so na carga inicial.
 */
export interface LegalDocumentVersion {
  id: string;
  kind: LegalDocumentKind;
  content: string;
  policyVersion: string;
  changeKind: LegalChangeKind;
  publishedAt: string;
  publishedByEmail: string | null;
}

/** O rascunho, um por documento. Salvar sobrescreve. */
export interface LegalDocumentDraft {
  content: string;
  updatedAt: string;
  updatedByEmail: string;
}

/** Um documento no painel: o que esta no ar e o que esta sendo escrito. */
export interface AdminLegalDocument {
  kind: LegalDocumentKind;
  current: LegalDocumentVersion | null;
  draft: LegalDocumentDraft | null;
}

/** `GET /admin/legal/documents`. */
export interface AdminLegalDocumentsResult {
  /** Versao da politica vigente, do conjunto dos tres; nula sem publicacao. */
  policyVersion: string | null;
  documents: AdminLegalDocument[];
}

/** A publicacao que o painel pode pedir; `INITIAL` e so da carga. */
export type PublishChangeKind = Exclude<LegalChangeKind, 'INITIAL'>;

/**
 * Documentos legais no painel (Spec 022, decisao 11).
 *
 * O contrato segue as rotas do `context.md`. O `kind` vai em minusculas na
 * URL, e a autoria nunca vai no corpo: e o servidor que le quem esta logado,
 * como no cadastro de taxas (Spec 016, decisao 7).
 */
@Injectable({ providedIn: 'root' })
export class AdminLegalService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/admin/legal/documents`;

  private readonly resultState = signal<AdminLegalDocumentsResult | null>(null);
  private readonly loadingState = signal(false);
  private readonly errorState = signal<string | null>(null);

  readonly result = this.resultState.asReadonly();
  readonly loading = this.loadingState.asReadonly();
  readonly error = this.errorState.asReadonly();

  /** Os tres documentos, com vigente e rascunho. */
  load(): Observable<AdminLegalDocumentsResult> {
    this.loadingState.set(true);
    this.errorState.set(null);

    return this.http.get<AdminLegalDocumentsResult>(this.base).pipe(
      tap(result => this.resultState.set(result)),
      catchError((error: HttpErrorResponse) => {
        const message = this.toMessage(error);
        this.errorState.set(message);

        return throwError(() => message);
      }),
      finalize(() => this.loadingState.set(false)),
    );
  }

  /** Salva o rascunho, sobrescrevendo o anterior, e recarrega a lista. */
  saveDraft(kind: LegalDocumentKind, content: string): Observable<AdminLegalDocumentsResult> {
    return this.http
      .put<LegalDocumentDraft>(`${this.url(kind)}/draft`, { content })
      .pipe(this.fail(), switchMap(() => this.load()));
  }

  /** Descarta o rascunho. O texto publicado nao muda. */
  discardDraft(kind: LegalDocumentKind): Observable<AdminLegalDocumentsResult> {
    return this.http
      .delete<void>(`${this.url(kind)}/draft`)
      .pipe(this.fail(), switchMap(() => this.load()));
  }

  /** Publica o rascunho como versao nova ou correcao (decisao 3). */
  publish(
    kind: LegalDocumentKind,
    changeKind: PublishChangeKind,
  ): Observable<AdminLegalDocumentsResult> {
    return this.http
      .post<LegalDocumentVersion>(`${this.url(kind)}/publish`, { changeKind })
      .pipe(this.fail(), switchMap(() => this.load()));
  }

  /** Historico, da mais recente para a mais antiga. */
  versions(kind: LegalDocumentKind): Observable<LegalDocumentVersion[]> {
    return this.http.get<LegalDocumentVersion[]>(`${this.url(kind)}/versions`).pipe(this.fail());
  }

  private url(kind: LegalDocumentKind): string {
    return `${this.base}/${kind.toLowerCase()}`;
  }

  private fail<T>() {
    return catchError<T, Observable<never>>((error: HttpErrorResponse) =>
      throwError(() => this.toMessage(error)),
    );
  }

  /** A mensagem do servidor, quando existe: e ela que diz por que recusou. */
  private toMessage(error: HttpErrorResponse): string {
    if (error.status === 0) {
      return 'Não foi possível falar com o servidor. Verifique sua conexão e tente de novo.';
    }

    const detail = (error.error as { message?: string | string[] })?.message;

    if (Array.isArray(detail) && detail.length) {
      return detail[0];
    }

    return typeof detail === 'string' && detail
      ? detail
      : 'Não foi possível concluir a operação. Tente de novo em instantes.';
  }
}
