import type { EmailSegment, Prisma } from '../generated/prisma/client';

/** Janela do segmento "nao acessam ha 7 dias". */
const INACTIVE_DAYS = 7;

/** Os tres segmentos da maquete, com o rotulo que a tela mostra (decisao B2). */
export const SEGMENTS: readonly { id: EmailSegment; label: string }[] = [
  { id: 'ALL_ACTIVE', label: 'Todos os alunos ativos' },
  { id: 'INACTIVE_7D', label: 'Alunos que não acessam há 7 dias' },
  { id: 'COMPLETED', label: 'Alunos que concluíram o curso' },
];

/**
 * Quem recebe cada segmento (Spec 023, decisao B2), calculado no servidor.
 *
 * Em todos ficam fora as contas bloqueadas, quem se descadastrou (decisao B5)
 * e os administradores. O papel aqui e a coluna espelho `role`: ela nao
 * autoriza nada (Spec 013, decisao 3), so filtra uma lista de envio.
 *
 * "Ativo" e ter algum `ModuleAccess` que ainda nao venceu — a mesma pergunta
 * do portao do conteudo (Spec 014, decisao 4).
 */
export function segmentWhere(segment: EmailSegment, now: Date = new Date()): Prisma.UserWhereInput {
  const base: Prisma.UserWhereInput = { blockedAt: null, marketingOptOutAt: null, role: 'aluno' };
  const active: Prisma.UserWhereInput = { accesses: { some: { expiresAt: { gt: now } } } };

  switch (segment) {
    case 'INACTIVE_7D': {
      const since = new Date(now.getTime() - INACTIVE_DAYS * 24 * 60 * 60 * 1000);

      // Nulo e "nao acessou desde que a coluna existe" (Spec 013, decisao 5):
      // para quem tem acesso ativo, isso tambem e nao estar entrando.
      return { ...base, ...active, OR: [{ lastSeenAt: { lt: since } }, { lastSeenAt: null }] };
    }
    case 'COMPLETED':
      return { ...base, certificates: { some: { status: 'ACTIVE' } } };
    default:
      return { ...base, ...active };
  }
}
