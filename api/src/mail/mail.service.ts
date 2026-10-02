import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { emailFrom, resendApiKey } from '../config/mail.config';

/** API do Resend. */
const RESEND_API = 'https://api.resend.com';

/** O `POST /emails/batch` do Resend aceita ate 100 mensagens por chamada. */
export const RESEND_BATCH_LIMIT = 100;

/** Teto de uma chamada ao Resend: a funcao da Vercel nao pode ficar pendurada. */
const REQUEST_TIMEOUT_MS = 10_000;

/** Anexo, em bytes. O lote do Resend nao aceita anexo; o envio unitario aceita. */
export interface MailAttachment {
  filename: string;
  content: Buffer;
}

/** Uma mensagem pronta: o conteudo ja vem montado por `renderEmail`. */
export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
  attachments?: MailAttachment[];
  /** Chave que o Resend usa para nao entregar duas vezes a mesma chamada. */
  idempotencyKey?: string;
}

/** Desfecho de uma mensagem do lote: o id do Resend, ou a recusa crua. */
export type BatchResult = { id: string } | { error: string };

/** Recusa do Resend, com o status, para quem precisa distinguir. */
export class MailError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = 'MailError';
  }
}

/**
 * Provedor de e-mail da API (Spec 023, decisao B1).
 *
 * Um servico so para os dois usos — o e-mail da nota fiscal (decisao A8) e as
 * campanhas (decisao B4). Isolar a rede aqui e o que deixa as suites da nota e
 * das campanhas rodarem sem tocar no Resend, como o `MercadoPagoService` faz
 * para o pagamento. A chave da API nunca sai daqui, nem em log.
 *
 * `fetch` direto, e nao o SDK: sao duas rotas, e o SDK seria uma dependencia a
 * mais para o mesmo `POST`.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly config: ConfigService) {}

  /** Envio unitario, com anexos. */
  async send(message: MailMessage): Promise<{ id: string }> {
    const response = (await this.request(
      '/emails',
      this.payload(message),
      message.idempotencyKey,
    )) as { id: string };

    return { id: response.id };
  }

  /**
   * Envio em lotes de 100 (decisao B4). Devolve um desfecho por mensagem, na
   * mesma ordem: um lote recusado marca as mensagens dele com o erro, e os
   * outros lotes seguem — quem decide o que reenviar e o chamador, pelo que
   * ficou sem id.
   */
  async sendBatch(
    messages: MailMessage[],
    idempotencyKeyOf?: (batchIndex: number) => string,
  ): Promise<BatchResult[]> {
    const results: BatchResult[] = [];

    for (let start = 0; start < messages.length; start += RESEND_BATCH_LIMIT) {
      const batch = messages.slice(start, start + RESEND_BATCH_LIMIT);
      const batchIndex = start / RESEND_BATCH_LIMIT;

      try {
        const response = (await this.request(
          '/emails/batch',
          batch.map((message) => this.payload(message)),
          idempotencyKeyOf?.(batchIndex),
        )) as { data?: { id: string }[] };

        batch.forEach((_, index) => {
          const id = response.data?.[index]?.id;

          results.push(id ? { id } : { error: 'Resend nao devolveu id para a mensagem.' });
        });
      } catch (error) {
        const reason = (error as Error).message;

        batch.forEach(() => results.push({ error: reason }));
      }
    }

    return results;
  }

  private payload(message: MailMessage): Record<string, unknown> {
    return {
      from: emailFrom(this.config),
      to: [message.to],
      subject: message.subject,
      html: message.html,
      text: message.text,
      ...(message.headers && Object.keys(message.headers).length
        ? { headers: message.headers }
        : {}),
      ...(message.attachments?.length
        ? {
            attachments: message.attachments.map((attachment) => ({
              filename: attachment.filename,
              content: attachment.content.toString('base64'),
            })),
          }
        : {}),
    };
  }

  private async request(path: string, body: unknown, idempotencyKey?: string): Promise<unknown> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${resendApiKey(this.config)}`,
    };

    if (idempotencyKey) {
      headers['Idempotency-Key'] = idempotencyKey;
    }

    let response: Response;

    try {
      response = await fetch(`${RESEND_API}${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw new MailError(`Falha de rede ao falar com o Resend: ${(error as Error).message}`, null);
    }

    if (!response.ok) {
      const detail = await response.text();

      // O corpo da recusa diz qual campo o Resend recusou. Nenhum destinatario
      // entra no log: so o status e a mensagem do provedor.
      this.logger.error(`Resend respondeu ${response.status} em ${path}: ${detail}`);

      throw new MailError(`Resend respondeu ${response.status}: ${detail}`, response.status);
    }

    return response.json();
  }
}
