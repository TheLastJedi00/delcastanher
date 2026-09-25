import { Injectable } from '@nestjs/common';
import { OrderStatus, Prisma } from '../generated/prisma/client';
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

/**
 * Um pedido ocupa vaga do lote se esta pago, estornado ou pendente dentro do
 * prazo (decisao 3).
 *
 * - **Pendente reserva.** Sem isso, 25 pessoas gerariam o QR do Fundador ao
 *   mesmo tempo e todas pagariam R$ 590. Pendente sem prazo e o cartao em
 *   processamento, que tambem reserva.
 * - **Estornado nao devolve.** Um "restam 3" que vira "restam 4" depois de um
 *   estorno desmente a escassez que a pagina anunciou.
 *
 * `occupiedWhere` e a mesma regra escrita como consulta; as duas mudam juntas.
 */
export function occupiesSeat(order: { status: OrderStatus; expiresAt: Date | null }, now: Date): boolean {
  if (SEAT_TAKEN.includes(order.status)) {
    return true;
  }

  return order.status === 'PENDING' && (order.expiresAt === null || order.expiresAt > now);
}

export function occupiedWhere(tierIds: string[], now: Date): Prisma.OrderWhereInput {
  return {
    bundleTierId: { in: tierIds },
    OR: [
      { status: { in: SEAT_TAKEN } },
      { status: 'PENDING', OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
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
