import { Injectable } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from './access.service';
import { BundleOffer, BundlesService, OfferModule } from './bundles.service';

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
  /** Nulo = "a definir": o modulo aparece como "em breve" (decisao 1). */
  priceCents: number | null;
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
  ) {}

  /**
   * Oferta publica para o `/planos` e para a loja (Spec 019, decisao 10).
   *
   * O `/planos` e prerenderizado, e um preco gravado no HTML do build seria o
   * do dia do deploy — por isso a pagina le isto no navegador. Quem decide o
   * lote cobrado e o `POST /orders`, e nao esta leitura.
   */
  async offer(): Promise<StoreOffer> {
    const [modules, bundle] = await Promise.all([
      this.prisma.module.findMany({
        orderBy: { order: 'asc' },
        select: { order: true, title: true, priceCents: true },
      }),
      this.bundles.offer(),
    ]);

    return { modules, bundle };
  }

  /** Catalogo na ordem da trilha, com o estado de acesso do solicitante. */
  async catalog(user: AuthUser): Promise<StoreModuleItem[]> {
    const [modules, active] = await Promise.all([
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
    ]);

    return modules.map((module) => {
      const expiresAt = active.get(module.id) ?? null;

      return {
        id: module.id,
        order: module.order,
        title: module.title,
        summary: module.summary,
        lessonCount: module._count?.lessons ?? 0,
        priceCents: module.priceCents,
        // Modulo ja ativo nao volta a vitrine enquanto valer: e o mesmo 409 que
        // o pedido devolveria, dito antes do clique.
        purchasable: module.priceCents !== null && expiresAt === null,
        access: { unlocked: expiresAt !== null, expiresAt: expiresAt?.toISOString() ?? null },
      };
    });
  }
}
