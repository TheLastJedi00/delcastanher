import { Injectable } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from './access.service';
import { BundleOffer, BundlesService, OfferModule, discountedModule } from './bundles.service';
import { applyDiscount, effectiveEnd } from './promotion';
import { PromotionsService } from './promotions.service';

/**
 * Modulo na vitrine.
 *
 * O que sai daqui e deliberadamente pobre: titulo, resumo, quantidade de aulas,
 * preco e o estado de acesso de quem perguntou. Caminho de arquivo no bucket e
 * id de video do Mux nao tem o que fazer em uma loja.
 */
export interface StoreModuleItem {
  id: string;
  order: number;
  title: string;
  summary: string;
  lessonCount: number;
  /**
   * Nulo = "a definir": o modulo aparece como "em breve" (decisao 1). Em
   * campanha, ja com o desconto (Spec 032, decisao 4).
   */
  priceCents: number | null;
  /** Preco cheio; igual a `priceCents` fora de campanha. */
  listPriceCents: number | null;
  /** Falso para modulo sem preco e para o que o aluno ja tem ativo. */
  purchasable: boolean;
  access: { unlocked: boolean; expiresAt: string | null };
}

/**
 * Vitrine publica (Spec 019, decisao 10): os modulos avulsos e o pacote ativo
 * com o lote vigente. Nada de quem pergunta — a rota nem sabe quem e.
 */
export interface StoreOffer {
  modules: OfferModule[];
  bundle: BundleOffer | null;
  /** Campanha no ar, ou nula (Spec 032). */
  promotion: PublicPromotion | null;
}

/**
 * Campanha como a vitrine a anuncia (Spec 032, decisao 7). `serverNow` vai
 * junto para a contagem regressiva corrigir o relogio do aparelho, que pode
 * estar errado. `endsAt` e o fim de fato: o antecipado, quando houver.
 */
export interface PublicPromotion {
  name: string;
  percentOff: number;
  endsAt: string;
  serverNow: string;
}

/**
 * Vitrine da loja de modulos (Spec 014).
 *
 * Ela responde uma pergunta so — "o que existe, quanto custa e o que eu ja
 * tenho" — e responde para o aluno que perguntou, nunca para a base inteira.
 */
@Injectable()
export class StoreService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly bundles: BundlesService,
    private readonly promotions: PromotionsService,
  ) {}

  /**
   * Oferta publica para o `/planos` e para a loja (Spec 019, decisao 10).
   *
   * O `/planos` e prerenderizado, e um preco gravado no HTML do build seria o
   * do dia do deploy — por isso a pagina le isto no navegador. Quem decide o
   * lote cobrado e o `POST /orders`, e nao esta leitura.
   */
  async offer(now: Date = new Date()): Promise<StoreOffer> {
    const promotion = await this.promotions.current(now);

    return {
      ...(await this.prices(promotion?.percentOff ?? null, now)),
      promotion: promotion
        ? {
            name: promotion.name,
            percentOff: promotion.percentOff,
            endsAt: effectiveEnd(promotion).toISOString(),
            serverNow: now.toISOString(),
          }
        : null,
    };
  }

  /**
   * Os precos da vitrine com uma porcentagem qualquer: a previa do painel
   * (Spec 032, decisao 10). E o mesmo caminho da oferta publica, para a conta
   * do painel e a da loja nunca divergirem.
   */
  async prices(percentOff: number | null, now: Date = new Date()): Promise<Omit<StoreOffer, 'promotion'>> {
    const [modules, bundle] = await Promise.all([
      this.prisma.module.findMany({
        orderBy: { order: 'asc' },
        select: { order: true, title: true, priceCents: true },
      }),
      this.bundles.offer(now, percentOff),
    ]);

    return { modules: modules.map((module) => discountedModule(module, percentOff)), bundle };
  }

  /** Catalogo na ordem da trilha, com o estado de acesso do solicitante. */
  async catalog(user: AuthUser, now: Date = new Date()): Promise<StoreModuleItem[]> {
    const [modules, active, promotion] = await Promise.all([
      this.prisma.module.findMany({
        orderBy: { order: 'asc' },
        select: {
          id: true,
          order: true,
          title: true,
          summary: true,
          priceCents: true,
          _count: { select: { lessons: true } },
        },
      }),
      // Uma consulta para o catalogo inteiro (decisao 4).
      this.access.activeMap(user.uid),
      this.promotions.current(now),
    ]);
    const percentOff = promotion?.percentOff ?? null;

    return modules.map((module) => {
      const expiresAt = active.get(module.id) ?? null;

      return {
        id: module.id,
        order: module.order,
        title: module.title,
        summary: module.summary,
        lessonCount: module._count?.lessons ?? 0,
        priceCents: module.priceCents === null ? null : applyDiscount(module.priceCents, percentOff),
        listPriceCents: module.priceCents,
        // Modulo ja ativo nao volta a vitrine enquanto valer: e o mesmo 409 que
        // o pedido devolveria, dito antes do clique.
        purchasable: module.priceCents !== null && expiresAt === null,
        access: { unlocked: expiresAt !== null, expiresAt: expiresAt?.toISOString() ?? null },
      };
    });
  }
}
