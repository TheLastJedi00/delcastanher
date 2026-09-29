import type {
  LegalChangeKind,
  LegalDocumentDraft,
  LegalDocumentKind,
  LegalDocumentVersion,
} from '../generated/prisma/client';

export type { LegalChangeKind, LegalDocumentKind };

/** A ordem em que o painel e as paginas listam os documentos. */
export const LEGAL_DOCUMENT_KINDS: readonly LegalDocumentKind[] = ['TERMS', 'PRIVACY', 'COOKIES'];

/** Linha de versao publicada, como vem do banco. */
export type LegalVersionRow = LegalDocumentVersion;

/** A publicacao que o painel pode pedir; `INITIAL` e so da carga. */
export type PublishChangeKind = Exclude<LegalChangeKind, 'INITIAL'>;

/** `GET /legal/documents/:kind`: o que a pagina publica precisa. */
export interface PublicLegalDocument {
  kind: LegalDocumentKind;
  content: string;
  policyVersion: string;
  publishedAt: Date;
}

/** Versao no painel, com o autor; o UID nao sai da API. */
export interface AdminLegalVersion {
  id: string;
  kind: LegalDocumentKind;
  content: string;
  policyVersion: string;
  changeKind: LegalChangeKind;
  publishedAt: Date;
  publishedByEmail: string | null;
}

export interface AdminLegalDraft {
  content: string;
  updatedAt: Date;
  updatedByEmail: string;
}

export interface AdminLegalDocument {
  kind: LegalDocumentKind;
  current: AdminLegalVersion | null;
  draft: AdminLegalDraft | null;
}

/** `GET /admin/legal/documents`. */
export interface AdminLegalDocumentsView {
  policyVersion: string | null;
  documents: AdminLegalDocument[];
}

export function toAdminVersion(row: LegalVersionRow): AdminLegalVersion {
  return {
    id: row.id,
    kind: row.kind,
    content: row.content,
    policyVersion: row.policyVersion,
    changeKind: row.changeKind,
    publishedAt: row.publishedAt,
    publishedByEmail: row.publishedByEmail,
  };
}

export function toAdminDraft(row: LegalDocumentDraft): AdminLegalDraft {
  return { content: row.content, updatedAt: row.updatedAt, updatedByEmail: row.updatedByEmail };
}
