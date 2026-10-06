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
import { NfseBody } from './nfse-builder';

/** API da Notaas. Sobrescrevivel so para o servidor falso da suite. */
const NOTAAS_API = 'https://platform.notaas.com.br/api/v1';

/** Decisao A4: a emissao nao pode segurar a resposta do pagamento. */
const DEFAULT_TIMEOUT_MS = 10_000;

/** Redirecionamentos seguidos ate o documento, no CDN (decisao N6). */
const MAX_REDIRECTS = 3;

/**
 * Resposta de `GET /invoices/{id}/status`, no que esta API consome. A
 * documentacao usa dois nomes para o numero e para a data (decisao N5).
 */
interface StatusResponse {
  invoiceId?: string;
  status?: ProviderInvoiceStatus;
  ambiente?: string | null;
  chNFSe?: string | null;
  numeroNfe?: number | string | null;
  nNFSe?: number | string | null;
  emittedAt?: string | null;
  issuedAt?: string | null;
  cancelledAt?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  errors?: { Codigo?: string; Descricao?: string; Complemento?: string }[] | null;
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

/** `E0540: Descricao (Complemento)`, um por erro do sistema nacional. */
function nationalErrors(errors: StatusResponse['errors']): string[] {
  return (errors ?? []).map((error) =>
    [
      [error.Codigo, error.Descricao].filter(Boolean).join(': '),
      error.Complemento ? `(${error.Complemento})` : null,
    ]
      .filter(Boolean)
      .join(' '),
  );
}

/**
 * Cliente da Notaas para NFS-e (Spec 024.2, decisao N1), atras da
 * `InvoiceGateway`.
 *
 * So aqui existe a chave da API, e ela nunca entra em log nem sai para o CDN.
 * O corpo das respostas de erro entra cru no `lastError`: quando a nota nao
 * sai, quem responde e o que a Notaas e o sistema nacional disseram, e nao a
 * nossa traducao.
 */
@Injectable()
export class NotaasClient implements InvoiceGateway {
  private readonly logger = new Logger(NotaasClient.name);

  constructor(private readonly config: ConfigService) {}

  /**
   * `POST /emitir`. Assincrono: o `202` so diz que enfileirou. Os tres
   * desfechos sao distintos de proposito (Spec 023, decisao A2) — so o
   * `queued` grava id, e so o `rejected` pode ser reenviado sem medo.
   */
  async emit(body: NfseBody): Promise<EmitResult> {
    let response: Response;

    try {
      response = await this.fetch('/emitir', {
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

  /** `GET /invoices/{id}/status`. Falha lanca: quem chamou tenta de novo. */
  async status(providerInvoiceId: string): Promise<ProviderInvoice> {
    const response = await this.require(`/invoices/${encodeURIComponent(providerInvoiceId)}/status`);
    const data = (await response.json()) as StatusResponse;

    const errorDetail =
      data.status === 'error'
        ? [data.errorCode, data.errorMessage, ...nationalErrors(data.errors)].filter(Boolean).join(' - ')
        : null;

    return {
      providerInvoiceId: data.invoiceId ?? providerInvoiceId,
      status: data.status ?? 'processing',
      environment:
        data.ambiente === 'producao' || data.ambiente === 'homologacao' ? data.ambiente : null,
      number: text(data.numeroNfe ?? data.nNFSe),
      series: null,
      accessKey: text(data.chNFSe),
      protocol: null,
      issuedAt: date(data.emittedAt ?? data.issuedAt),
      cancelledAt: date(data.cancelledAt),
      errorDetail: errorDetail || null,
    };
  }

  /**
   * `POST /cancelar` (decisao N7). A recusa que fala em prazo e separada das
   * outras: ela nao e erro, e o estorno fora do prazo, que pede outro caminho.
   */
  async cancel(providerInvoiceId: string, reason: string): Promise<CancelResult> {
    const response = await this.fetch('/cancelar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoiceId: providerInvoiceId, motivo: reason }),
    });

    if (response.ok) {
      return { kind: 'accepted' };
    }

    const message = `Notaas respondeu ${response.status}: ${await response.text()}`;

    if (response.status < 500 && /prazo|expir/i.test(message)) {
      return { kind: 'expired', message };
    }

    return { kind: 'refused', message };
  }

  /** DANFSe em PDF. Guardado no nosso Storage, e nao servido do CDN. */
  async downloadPdf(providerInvoiceId: string): Promise<Buffer> {
    return this.download(`/invoices/${encodeURIComponent(providerInvoiceId)}/pdf`);
  }

  /** XML da NFS-e, ou o do evento de cancelamento. */
  async downloadXml(providerInvoiceId: string, type: 'emission' | 'cancel' = 'emission'): Promise<Buffer> {
    const query = type === 'cancel' ? '?type=cancel' : '';

    return this.download(`/invoices/${encodeURIComponent(providerInvoiceId)}/xml${query}`);
  }

  /**
   * Documento da nota. A Notaas responde `302` para o CDN publico quando ja o
   * tem em cache, e o redirecionamento e seguido **sem** o `x-api-key`
   * (decisao N6): a chave so vai a API.
   */
  private async download(path: string): Promise<Buffer> {
    let response = await this.fetch(path, { method: 'GET', redirect: 'manual' });

    for (let hops = 0; this.isRedirect(response) && hops < MAX_REDIRECTS; hops++) {
      const location = new URL(response.headers.get('location') as string, response.url || this.url(path));

      response = await this.fetchPublic(location.toString());
    }

    if (!response.ok) {
      const detail = await response.text();

      this.logger.error(`Notaas respondeu ${response.status} em ${path}: ${detail}`);
      throw new Error(`Notaas respondeu ${response.status} em ${path}: ${detail}`);
    }

    return Buffer.from(await response.arrayBuffer());
  }

  private isRedirect(response: Response): boolean {
    return response.status >= 300 && response.status < 400 && !!response.headers.get('location');
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

  private timeout(): number {
    const value = Number(optionalEnv(this.config, 'NOTAAS_TIMEOUT_MS') ?? DEFAULT_TIMEOUT_MS);

    return value > 0 ? value : DEFAULT_TIMEOUT_MS;
  }

  private url(path: string): string {
    return `${(optionalEnv(this.config, 'NOTAAS_API_URL') ?? NOTAAS_API).replace(/\/+$/, '')}${path}`;
  }

  private async fetch(path: string, init: RequestInit): Promise<Response> {
    try {
      return await fetch(this.url(path), {
        ...init,
        headers: { ...(init.headers as Record<string, string>), 'x-api-key': notaasApiKey(this.config) },
        signal: AbortSignal.timeout(this.timeout()),
      });
    } catch (error) {
      throw new NoResponseError(
        `Notaas sem resposta em ${path}: ${(error as Error).name === 'TimeoutError' ? 'timeout' : (error as Error).message}`,
      );
    }
  }

  /** O CDN da Notaas: sem chave, e sem seguir para outro lugar sozinho. */
  private async fetchPublic(url: string): Promise<Response> {
    try {
      return await fetch(url, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(this.timeout()) });
    } catch (error) {
      throw new NoResponseError(`CDN da Notaas sem resposta: ${(error as Error).message}`);
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
