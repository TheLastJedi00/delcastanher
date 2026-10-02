import { segmentWhere, SEGMENTS } from './segments';

const NOW = new Date('2026-10-02T12:00:00Z');
const SEVEN_DAYS_AGO = new Date('2026-09-25T12:00:00Z');

/**
 * Segmentos fixos da aba de disparos (Spec 023, decisao B2), calculados no
 * servidor: o front manda so o nome, nunca uma lista de e-mails.
 */
describe('segmentWhere', () => {
  /** Fora de todos: bloqueados, descadastrados e administradores. */
  const EXCLUDED = { blockedAt: null, marketingOptOutAt: null, role: 'aluno' };

  it('todos os alunos ativos: algum acesso que ainda nao venceu', () => {
    expect(segmentWhere('ALL_ACTIVE', NOW)).toEqual({
      ...EXCLUDED,
      accesses: { some: { expiresAt: { gt: NOW } } },
    });
  });

  it('inativos ha 7 dias: ativos, com ultimo acesso antigo ou nulo', () => {
    expect(segmentWhere('INACTIVE_7D', NOW)).toEqual({
      ...EXCLUDED,
      accesses: { some: { expiresAt: { gt: NOW } } },
      OR: [{ lastSeenAt: { lt: SEVEN_DAYS_AGO } }, { lastSeenAt: null }],
    });
  });

  it('concluintes: algum certificado ativo', () => {
    expect(segmentWhere('COMPLETED', NOW)).toEqual({
      ...EXCLUDED,
      certificates: { some: { status: 'ACTIVE' } },
    });
  });

  it('os tres segmentos tem rotulo para a tela, na ordem da maquete', () => {
    expect(SEGMENTS.map((segment) => segment.id)).toEqual(['ALL_ACTIVE', 'INACTIVE_7D', 'COMPLETED']);
    expect(SEGMENTS.every((segment) => segment.label.length > 0)).toBe(true);
  });
});
