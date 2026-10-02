import type { InvoiceStatus } from '../generated/prisma/client';

/**
 * A nota como o painel financeiro a lista (Spec 023, decisao A9). Sem caminho
 * do Storage: o PDF sai por URL assinada, e `hasPdf` diz se ha o que baixar.
 */
export interface InvoiceSummary {
  status: InvoiceStatus;
  /** `homologacao` aparece com selo no painel (decisao A6). */
  environment: string;
  number: string | null;
  series: string | null;
  accessKey: string | null;
  lastError: string | null;
  issuedAt: Date | null;
  hasPdf: boolean;
}

/** A nota na resposta das acoes do painel, com o id visto no painel da Notaas. */
export interface AdminInvoiceView extends InvoiceSummary {
  orderId: string;
  providerInvoiceId: string | null;
  cancelledAt: Date | null;
  emailedAt: Date | null;
}

/** O que as duas visoes leem da linha. */
export interface InvoiceSummaryRow {
  status: InvoiceStatus;
  environment: string;
  number: string | null;
  series: string | null;
  accessKey: string | null;
  lastError: string | null;
  issuedAt: Date | null;
  pdfPath: string | null;
}

/** Colunas que a listagem do financeiro pede ao banco. */
export const INVOICE_SUMMARY_SELECT = {
  status: true,
  environment: true,
  number: true,
  series: true,
  accessKey: true,
  lastError: true,
  issuedAt: true,
  pdfPath: true,
} as const;

export function toInvoiceSummary(row: InvoiceSummaryRow): InvoiceSummary {
  return {
    status: row.status,
    environment: row.environment,
    number: row.number,
    series: row.series,
    accessKey: row.accessKey,
    lastError: row.lastError,
    issuedAt: row.issuedAt,
    hasPdf: !!row.pdfPath,
  };
}

export function toAdminInvoiceView(
  row: InvoiceSummaryRow & {
    orderId: string;
    providerInvoiceId: string | null;
    cancelledAt: Date | null;
    emailedAt: Date | null;
  },
): AdminInvoiceView {
  return {
    ...toInvoiceSummary(row),
    orderId: row.orderId,
    providerInvoiceId: row.providerInvoiceId,
    cancelledAt: row.cancelledAt,
    emailedAt: row.emailedAt,
  };
}
