/**
 * Copy fixa do `/planos` (Spec 019, decisao 11).
 *
 * Ate a Spec 019 este arquivo tinha cinco planos de prototipo da Spec 006 —
 * Mini Curso, Curso Individual, Trilhas, Formacao Completa e Empresas —, quatro
 * deles sem produto cadastrado e todos com preco `[PREÇO]`. Sairam: a pagina
 * passa a vender o que existe, o pacote completo e os modulos avulsos.
 *
 * **Preco nao mora aqui.** Ele muda pelo painel e chega de `GET /store/offer`,
 * lido no navegador (decisao 10). Isto e so o texto que nao muda de um dia
 * para outro.
 */

/** Pacote completo: o que a oferta promete, em texto. O nome da constante e da Spec 019. */
export const LAUNCH_BUNDLE_COPY = {
  slug: 'imersao-rh-lancamento',
  overline: 'Pacote completo — Imersão RH Estratégico',
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
    'Pacote completo da Imersão RH Estratégico com os 12 módulos, módulos avulsos e soluções para empresas. Escolha como estruturar o seu RH.',
};
