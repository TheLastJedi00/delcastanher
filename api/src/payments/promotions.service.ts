import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  MAX_PERCENT_OFF,
  PromotionPeriod,
  isRunning,
  overlaps,
} from './promotion';

/** Campanha como o banco a guarda. */
export interface PromotionRow extends PromotionPeriod {
  id: string;
  name: string;
  percentOff: number;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}

export type PromotionStatus = 'SCHEDULED' | 'RUNNING' | 'ENDED';

/** Pedidos pagos da campanha (decisao 10). Estornado nao entra, como na receita. */
export interface PromotionTotals {
  paidOrders: number;
  revenueCents: number;
  discountCents: number;
}

/** Campanha como o painel a mostra. */
export interface PromotionView {
  id: string;
  name: string;
  percentOff: number;
  startsAt: Date;
  endsAt: Date;
  endedEarlyAt: Date | null;
  status: PromotionStatus;
}

export interface PromotionListItem extends PromotionView {
  totals: PromotionTotals;
}

export interface CreatePromotionInput {
  name: string;
  percentOff: number;
  startsAt: Date;
  endsAt: Date;
}

export type UpdatePromotionInput = Partial<CreatePromotionInput>;

/**
 * Folga para "comecar agora": o painel trabalha em minutos, e o inicio no
 * minuto atual chega segundos no passado. Ate 5 minutos, a campanha comeca no
 * instante da gravacao; alem disso, e engano de data.
 */
export const START_TOLERANCE_MS = 5 * 60 * 1000;

/**
 * Chave da trava de sobreposicao (`pg_advisory_xact_lock`). Sem ela, dois
 * admins salvando ao mesmo tempo leriam "nenhuma campanha no periodo" e as
 * duas entrariam (decisao 2).
 */
const OVERLAP_LOCK_KEY = 32032;

const OVERLAP_MESSAGE = 'Já existe uma campanha nesse período.';
const RUNNING_LOCKED_MESSAGE =
  'Com a campanha no ar, só o nome e o fim podem mudar.';

export function promotionStatus(
  period: PromotionPeriod,
  now: Date,
): PromotionStatus {
  if (now < period.startsAt) {
    return 'SCHEDULED';
  }

  return isRunning(period, now) ? 'RUNNING' : 'ENDED';
}

/**
 * Campanhas de desconto (Spec 032).
 *
 * A campanha vigente nao e uma coluna: e a que tem o periodo em volta de
 * agora (decisao 1). Por isso nada aqui "liga" ou "desliga" a campanha — o
 * painel so escreve o periodo, e a loja le o que vale no instante da leitura.
 */
@Injectable()
export class PromotionsService {
  constructor(private readonly prisma: PrismaService) {}

  /** A campanha que vale agora, ou nula. E ela que a oferta e o pedido leem. */
  async current(now: Date = new Date()): Promise<PromotionRow | null> {
    const candidates = (await this.prisma.promotion.findMany({
      where: { startsAt: { lte: now }, endsAt: { gt: now } },
    })) as PromotionRow[];

    return candidates.find((promotion) => isRunning(promotion, now)) ?? null;
  }

  /** Todas as campanhas, da mais recente a mais antiga, com os totais. */
  async list(now: Date = new Date()): Promise<PromotionListItem[]> {
    const rows = (
      (await this.prisma.promotion.findMany()) as PromotionRow[]
    ).sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime());

    if (rows.length === 0) {
      return [];
    }

    const groups = await this.prisma.order.groupBy({
      by: ['promotionId'],
      where: {
        promotionId: { in: rows.map((promotion) => promotion.id) },
        status: 'PAID',
      },
      _count: { _all: true },
      _sum: { amountCents: true, listAmountCents: true },
    });
    const totals = new Map(
      groups.map((group) => {
        const revenueCents = group._sum.amountCents ?? 0;

        return [
          group.promotionId as string,
          {
            paidOrders: group._count._all,
            revenueCents,
            discountCents:
              (group._sum.listAmountCents ?? revenueCents) - revenueCents,
          },
        ];
      }),
    );

    return rows.map((promotion) => ({
      ...this.toView(promotion, now),
      totals: totals.get(promotion.id) ?? {
        paidOrders: 0,
        revenueCents: 0,
        discountCents: 0,
      },
    }));
  }

  async create(
    input: CreatePromotionInput,
    adminUid: string,
    now: Date = new Date(),
  ): Promise<PromotionView> {
    this.validatePercent(input.percentOff);

    const startsAt = this.validateStart(input.startsAt, now);

    this.validateEnd(startsAt, input.endsAt);

    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx);
      await this.assertNoOverlap(tx, {
        startsAt,
        endsAt: input.endsAt,
        endedEarlyAt: null,
      });

      const created = await tx.promotion.create({
        data: {
          name: input.name.trim(),
          percentOff: input.percentOff,
          startsAt,
          endsAt: input.endsAt,
          createdById: adminUid,
        },
      });

      return this.toView(created, now);
    });
  }

  /**
   * Edita a campanha conforme o estado (decisao 2): agendada muda tudo; no ar,
   * so o nome e o fim — pedidos ja entraram com aquela porcentagem; encerrada,
   * nada.
   */
  async update(
    id: string,
    input: UpdatePromotionInput,
    now: Date = new Date(),
  ): Promise<PromotionView> {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx);

      const current = await this.find(tx, id);
      const status = promotionStatus(current, now);

      if (status === 'ENDED') {
        throw new ConflictException('Campanha encerrada não pode ser editada.');
      }

      if (status === 'RUNNING') {
        const percentChanged =
          input.percentOff !== undefined &&
          input.percentOff !== current.percentOff;
        const startChanged =
          input.startsAt !== undefined &&
          input.startsAt.getTime() !== current.startsAt.getTime();

        if (percentChanged || startChanged) {
          throw new ConflictException(RUNNING_LOCKED_MESSAGE);
        }

        if (input.endsAt !== undefined && input.endsAt <= now) {
          throw new BadRequestException(
            'O fim precisa ser depois de agora. Para terminar já, use "Encerrar agora".',
          );
        }
      }

      if (input.percentOff !== undefined) {
        this.validatePercent(input.percentOff);
      }

      const startsAt =
        status === 'SCHEDULED' && input.startsAt !== undefined
          ? this.validateStart(input.startsAt, now)
          : current.startsAt;
      const endsAt = input.endsAt ?? current.endsAt;

      this.validateEnd(startsAt, endsAt);
      await this.assertNoOverlap(
        tx,
        { startsAt, endsAt, endedEarlyAt: null },
        id,
      );

      const saved = await tx.promotion.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(status === 'SCHEDULED' && input.percentOff !== undefined
            ? { percentOff: input.percentOff }
            : {}),
          startsAt,
          endsAt,
        },
      });

      return this.toView(saved, now);
    });
  }

  /** So campanha agendada e apagavel: a que ja comecou pode ter vendido. */
  async remove(id: string, now: Date = new Date()): Promise<void> {
    const current = await this.find(this.prisma, id);

    if (promotionStatus(current, now) !== 'SCHEDULED') {
      throw new ConflictException(
        'Só uma campanha que ainda não começou pode ser apagada.',
      );
    }

    await this.prisma.promotion.delete({ where: { id } });
  }

  /** Encerra a campanha no ar agora (decisao 2). */
  async endNow(id: string, now: Date = new Date()): Promise<PromotionView> {
    const current = await this.find(this.prisma, id);

    if (promotionStatus(current, now) !== 'RUNNING') {
      throw new ConflictException('Só uma campanha no ar pode ser encerrada.');
    }

    const saved = await this.prisma.promotion.update({
      where: { id },
      data: { endedEarlyAt: now },
    });

    return this.toView(saved, now);
  }

  private async find(
    db: Pick<PrismaService, 'promotion'>,
    id: string,
  ): Promise<PromotionRow> {
    const found = await db.promotion.findUnique({
      where: { id },
    });

    if (!found) {
      throw new NotFoundException('Campanha não encontrada.');
    }

    return found;
  }

  private async lock(tx: Pick<PrismaService, '$executeRaw'>): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${OVERLAP_LOCK_KEY})`;
  }

  private async assertNoOverlap(
    tx: Pick<PrismaService, 'promotion'>,
    period: PromotionPeriod,
    ignoreId?: string,
  ): Promise<void> {
    const others = (await tx.promotion.findMany({
      where: {
        endsAt: { gt: period.startsAt },
        startsAt: { lt: period.endsAt },
      },
    })) as PromotionRow[];

    if (
      others.some((other) => other.id !== ignoreId && overlaps(other, period))
    ) {
      throw new ConflictException(OVERLAP_MESSAGE);
    }
  }

  private validatePercent(percentOff: number): void {
    if (
      !Number.isInteger(percentOff) ||
      percentOff < 1 ||
      percentOff > MAX_PERCENT_OFF
    ) {
      throw new BadRequestException(
        `O desconto deve ser um número inteiro de 1 a ${MAX_PERCENT_OFF}%.`,
      );
    }
  }

  /** Devolve o inicio a gravar: o pedido, ou agora dentro da folga. */
  private validateStart(startsAt: Date, now: Date): Date {
    if (startsAt.getTime() < now.getTime() - START_TOLERANCE_MS) {
      throw new BadRequestException('O início não pode estar no passado.');
    }

    return startsAt < now ? now : startsAt;
  }

  private validateEnd(startsAt: Date, endsAt: Date): void {
    if (endsAt <= startsAt) {
      throw new BadRequestException('O fim precisa ser depois do início.');
    }
  }

  private toView(promotion: PromotionRow, now: Date): PromotionView {
    return {
      id: promotion.id,
      name: promotion.name,
      percentOff: promotion.percentOff,
      startsAt: promotion.startsAt,
      endsAt: promotion.endsAt,
      endedEarlyAt: promotion.endedEarlyAt,
      status: promotionStatus(promotion, now),
    };
  }
}
