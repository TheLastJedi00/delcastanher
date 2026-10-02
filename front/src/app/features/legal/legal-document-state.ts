import { isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID, Signal, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { LoadResult, buildThenBrowser } from '../../core/services/build-then-browser';
import {
  LegalDocumentKind,
  LegalDocumentsService,
  PublicLegalDocument,
} from '../../core/services/legal-documents.service';
import { LegalPageState } from './legal-page';
import { parseLegalText } from './parse-legal-text';

/** Converte a leitura da API no estado da pagina. */
export function toLegalPageState(
  result: LoadResult<PublicLegalDocument | null>,
  isBrowser: boolean,
): LegalPageState {
  if (!result.ok) {
    // No build, a falha vira carregamento: o navegador completa ao hidratar, e
    // o build nao quebra por causa da API (decisao 4).
    return isBrowser ? { status: 'error' } : { status: 'loading' };
  }

  const doc = result.value;

  return doc
    ? {
        status: 'ready',
        sections: parseLegalText(doc.content),
        policyVersion: doc.policyVersion,
        publishedAt: doc.publishedAt,
      }
    : { status: 'unpublished' };
}

/**
 * Estado de uma pagina legal, lido da versao publicada (Spec 022, decisao 4):
 * no build a pagina sai pre-renderizada com o texto do momento, e no
 * navegador busca de novo e troca se a versao for outra.
 *
 * Chamar em contexto de injecao (inicializador de campo do componente).
 */
export function legalDocumentState(kind: LegalDocumentKind): Signal<LegalPageState> {
  const documents = inject(LegalDocumentsService);
  const isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  return toSignal(
    buildThenBrowser(fresh => documents.document(kind, fresh), isBrowser).pipe(
      map(result => toLegalPageState(result, isBrowser)),
    ),
    { initialValue: { status: 'loading' } },
  );
}
