import { HttpClient, HttpContext, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, of, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { PUBLIC_REQUEST } from '../interceptors/auth.interceptor';

/** Os tres documentos legais (Spec 022). */
export type LegalDocumentKind = 'TERMS' | 'PRIVACY' | 'COOKIES';

/** A ordem em que o painel e o aceite listam os documentos. */
export const LEGAL_DOCUMENT_KINDS: readonly LegalDocumentKind[] = ['TERMS', 'PRIVACY', 'COOKIES'];

export const LEGAL_DOCUMENT_TITLES: Record<LegalDocumentKind, string> = {
  TERMS: 'Termos de Uso',
  PRIVACY: 'Política de Privacidade',
  COOKIES: 'Política de Cookies',
};

/** Rota publica de cada documento, a que o rodape e o aceite linkam. */
export const LEGAL_DOCUMENT_PATHS: Record<LegalDocumentKind, string> = {
  TERMS: '/termos-de-uso',
  PRIVACY: '/politica-de-privacidade',
  COOKIES: '/politica-de-cookies',
};

/** Versao publicada vigente de um documento. */
export interface PublicLegalDocument {
  kind: LegalDocumentKind;
  /** Texto no formato do `parseLegalText`. */
  content: string;
  policyVersion: string;
  publishedAt: string;
}

/** `GET /legal/policy-version`. */
export interface PolicyStatus {
  /** Versao da politica vigente; nula sem publicacao nenhuma. */
  version: string | null;
  /** Documentos publicados, na ordem do painel. */
  published: LegalDocumentKind[];
}

/**
 * 404 de documento sem versao publicada. So ele vira "em preparacao": um 404
 * sem este codigo e rota inexistente — uma API antiga no ar, por exemplo — e
 * nao pode fazer a Politica de Privacidade aparecer como nao publicada.
 */
function isUnpublished(error: HttpErrorResponse): boolean {
  const body = error.error as { code?: string } | null;

  return error.status === 404 && body?.code === 'LEGAL_DOCUMENT_UNPUBLISHED';
}

/**
 * Leitura publica dos documentos legais (Spec 022).
 *
 * As chamadas saem **sem** token (`PUBLIC_REQUEST`): as rotas tem cache na CDN
 * e respondem igual para todos (decisao 16). `fresh` pula o transfer cache da
 * hidratacao e vai a rede — e o que a pagina usa, no navegador, para trocar o
 * texto do build pelo publicado agora (decisao 4).
 */
@Injectable({ providedIn: 'root' })
export class LegalDocumentsService {
  private readonly http = inject(HttpClient);

  /** O documento vigente, ou nulo enquanto nao foi publicado (404). */
  document(kind: LegalDocumentKind, fresh = false): Observable<PublicLegalDocument | null> {
    return this.http
      .get<PublicLegalDocument>(`${environment.apiUrl}/legal/documents/${kind.toLowerCase()}`, {
        context: new HttpContext().set(PUBLIC_REQUEST, true),
        transferCache: !fresh,
      })
      .pipe(
        catchError((error: HttpErrorResponse) =>
          isUnpublished(error) ? of(null) : throwError(() => error),
        ),
      );
  }

  /** A versao da politica vigente e os documentos publicados. */
  policyStatus(fresh = false): Observable<PolicyStatus> {
    return this.http.get<PolicyStatus>(`${environment.apiUrl}/legal/policy-version`, {
      context: new HttpContext().set(PUBLIC_REQUEST, true),
      transferCache: !fresh,
    });
  }
}
