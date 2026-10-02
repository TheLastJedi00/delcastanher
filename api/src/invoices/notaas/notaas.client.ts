import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { notaasApiKey } from '../../config/invoice.config';
import { optionalEnv } from '../../config/media.config';
import {
  CancelResult,
  EmitResult,
  InvoiceGateway,
  ProviderInvoice,
  ProviderInvoiceStatus,
} from '../invoice-gateway';
import { NfeBody } from './nfe-builder';

/** API da Notaas. Sobrescrevivel so para o servidor falso da suite. */
const NOTAAS_API = 'https://platform.notaas.com.br/api/v1';

/** Decisao A4: a emissao nao pode segurar a resposta do pagamento. */
const DEFAULT_TIMEOUT_MS = 10_000;

/** Resposta de `GET /nfe/invoices/{id}/status`, no que esta API consome. */
interface StatusResponse {
  invoiceId?: string;
  status?: ProviderInvoiceStatus;
  tpAmb?: number;
  numero?: number | string | null;
  serie?: number | string | null;
  chaveAcesso?: string | null;
  protocolo?: string | null;
  codigoStatus?: number | null;
  motivo?: string | null;
  errorMessage?: string | null;
  dataRecebimento?: string | null;
  cancelledAt?: string | null;
}

/** Falha de transporte: a requisicao nao teve resposta. */
class NoResponseError extends Error {}

function text(value: number | string | null | undefined): string | null {
  return value === null || value === undefined || value === '' ? null : String(value);
}

function date(value: string | null | undefined): Date | null {
  const parsed = value ? new Date(value) : null;

  return parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
}

/**
 * Cliente da Notaas (Spec 023, decisao A1), atras da `InvoiceGateway`.
 *
 * So aqui existe a chave da API, e ela nunca entra em log. O corpo das
 * respostas de erro entra cru no `lastError`: quando a nota nao sai, quem
 * responde e o que a Notaas e a Sefaz disseram, e nao a nossa traducao.
 */
@Injectable()
export class NotaasClient implements InvoiceGateway {
  private readonly logger = new Logger(NotaasClient.name);

  constructor(private readonly config: ConfigService) {}

  /**
   * `POST /nfe/emitir`. Assincrono: o `202` so diz que enfileirou. Os tres
   * desfechos sao distintos de proposito (decisao A2) — so o `queued` grava id,
   * e so o `rejected` pode ser reenviado sem medo.
   */
  async emit(body: NfeBody): Promise<EmitResult> {
    let response: Response;

    try {
      response = await this.fetch('/nfe/emitir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (error) {
      return { kind: 'unknown', message: (error as Error).message };
    }

    const detail = await response.text();

    if (response.status >= 500) {
      return { kind: 'unknown', message: `Notaas respondeu ${response.status}: ${detail}` };
    }

    if (!response.ok) {
      return { kind: 'rejected', message: `Notaas respondeu ${response.status}: ${detail}` };
    }

    const invoiceId = this.parse<{ invoiceId?: string }>(detail)?.invoiceId;

    return invoiceId
      ? { kind: 'queued', providerInvoiceId: invoiceId }
      : { kind: 'unknown', message: `Notaas respondeu ${response.status} sem invoiceId: ${detail}` };
  }

  /** `GET /nfe/invoices/{id}/status`. Falha lanca: quem chamou tenta de novo. */
  async status(providerInvoiceId: string): Promise<ProviderInvoice> {
    const response = await this.require(`/nfe/invoices/${encodeURIComponent(providerInvoiceId)}/status`);
    const data = (await response.json()) as StatusResponse;

    const errorDetail =
      data.status === 'error'
        ? [text(data.codigoStatus), data.motivo, data.errorMessage].filter(Boolean).join(' - ')
        : null;

    return {
      providerInvoiceId: data.invoiceId ?? providerInvoiceId,
      status: data.status ?? 'processing',
      tpAmb: typeof data.tpAmb === 'number' ? data.tpAmb : null,
      number: text(data.numero),
      series: text(data.serie),
      accessKey: text(data.chaveAcesso),
      protocol: text(data.protocolo),
      issuedAt: date(data.dataRecebimento),
      cancelledAt: date(data.cancelledAt),
      errorDetail: errorDetail || null,
    };
  }

  /**
   * `POST /nfe/cancelar` (decisao A7). O `422` de prazo e separado dos outros:
   * ele nao e erro, e o estorno fora das 24 horas, que pede outro documento.
   */
  async cancel(providerInvoiceId: string, reason: string): Promise<CancelResult> {
    const response = await this.fetch('/nfe/cancelar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoiceId: providerInvoiceId, motivo: reason }),
    });

    if (response.ok) {
      return { kind: 'accepted' };
    }

    const message = `Notaas respondeu ${response.status}: ${await response.text()}`;

    if (response.status === 422 && /prazo|expir/i.test(message)) {
      return { kind: 'expired', message };
    }

    return { kind: 'refused', message };
  }

  /** DANFE A4. Nao fica em CDN publico: exige a chave da API. */
  async downloadPdf(providerInvoiceId: string): Promise<Buffer> {
    const response = await this.require(`/nfe/invoices/${encodeURIComponent(providerInvoiceId)}/danfe`);

    return Buffer.from(await response.arrayBuffer());
  }

  /** `nfeProc` autorizado, ou `procEventoNFe` do cancelamento. */
  async downloadXml(providerInvoiceId: string, type: 'emission' | 'cancel' = 'emission'): Promise<Buffer> {
    const query = type === 'cancel' ? '?type=cancel' : '';
    const response = await this.require(
      `/nfe/invoices/${encodeURIComponent(providerInvoiceId)}/xml${query}`,
    );

    return Buffer.from(await response.arrayBuffer());
  }

  /** `GET` que precisa de 2xx; qualquer outra coisa lanca com o status. */
  private async require(path: string): Promise<Response> {
    const response = await this.fetch(path, { method: 'GET' });

    if (!response.ok) {
      const detail = await response.text();

      this.logger.error(`Notaas respondeu ${response.status} em ${path}: ${detail}`);
      throw new Error(`Notaas respondeu ${response.status} em ${path}: ${detail}`);
    }

    return response;
  }

  private async fetch(path: string, init: RequestInit): Promise<Response> {
    const timeout = Number(optionalEnv(this.config, 'NOTAAS_TIMEOUT_MS') ?? DEFAULT_TIMEOUT_MS);
    const base = (optionalEnv(this.config, 'NOTAAS_API_URL') ?? NOTAAS_API).replace(/\/+$/, '');

    try {
      return await fetch(`${base}${path}`, {
        ...init,
        headers: { ...(init.headers as Record<string, string>), 'x-api-key': notaasApiKey(this.config) },
        signal: AbortSignal.timeout(timeout > 0 ? timeout : DEFAULT_TIMEOUT_MS),
      });
    } catch (error) {
      throw new NoResponseError(
        `Notaas sem resposta em ${path}: ${(error as Error).name === 'TimeoutError' ? 'timeout' : (error as Error).message}`,
      );
    }
  }

  private parse<T>(body: string): T | null {
    try {
      return JSON.parse(body) as T;
    } catch {
      return null;
    }
  }
}
