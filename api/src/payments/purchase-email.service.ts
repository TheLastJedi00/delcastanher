import {
  BadGatewayException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { frontendUrl } from '../config/mail.config';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { purchaseConfirmationEmail } from './purchase-email';

/** O que o e-mail le do pedido. */
const ORDER_SELECT = {
  id: true,
  status: true,
  amountCents: true,
  method: true,
  installments: true,
  payerName: true,
  bundleTitleSnapshot: true,
  tierNameSnapshot: true,
  confirmationEmailedAt: true,
  user: { select: { email: true, name: true } },
  items: { select: { titleSnapshot: true } },
  accesses: { select: { expiresAt: true } },
} as const;

interface PurchaseOrderRow {
  id: string;
  status: string;
  amountCents: number;
  method: 'PIX' | 'CARD';
  installments: number;
  payerName: string | null;
  bundleTitleSnapshot: string | null;
  tierNameSnapshot: string | null;
  user: { email: string; name: string | null };
  items: { titleSnapshot: string }[];
  accesses: { expiresAt: Date }[];
}

/**
 * E-mail "Compra confirmada" (Spec 024, decisao D6).
 *
 * Mesmo desenho do e-mail da nota (Spec 023, decisao A8): a linha e
 * **reivindicada** por `confirmationEmailedAt` antes do envio, entao webhook e
 * polling simultaneos mandam um so; se o Resend recusar, a reivindicacao volta
 * a nulo e o painel oferece o reenvio. E nada daqui lanca para o
 * `OrdersService`: o pagamento nunca depende do e-mail.
 */
@Injectable()
export class PurchaseEmailService {
  private readonly logger = new Logger(PurchaseEmailService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  /** Envio automatico, na transicao para `PAID`. Nunca lanca. */
  async onOrderPaid(orderId: string): Promise<void> {
    const claimedAt = new Date();

    try {
      const { count } = await this.prisma.order.updateMany({
        where: { id: orderId, status: 'PAID', confirmationEmailedAt: null },
        data: { confirmationEmailedAt: claimedAt },
      });

      if (count === 0) {
        return;
      }

      await this.send(await this.load(orderId), `purchase-${orderId}`);
    } catch (error) {
      this.logger.error(`Falha no e-mail de confirmacao do pedido ${orderId}.`, error as Error);

      await this.prisma.order
        .updateMany({
          where: { id: orderId, confirmationEmailedAt: claimedAt },
          data: { confirmationEmailedAt: null },
        })
        .catch(() => undefined);
    }
  }

  /**
   * Reenvio pelo painel. Aqui o erro **sobe**: quem clicou precisa saber que
   * nao foi, e por que (chave ausente, recusa do Resend).
   */
  async resend(orderId: string): Promise<{ confirmationEmailedAt: Date }> {
    const order = await this.load(orderId);

    if (order.status !== 'PAID') {
      throw new ConflictException('Só pedido pago recebe a confirmação de compra.');
    }

    try {
      // Chave nova a cada reenvio: com a do envio automatico, o Resend
      // devolveria o envio antigo em vez de mandar de novo.
      await this.send(order, `purchase-${orderId}-resend-${Date.now()}`);
    } catch (error) {
      throw new BadGatewayException(
        `Não foi possível enviar o e-mail: ${(error as Error).message}`,
      );
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { confirmationEmailedAt: new Date() },
      select: { confirmationEmailedAt: true },
    });

    return { confirmationEmailedAt: updated.confirmationEmailedAt as Date };
  }

  private async load(orderId: string): Promise<PurchaseOrderRow> {
    const order = (await this.prisma.order.findUnique({
      where: { id: orderId },
      select: ORDER_SELECT,
    })) as PurchaseOrderRow | null;

    if (!order) {
      throw new NotFoundException('Pedido não encontrado.');
    }

    return order;
  }

  private async send(order: PurchaseOrderRow, idempotencyKey: string): Promise<void> {
    const expirations = order.accesses.map((access) => access.expiresAt.getTime());
    const email = purchaseConfirmationEmail({
      buyerName: order.payerName ?? order.user.name,
      items: order.items.map((item) => item.titleSnapshot),
      bundle:
        order.bundleTitleSnapshot && order.tierNameSnapshot
          ? { title: order.bundleTitleSnapshot, tierName: order.tierNameSnapshot }
          : null,
      amountCents: order.amountCents,
      method: order.method,
      installments: order.installments,
      accessUntil: expirations.length ? new Date(Math.min(...expirations)) : null,
      platformUrl: `${frontendUrl(this.config)}/ava`,
    });

    await this.mail.send({
      to: order.user.email,
      subject: email.subject,
      html: email.html,
      text: email.text,
      idempotencyKey,
    });
  }
}
