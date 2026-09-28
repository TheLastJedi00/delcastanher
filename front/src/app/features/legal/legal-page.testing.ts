import { HttpTestingController } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { LegalDocumentKind, PublicLegalDocument } from '../../core/services/legal-documents.service';

/**
 * Responde as leituras de um documento legal: a do transfer cache e a da rede
 * (Spec 022, decisao 4). `null` e o documento nao publicado (404).
 */
export function flushLegalDocument(
  backend: HttpTestingController,
  kind: LegalDocumentKind,
  doc: PublicLegalDocument | null,
): void {
  const url = `${environment.apiUrl}/legal/documents/${kind.toLowerCase()}`;

  // No navegador sao duas leituras em sequencia: a segunda so sai depois da
  // primeira responder.
  for (let attempt = 0; attempt < 2; attempt++) {
    for (const request of backend.match(url)) {
      if (doc) {
        request.flush(doc);
      } else {
        request.flush({ message: 'Não publicado', code: 'LEGAL_DOCUMENT_UNPUBLISHED' }, { status: 404, statusText: 'Not Found' });
      }
    }
  }
}

export function legalDocument(
  kind: LegalDocumentKind,
  content: string,
  policyVersion = '2026-09-13',
): PublicLegalDocument {
  return { kind, content, policyVersion, publishedAt: '2026-09-13T15:00:00.000Z' };
}
