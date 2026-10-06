import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { notaasWebhookSecret } from '../config/invoice.config';
import { InvoicesService } from './invoices.service';

/** Requisicao com o corpo cru preservado (`rawBody: true` no `main.ts`). */
interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

/** Aviso da Notaas, no que esta API le: o id da nota, e mais nada. */
interface NotaasEvent {
  event?: string;
  data?: { invoiceId?: string };
  invoiceId?: string;
}

/**
 * Confere o `X-Notaas-Signature`: HMAC-SHA256 do corpo **bruto** com o secret
 * do endpoint, em hex. Aceita com ou sem o prefixo `sha256=` — a documentacao
 * da Notaas mostra os dois. Comparacao em tempo constante.
 */
export function verifyNotaasSignature(raw: Buffer, header: string | undefined, secret: string): boolean {
  if (!header) {
    return false;
  }

  const received = Buffer.from(header.trim().replace(/^sha256=/i, ''), 'utf8');
  const expected = Buffer.from(createHmac('sha256', secret).update(raw).digest('hex'), 'utf8');

  return received.length === expected.length && timingSafeEqual(received, expected);
}

/**
 * Webhook da Notaas (Spec 023, decisao A5), com os eventos `nfse.*` (Spec
 * 024.2, decisao N1).
 *
 * Rota **publica**, fora do `FirebaseAuthGuard`, como os webhooks do Mux e do
 * Mercado Pago. Validada a assinatura, o aviso e so **qual nota mudou**: o
 * estado vem de `GET /invoices/{id}/status`. Isso tambem torna inofensivas
 * as entregas repetidas (`X-Notaas-Delivery`).
 *
 * Id desconhecido responde 200 (o servico ignora). Reconsulta que falha
 * responde 5xx, e a Notaas reentrega — sao 5 tentativas, a ultima 2 h depois.
 */
@Controller('webhooks')
export class NotaasWebhookController {
  constructor(
    private readonly invoices: InvoicesService,
    private readonly config: ConfigService,
  ) {}

  @Post('notaas')
  @HttpCode(200)
  async receive(
    @Req() request: RawBodyRequest,
    @Headers('x-notaas-signature') signature: string | undefined,
  ): Promise<{ received: true }> {
    const raw = request.rawBody;

    if (!raw) {
      throw new BadRequestException('Corpo da requisicao ausente.');
    }

    if (!verifyNotaasSignature(raw, signature, notaasWebhookSecret(this.config))) {
      throw new UnauthorizedException('Assinatura do webhook invalida.');
    }

    const event = request.body as NotaasEvent | undefined;
    const invoiceId = event?.data?.invoiceId ?? event?.invoiceId;

    if (invoiceId) {
      await this.invoices.syncByProviderId(invoiceId);
    }

    return { received: true };
  }
}
