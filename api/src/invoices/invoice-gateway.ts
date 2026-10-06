import type { NfseEnvironment } from '../config/invoice.config';
import type { NfseBody } from './notaas/nfse-builder';

/**
 * Emissor de nota fiscal, no vocabulario desta plataforma (Spec 023, decisao
 * A1). O `InvoicesService` so fala com esta interface: outro emissor seria
 * outra implementacao dela, e nao uma reescrita do fluxo.
 */
export const INVOICE_GATEWAY = Symbol('INVOICE_GATEWAY');

/**
 * Desfecho da emissao. Os tres casos sao separados de proposito (decisao A2):
 *
 * - `queued`: a nota foi enfileirada, e o id dela tem de ser gravado ja.
 * - `rejected`: recusa de validacao **antes** de enfileirar. Nada foi criado,
 *   e reenviar depois de corrigir e seguro.
 * - `unknown`: a chamada saiu e a resposta nao chegou (timeout, rede, 5xx). A
 *   nota pode existir, e nada deve reenvia-la sozinho.
 */
export type EmitResult =
  | { kind: 'queued'; providerInvoiceId: string }
  | { kind: 'rejected'; message: string }
  | { kind: 'unknown'; message: string };

/** Status da NFS-e na Notaas. */
export type ProviderInvoiceStatus = 'queued' | 'processing' | 'issued' | 'error' | 'cancelled';

/** Retrato da nota na Notaas, ja nos nomes desta plataforma. */
export interface ProviderInvoice {
  providerInvoiceId: string;
  status: ProviderInvoiceStatus;
  /** `ambiente` da consulta, quando a nota sai (Spec 024.2, decisao N4). */
  environment: NfseEnvironment | null;
  number: string | null;
  /** A NFS-e nao tem serie nem protocolo: ficam nulos (decisao N5). */
  series: string | null;
  /** `chNFSe`, o codigo de verificacao. */
  accessKey: string | null;
  protocol: string | null;
  issuedAt: Date | null;
  cancelledAt: Date | null;
  /** `errorCode`, `errorMessage` e `errors[]`, crus, no `error`. */
  errorDetail: string | null;
}

/** Desfecho do cancelamento (decisoes A7 e N7). */
export type CancelResult =
  | { kind: 'accepted' }
  | { kind: 'expired'; message: string }
  | { kind: 'refused'; message: string };

export interface InvoiceGateway {
  emit(body: NfseBody): Promise<EmitResult>;
  status(providerInvoiceId: string): Promise<ProviderInvoice>;
  cancel(providerInvoiceId: string, reason: string): Promise<CancelResult>;
  downloadPdf(providerInvoiceId: string): Promise<Buffer>;
  downloadXml(providerInvoiceId: string, type?: 'emission' | 'cancel'): Promise<Buffer>;
}
