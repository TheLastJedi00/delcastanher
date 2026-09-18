import { Injectable, NotFoundException } from '@nestjs/common';
import { AccessSource, OrderStatus, PaymentMethodKind } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from './access.service';

/** Acesso de um aluno, como o suporte precisa ve-lo. */
export interface AdminAccessItem {
  moduleId: string;
  moduleOrder: number;
  moduleTitle: string;
  source: AccessSource;
  grantedAt: string;
  expiresAt: string;
  active: boolean;
  orderId: string | null;
}

/** Pedido de um aluno, no que o suporte precisa para responder. */
export interface AdminOrderItem {
  id: string;
  status: OrderStatus;
  amountCents: number;
  method: PaymentMethodKind;
  installments: number;
  mpOrderId: string | null;
  mpPaymentId: string | null;
  createdAt: string;
  paidAt: string | null;
  items: { moduleId: string; title: string; priceCents: number }[];
}

/**
 * Leitura e escrita administrativa do acesso (Spec 014, decisao 20).
 *
 * Conceder cortesia e a **unica** escrita que o detalhe do aluno ganha, e ela
 * nao contradiz a decisao 11 da Spec 013: e ato administrativo sobre a relacao
 * comercial, e nao edicao de dado pessoal de terceiro.
 *
 * Nao existe log de autor nem de valor anterior — a Spec 013 (decisao 14) ja
 * registrou essa ausencia, e ela continua consciente.
 */
@Injectable()
export class AdminAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  /** Cortesia: 6 meses, pelo mesmo caminho da compra. */
  async grant(userId: string, moduleId: string): Promise<void> {
    await this.require(userId, moduleId);

    await this.access.grant({ userId, moduleId, source: 'COURTESY' });
  }

  /**
   * Revoga o acesso. Progresso e certificado nao sao tocados: o aluno perde a
   * porta, e nao o que ele fez do outro lado dela.
   */
  async revoke(userId: string, moduleId: string): Promise<void> {
    await this.require(userId, moduleId);

    await this.access.revoke(userId, moduleId);
  }

  /**
   * Acessos do aluno, **inclusive os vencidos**: "teve acesso e expirou" e uma
   * informacao diferente de "nunca teve", e e justamente a que o suporte
   * precisa quando alguem liga dizendo que o video parou de abrir.
   */
  async listFor(userId: string): Promise<AdminAccessItem[]> {
    const accesses = await this.prisma.moduleAccess.findMany({
      where: { userId },
      orderBy: { module: { order: 'asc' } },
      include: { module: { select: { order: true, title: true } } },
    });

    const now = Date.now();

    return accesses.map((item) => ({
      moduleId: item.moduleId,
      moduleOrder: item.module.order,
      moduleTitle: item.module.title,
      source: item.source,
      grantedAt: item.grantedAt.toISOString(),
      expiresAt: item.expiresAt.toISOString(),
      active: item.expiresAt.getTime() > now,
      orderId: item.orderId,
    }));
  }

  /** Pedidos do aluno, do mais recente ao mais antigo (decisao 23). */
  async ordersFor(userId: string): Promise<AdminOrderItem[]> {
    const orders = await this.prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { items: true },
    });

    return orders.map((order) => ({
      id: order.id,
      status: order.status,
      amountCents: order.amountCents,
      method: order.method,
      installments: order.installments,
      mpOrderId: order.mpOrderId,
      mpPaymentId: order.mpPaymentId,
      createdAt: order.createdAt.toISOString(),
      paidAt: order.paidAt?.toISOString() ?? null,
      items: order.items.map((item) => ({
        moduleId: item.moduleId,
        title: item.titleSnapshot,
        priceCents: item.priceCents,
      })),
    }));
  }

  /** 404 separado por alvo: "aluno nao existe" e "modulo nao existe" sao erros diferentes. */
  private async require(userId: string, moduleId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });

    if (!user) {
      throw new NotFoundException('Aluno nao encontrado.');
    }

    const module = await this.prisma.module.findUnique({
      where: { id: moduleId },
      select: { id: true },
    });

    if (!module) {
      throw new NotFoundException('Modulo nao encontrado.');
    }
  }
}
