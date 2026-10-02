import type { NfeBody } from './notaas/nfe-builder';

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

/** Status da Notaas. */
export type ProviderInvoiceStatus =
  | 'queued'
  | 'processing'
  | 'issued'
  | 'error'
  | 'cancelled'
  | 'inutilized';

/** Retrato da nota na Notaas, ja nos nomes desta plataforma. */
export interface ProviderInvoice {
  providerInvoiceId: string;
  status: ProviderInvoiceStatus;
  /** 1 = producao, 2 = homologacao. */
  tpAmb: number | null;
  number: string | null;
  series: string | null;
  accessKey: string | null;
  protocol: string | null;
  issuedAt: Date | null;
  cancelledAt: Date | null;
  /** `codigoStatus`, `motivo` e `errorMessage`, crus, no `error`. */
  errorDetail: string | null;
}

/** Desfecho do cancelamento (decisao A7). */
export type CancelResult =
  | { kind: 'accepted' }
  | { kind: 'expired'; message: string }
  | { kind: 'refused'; message: string };

export interface InvoiceGateway {
  emit(body: NfeBody): Promise<EmitResult>;
  status(providerInvoiceId: string): Promise<ProviderInvoice>;
  cancel(providerInvoiceId: string, reason: string): Promise<CancelResult>;
  downloadPdf(providerInvoiceId: string): Promise<Buffer>;
  downloadXml(providerInvoiceId: string, type?: 'emission' | 'cancel'): Promise<Buffer>;
}
