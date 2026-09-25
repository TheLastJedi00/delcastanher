/**
 * Copy fixa do `/planos` (Spec 019, decisao 11).
 *
 * Ate a Spec 019 este arquivo tinha cinco planos de prototipo da Spec 006 —
 * Mini Curso, Curso Individual, Trilhas, Formacao Completa e Empresas —, quatro
 * deles sem produto cadastrado e todos com preco `[PREÇO]`. Sairam: a pagina
 * passa a vender o que existe, o Pacote de Lancamento e os modulos avulsos.
 *
 * **Preco, lote e vagas nao moram aqui.** Mudam com a venda e chegam de
 * `GET /store/offer`, lido no navegador (decisao 10). Isto e so o texto que nao
 * muda de um dia para outro.
 */

/** Pacote de Lancamento: o que a oferta promete, em texto. */
export const LAUNCH_BUNDLE_COPY = {
  slug: 'imersao-rh-lancamento',
  overline: 'Pacote de lançamento — Imersão RH Estratégico',
  headline: 'Estruture o RH da sua empresa',
  subheadline: 'Do Zero ao Estratégico',
  support: '12 módulos | Método RH 360° | Materiais práticos | Templates | Plano de Ação',
  benefits: [
    '12 módulos completos',
    'Videoaulas objetivas de 5–8 minutos',
    '12 apostilas práticas',
    'Exercícios de aplicação',
    'Estudos de caso',
    'Templates e ferramentas de RH',
    'Checklists',
    'Prompts de Inteligência Artificial',
    'Método RH 360°',
    'Plano de Ação Final',
    'Certificado de conclusão',
  ],
} as const;

/**
 * Emoji de cada lote, pela ordem. O banco guarda o nome sem ele, porque o nome
 * vai para o recibo e para o painel; o emoji e copy de marketing.
 */
const TIER_EMOJI: Record<number, string> = { 1: '🔥', 2: '🚀', 3: '⭐', 4: '💎' };

export function tierLabel(tier: { order: number; name: string }): string {
  const emoji = TIER_EMOJI[tier.order];

  return emoji ? `${emoji} ${tier.name}` : tier.name;
}

/** O unico plano do prototipo que continua: a venda para empresas, sob consulta. */
export const ENTERPRISE_PLAN = {
  name: 'Empresas',
  audience: 'Para times e organizações que vão estruturar o RH junto',
  description:
    'Turma fechada, diagnóstico da sua operação e conteúdo ajustado ao momento da empresa.',
  price: 'Sob consulta',
  priceNote: 'Proposta personalizada',
  highlights: ['Turma fechada', 'Diagnóstico organizacional', 'Relatório para a diretoria'],
  ctaLabel: 'Falar com o time',
  ctaHref: 'https://wa.me/5547992908953',
} as const;

export const PLANS_META = {
  title: 'Planos e Preços | Delcastanher',
  description:
    'Pacote de Lançamento da Imersão RH Estratégico com os 12 módulos, módulos avulsos e soluções para empresas. Veja o lote vigente e escolha como estruturar o seu RH.',
};
