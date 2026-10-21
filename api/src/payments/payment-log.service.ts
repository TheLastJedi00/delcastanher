import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mercadoPagoSandbox } from '../config/payments.config';
import { PaymentLog, PaymentLogLevel, PaymentLogSource, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { sanitizeDetail } from './payment-log.sanitize';

/** Teto da mensagem: ela e uma linha, e o detalhe vai no `detail`. */
const MAX_MESSAGE = 1000;

/** Um evento de pagamento, como quem o registra o conhece. */
export interface PaymentLogEntry {
  orderId?: string | null;
  attemptId?: string | null;
  userId?: string | null;
  source: PaymentLogSource;
  stage: string;
  level: PaymentLogLevel;
  httpStatus?: number | null;
  mpOrderId?: string | null;
  mpStatus?: string | null;
  mpStatusDetail?: string | null;
  message: string;
  /** Corpo da resposta ou do erro; e limpo aqui, antes de gravar. */
  detail?: unknown;
}

/**
 * Logs de pagamento no banco (Spec 028, decisao 7).
 *
 * Os logs da Vercel somem em dias, e o gestor nao os ve. O que acontece numa
 * tentativa de pagamento fica em `payment_logs`, e e de la que o modal do
 * painel le.
 *
 * `record()` **nunca lanca**: um log que falha nao pode mudar o pagamento, a
 * mesma trava da nota e do e-mail (Spec 023, decisao A4; Spec 024, D6).
 */
@Injectable()
export class PaymentLogService {
  private readonly logger = new Logger(PaymentLogService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async record(entry: PaymentLogEntry): Promise<void> {
    try {
      await this.prisma.paymentLog.create({
        data: {
          orderId: entry.orderId ?? null,
          attemptId: entry.attemptId ?? null,
          userId: entry.userId ?? null,
          source: entry.source,
          stage: entry.stage,
          level: entry.level,
          httpStatus: entry.httpStatus ?? null,
          mpOrderId: entry.mpOrderId ?? null,
          mpStatus: entry.mpStatus ?? null,
          mpStatusDetail: entry.mpStatusDetail ?? null,
          message: entry.message.slice(0, MAX_MESSAGE),
          detail: (sanitizeDetail(entry.detail) ?? Prisma.DbNull) as Prisma.InputJsonValue,
          environment: mercadoPagoSandbox(this.config) ? 'sandbox' : 'production',
        },
      });
    } catch (error) {
      this.logger.error(
        `Falha ao gravar o log de pagamento (${entry.stage}); o pagamento segue.`,
        error as Error,
      );
    }
  }

  /** Eventos do navegador de um usuario desde um instante (limite da decisao 9). */
  countFrontSince(userId: string, since: Date): Promise<number> {
    return this.prisma.paymentLog.count({
      where: { userId, source: 'FRONT', createdAt: { gte: since } },
    });
  }

  /**
   * Linha do tempo de um pedido: os logs dele e os do navegador da mesma
   * tentativa, gravados antes de o pedido existir (decisao 8).
   */
  forOrder(order: { id: string; attemptId: string | null }): Promise<PaymentLog[]> {
    return this.prisma.paymentLog.findMany({
      where: {
        OR: [{ orderId: order.id }, ...(order.attemptId ? [{ attemptId: order.attemptId }] : [])],
      },
      orderBy: { createdAt: 'asc' },
    });
  }
}
