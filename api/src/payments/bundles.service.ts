import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, PaymentMethodKind, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Lote como as regras desta spec o leem. */
export interface TierRow {
  id: string;
  order: number;
  name: string;
  priceCents: number;
  /** Nulo e "sem limite" — so o ultimo lote (decisao 3). */
  capacity: number | null;
}

/** Lote vigente na vitrine, com as vagas que sobram. */
export interface OfferTier extends TierRow {
  /** Nulo no lote sem limite: nao ha escassez a anunciar. */
  remaining: number | null;
}

/** Modulo do pacote na vitrine publica: nada alem do que a pagina exibe. */
export interface OfferModule {
  order: number;
  title: string;
  priceCents: number | null;
}

/** Pacote ativo como `GET /store/offer` o devolve (decisao 10). */
export interface BundleOffer {
  slug: string;
  title: string;
  modules: OfferModule[];
  /**
   * Soma dos precos avulsos dos modulos do pacote — a ancora "valor dos
   * modulos separadamente" (decisao 4). Nula quando algum modulo esta sem
   * preco: nao se soma "a definir".
   */
  modulesTotalCents: number | null;
  /** Nulo so se todos os lotes estiverem esgotados, o que a regra impede. */
  tier: OfferTier | null;
  nextTier: { name: string; priceCents: number } | null;
}

/** Estados que ocupam vaga independentemente do prazo. */
const SEAT_TAKEN: OrderStatus[] = ['PAID', 'REFUNDED'];

/** Janela da reserva: a mesma validade do PIX (Spec 014, decisao 10). */
export const SEAT_HOLD_MS = 30 * 60 * 1000;

/**
 * Um pedido ocupa vaga do lote se esta pago, estornado ou pendente dentro do
 * prazo (decisao 3).
 *
 * - **Pendente reserva.** Sem isso, 25 pessoas gerariam o QR do Fundador ao
 *   mesmo tempo e todas pagariam R$ 590. Pendente sem prazo (cartao em
 *   processamento, ou pedido cuja chamada ao gateway falhou) reserva por 30
 *   minutos a partir da criacao — sem esse teto, um pedido que nunca chegou ao
 *   Mercado Pago seguraria a vaga para sempre. O estado do pedido nao muda: um
 *   cartao aprovado depois disso continua sendo aprovado.
 * - **Estornado nao devolve.** Um "restam 3" que vira "restam 4" depois de um
 *   estorno desmente a escassez que a pagina anunciou.
 *
 * `occupiedWhere` e a mesma regra escrita como consulta; as duas mudam juntas.
 */
export function occupiesSeat(
  order: { status: OrderStatus; expiresAt: Date | null; createdAt: Date },
  now: Date,
): boolean {
  if (SEAT_TAKEN.includes(order.status)) {
    return true;
  }

  if (order.status !== 'PENDING') {
    return false;
  }

  return order.expiresAt !== null
    ? order.expiresAt > now
    : order.createdAt.getTime() > now.getTime() - SEAT_HOLD_MS;
}

export function occupiedWhere(tierIds: string[], now: Date): Prisma.OrderWhereInput {
  return {
    bundleTierId: { in: tierIds },
    OR: [
      { status: { in: SEAT_TAKEN } },
      {
        status: 'PENDING',
        OR: [
          { expiresAt: { gt: now } },
          { expiresAt: null, createdAt: { gt: new Date(now.getTime() - SEAT_HOLD_MS) } },
        ],
      },
    ],
  };
}

/**
 * O lote vigente: o primeiro, na ordem, com vaga (decisao 3). Nao ha coluna
 * "lote atual" — derivado, o lote vira no instante da ultima vaga.
 */
export function pickTier(tiers: TierRow[], occupied: Map<string, number>): TierRow | null {
  const ordered = [...tiers].sort((a, b) => a.order - b.order);

  return (
    ordered.find((tier) => tier.capacity === null || (occupied.get(tier.id) ?? 0) < tier.capacity) ??
    null
  );
}

/**
 * Rateia o valor do pedido de pacote pelos itens, pelo peso do preco avulso
 * de cada modulo (decisao 6).
 *
 * Cada parte e o piso da proporcao, e a sobra de centavos vai para a ultima:
 * a soma e **sempre** o total, que e o que recibo, financeiro e estorno leem.
 * Sem peso nenhum (todos sem preco), divide em partes iguais.
 */
export function allocateByWeight(totalCents: number, weights: number[]): number[] {
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const effective = totalWeight > 0 ? weights : weights.map(() => 1);
  const base = totalWeight > 0 ? totalWeight : weights.length;

  const parts = effective.map((weight) => Math.floor((totalCents * weight) / base));
  const remainder = totalCents - parts.reduce((sum, part) => sum + part, 0);

  parts[parts.length - 1] += remainder;

  return parts;
}

/** Lote no painel: com as vagas ocupadas e se e o vigente (decisao 13). */
export interface AdminBundleTier extends TierRow {
  occupied: number;
  current: boolean;
}

export interface AdminBundleView {
  slug: string;
  title: string;
  active: boolean;
  tiers: AdminBundleTier[];
}

/** O que o painel pode mudar num lote: preco e vagas, e so. */
export interface UpdateTierInput {
  priceCents?: number;
  capacity?: number | null;
}

/** Pedido de pacote pedido pelo `OrdersService`. Sem preco e sem lote. */
export interface PlaceBundleOrderInput {
  slug: string;
  userId: string;
  method: PaymentMethodKind;
  installments: number;
}

/** Linha gravada do pedido de pacote, com os itens rateados. */
export interface PlacedBundleOrder {
  order: Prisma.OrderGetPayload<{ include: { items: true } }>;
}

/** Cliente aceito nas consultas: o servico ou a transacao em curso. */
type Db = Pick<PrismaService, 'order'>;

/**
 * Pacotes e lotes (Spec 019).
 *
 * Tudo o que decide dinheiro de pacote passa por aqui: qual lote vale agora,
 * quantas vagas sobram e como o valor se divide pelos modulos. O pedido em si
 * continua no `OrdersService`.
 */
@Injectable()
export class BundlesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Vagas ocupadas por lote, numa consulta agregada — nunca uma por pedido. */
  async occupied(tierIds: string[], now: Date = new Date(), db: Db = this.prisma): Promise<Map<string, number>> {
    const groups = await db.order.groupBy({
      by: ['bundleTierId'],
      where: occupiedWhere(tierIds, now),
      _count: { _all: true },
    });

    return new Map(
      groups
        .filter((group) => group.bundleTierId !== null)
        .map((group) => [group.bundleTierId as string, group._count._all]),
    );
  }

  /**
   * Grava o pedido de pacote no lote vigente, numa transacao que trava o
   * pacote (decisao 5).
   *
   * A trava existe para a ultima vaga: sem ela, dois pedidos simultaneos
   * leriam "falta 1" e os dois entrariam no Fundador. Ela vale so para pedidos
   * do mesmo pacote, e so pelo tempo de uma contagem e um INSERT — a chamada
   * ao Mercado Pago fica **fora**, no `OrdersService`, como no pedido de
   * modulos avulsos.
   *
   * O pendente anterior do aluno e cancelado aqui dentro, antes da contagem:
   * a vaga que ele segurava volta para este pedido (Spec 014, decisao 11).
   */
  async placeOrder(input: PlaceBundleOrderInput, now: Date = new Date()): Promise<PlacedBundleOrder> {
    return this.prisma.$transaction(async (tx) => {
      const bundle = await tx.bundle.findUnique({
        where: { slug: input.slug },
        include: {
          modules: { include: { module: { select: { id: true, order: true, title: true, priceCents: true } } } },
          tiers: true,
        },
      });

      if (!bundle || !bundle.active) {
        throw new NotFoundException('Este pacote não está disponível.');
      }

      await tx.$queryRaw`SELECT "id" FROM "bundles" WHERE "id" = ${bundle.id} FOR UPDATE`;

      await tx.order.updateMany({
        where: { userId: input.userId, status: 'PENDING' },
        data: { status: 'CANCELLED' },
      });

      const tiers: TierRow[] = bundle.tiers.map(({ id, order, name, priceCents, capacity }) => ({
        id,
        order,
        name,
        priceCents,
        capacity,
      }));
      const occupied = await this.occupied(
        tiers.map((tier) => tier.id),
        now,
        tx,
      );
      const tier = pickTier(tiers, occupied);

      if (!tier) {
        throw new ConflictException('As vagas deste pacote se esgotaram.');
      }

      // Na ordem da trilha: e a ordem do recibo e do resumo na tela.
      const modules = bundle.modules.map(({ module }) => module).sort((a, b) => a.order - b.order);
      const parts = allocateByWeight(
        tier.priceCents,
        modules.map((module) => module.priceCents ?? 0),
      );

      const order = await tx.order.create({
        data: {
          userId: input.userId,
          amountCents: tier.priceCents,
          method: input.method,
          installments: input.installments,
          bundleId: bundle.id,
          bundleTierId: tier.id,
          bundleTitleSnapshot: bundle.title,
          tierNameSnapshot: tier.name,
          items: {
            create: modules.map((module, index) => ({
              moduleId: module.id,
              priceCents: parts[index],
              titleSnapshot: module.title,
            })),
          },
        },
        include: { items: true },
      });

      return { order };
    });
  }

  /** Lotes do pacote para o painel, com as vagas ocupadas e o vigente. */
  async adminView(slug: string, now: Date = new Date()): Promise<AdminBundleView> {
    const bundle = await this.prisma.bundle.findUnique({ where: { slug }, include: { tiers: true } });

    if (!bundle) {
      throw new NotFoundException('Pacote não encontrado.');
    }

    const tiers = this.toTiers(bundle.tiers);
    const occupied = await this.occupied(
      tiers.map((tier) => tier.id),
      now,
    );
    const current = pickTier(tiers, occupied);

    return {
      slug: bundle.slug,
      title: bundle.title,
      active: bundle.active,
      tiers: tiers.map((tier) => ({
        ...tier,
        occupied: occupied.get(tier.id) ?? 0,
        current: tier.id === current?.id,
      })),
    };
  }

  /**
   * Preco e vagas de um lote (decisao 13), com as recusas da decisao 3:
   *
   * - **capacidade nula so no ultimo lote** — sem limite antes dele, os lotes
   *   seguintes nunca seriam alcancados;
   * - **capacidade nunca abaixo das vagas ja ocupadas** — seria vender mais do
   *   que o lote diz ter.
   *
   * Roda com o pacote travado, a mesma trava do pedido: a contagem que valida
   * a capacidade nova nao cruza com uma venda no meio do caminho.
   */
  async updateTier(
    slug: string,
    tierId: string,
    input: UpdateTierInput,
    now: Date = new Date(),
  ): Promise<AdminBundleTier> {
    return this.prisma.$transaction(async (tx) => {
      const bundle = await tx.bundle.findUnique({ where: { slug }, include: { tiers: true } });

      if (!bundle) {
        throw new NotFoundException('Pacote não encontrado.');
      }

      await tx.$queryRaw`SELECT "id" FROM "bundles" WHERE "id" = ${bundle.id} FOR UPDATE`;

      const tiers = this.toTiers(bundle.tiers);
      const tier = tiers.find((row) => row.id === tierId);

      if (!tier) {
        throw new NotFoundException('Lote não encontrado neste pacote.');
      }

      const occupied = await this.occupied(
        tiers.map((row) => row.id),
        now,
        tx,
      );
      const taken = occupied.get(tier.id) ?? 0;

      if (input.capacity === null && tier.order !== Math.max(...tiers.map((row) => row.order))) {
        throw new BadRequestException('Só o último lote pode ficar sem limite de vagas.');
      }

      if (typeof input.capacity === 'number' && input.capacity < taken) {
        throw new BadRequestException(
          `Este lote já tem ${taken} vaga(s) ocupada(s); a capacidade não pode ser menor que isso.`,
        );
      }

      const data: UpdateTierInput = {};

      if (input.priceCents !== undefined) {
        data.priceCents = input.priceCents;
      }

      if (input.capacity !== undefined) {
        data.capacity = input.capacity;
      }

      const saved = await tx.bundleTier.update({ where: { id: tier.id }, data });
      const after = tiers.map((row) => (row.id === tier.id ? { ...row, ...data } : row));

      return {
        id: saved.id,
        order: saved.order,
        name: saved.name,
        priceCents: saved.priceCents,
        capacity: saved.capacity,
        occupied: taken,
        current: pickTier(after, occupied)?.id === tier.id,
      };
    });
  }

  private toTiers(rows: TierRow[]): TierRow[] {
    return rows
      .map(({ id, order, name, priceCents, capacity }) => ({ id, order, name, priceCents, capacity }))
      .sort((a, b) => a.order - b.order);
  }

  /** Pacote ativo com o lote vigente, para a vitrine publica e a loja. */
  async offer(now: Date = new Date()): Promise<BundleOffer | null> {
    const bundle = await this.prisma.bundle.findFirst({
      where: { active: true },
      orderBy: { createdAt: 'asc' },
      include: {
        modules: { include: { module: { select: { order: true, title: true, priceCents: true } } } },
        tiers: true,
      },
    });

    if (!bundle) {
      return null;
    }

    const tiers: TierRow[] = bundle.tiers.map(({ id, order, name, priceCents, capacity }) => ({
      id,
      order,
      name,
      priceCents,
      capacity,
    }));
    const occupied = await this.occupied(
      tiers.map((tier) => tier.id),
      now,
    );
    const current = pickTier(tiers, occupied);
    const next = current
      ? ([...tiers].sort((a, b) => a.order - b.order).find((tier) => tier.order > current.order) ?? null)
      : null;

    const modules = bundle.modules
      .map(({ module }) => ({ order: module.order, title: module.title, priceCents: module.priceCents }))
      .sort((a, b) => a.order - b.order);
    const unpriced = modules.some((module) => module.priceCents === null);

    return {
      slug: bundle.slug,
      title: bundle.title,
      modules,
      modulesTotalCents: unpriced
        ? null
        : modules.reduce((sum, module) => sum + (module.priceCents as number), 0),
      tier: current
        ? {
            ...current,
            remaining:
              current.capacity === null ? null : current.capacity - (occupied.get(current.id) ?? 0),
          }
        : null,
      nextTier: next ? { name: next.name, priceCents: next.priceCents } : null,
    };
  }
}
