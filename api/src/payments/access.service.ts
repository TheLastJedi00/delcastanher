import { Injectable } from '@nestjs/common';
import { AccessSource, ModuleAccess } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Duracao do acesso vendido, em meses de calendario (Spec 014, decisao 5). */
export const ACCESS_MONTHS = 6;

/** Entrada de uma concessao — compra, cortesia ou backfill. */
export interface GrantAccessInput {
  userId: string;
  moduleId: string;
  source: AccessSource;
  /** Preenchido quando a origem e uma compra; e a chave da idempotencia. */
  orderId?: string | null;
}

/**
 * Soma meses de **calendario**, ajustando o dia quando o mes de destino e mais
 * curto: 31/08 + 6 meses e 28/02, e nao 03/03.
 *
 * `setMonth` sozinho transborda — e o transbordo daria dois dias a mais de
 * acesso para quem comprou no dia 31.
 */
function addMonths(from: Date, months: number): Date {
  const result = new Date(from.getTime());
  const day = result.getUTCDate();

  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);

  const lastDayOfTargetMonth = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();

  result.setUTCDate(Math.min(day, lastDayOfTargetMonth));

  return result;
}

/**
 * Direito de acesso do aluno ao conteudo (Spec 014, decisao 4).
 *
 * **E este servico, e nao o pagamento, que responde se o conteudo abre.** Video,
 * material, progresso e certificado consultam so ele, e nenhum deles precisa
 * saber que existe um gateway do outro lado — mesma separacao que o
 * `MuxService` faz para o video (Spec 010, decisao 16).
 *
 * Compra, cortesia e o backfill das contas antigas entram pela mesma porta:
 * acesso ativo e uma pergunta so, seja qual for a origem.
 */
@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  /** Acessos ativos do aluno, em uma consulta — nunca uma por modulo. */
  activeFor(userId: string): Promise<ModuleAccess[]> {
    return this.prisma.moduleAccess.findMany({
      where: { userId, expiresAt: { gt: new Date() } },
      orderBy: { moduleId: 'asc' },
    });
  }

  /**
   * Mapa `moduleId -> expiresAt` dos acessos ativos. E o que a trilha inteira
   * usa para decidir o que abre: uma consulta por requisicao, e a leitura de
   * cada modulo vira uma busca em memoria.
   */
  async activeMap(userId: string): Promise<Map<string, Date>> {
    const accesses = await this.activeFor(userId);

    return new Map(accesses.map((item) => [item.moduleId, item.expiresAt]));
  }

  /**
   * Se o aluno pode abrir este modulo agora. Acesso vencido e indistinguivel
   * de acesso inexistente: o conteudo tranca dos dois jeitos.
   */
  async hasActive(userId: string, moduleId: string): Promise<boolean> {
    const access = await this.find(userId, moduleId);

    return !!access && access.expiresAt > new Date();
  }

  /**
   * Concede ou estende o acesso por mais `ACCESS_MONTHS` (decisao 5).
   *
   * Sobre um acesso **ativo**, soma ao que resta — recomprar mais cedo nao pode
   * encurtar o que ja foi pago. Sobre um acesso **vencido**, recomeca de agora,
   * porque somar sobre data vencida devolveria um acesso nascido no passado.
   *
   * Repetir o mesmo pedido nao faz nada (decisao 13): o Mercado Pago reentrega
   * notificacao, e webhook e reconsulta podem chegar juntos — sem esta guarda,
   * a mesma compra viraria 60 meses de acesso.
   */
  async grant(input: GrantAccessInput): Promise<ModuleAccess> {
    const { userId, moduleId, source } = input;
    const orderId = input.orderId ?? null;
    const existing = await this.find(userId, moduleId);

    if (existing && orderId && existing.orderId === orderId) {
      return existing;
    }

    const now = new Date();
    const from = existing && existing.expiresAt > now ? existing.expiresAt : now;
    const expiresAt = addMonths(from, ACCESS_MONTHS);

    return this.prisma.moduleAccess.upsert({
      where: { userId_moduleId: { userId, moduleId } },
      update: { expiresAt, source, orderId, grantedAt: now },
      create: { userId, moduleId, expiresAt, source, orderId, grantedAt: now },
    });
  }

  /** Remove o acesso concedido por um pedido — estorno ou contestacao (decisao 22). */
  async revokeByOrder(orderId: string): Promise<number> {
    const { count } = await this.prisma.moduleAccess.deleteMany({ where: { orderId } });

    return count;
  }

  /** Revogacao administrativa de uma cortesia (decisao 20). */
  async revoke(userId: string, moduleId: string): Promise<void> {
    await this.prisma.moduleAccess.deleteMany({ where: { userId, moduleId } });
  }

  private find(userId: string, moduleId: string): Promise<ModuleAccess | null> {
    return this.prisma.moduleAccess.findUnique({
      where: { userId_moduleId: { userId, moduleId } },
    });
  }
}
