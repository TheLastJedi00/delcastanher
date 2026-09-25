import { DEFAULT_COURSE_SLUG } from './courses.mock';
import { PLACEHOLDER } from './placeholders';

/**
 * Ordem canonica dos beneficios comparaveis entre os planos.
 * Todos os cards listam os mesmos itens, na mesma ordem, marcando
 * apenas o que esta incluso — e o que nao esta fica visivel e riscado.
 */
export const PLAN_BENEFITS = [
  'Acesso à área do aluno (AVA)',
  'Material de apoio e templates',
  'Certificado de conclusão',
  'Encontros ao vivo com a mentora',
  'Mentoria em grupo',
  'Trilha completa de formação',
  'Diagnóstico de RH da empresa',
  'Turma fechada e conteúdo sob medida',
] as const;

export type PlanBenefit = (typeof PLAN_BENEFITS)[number];

export type PlanState = 'disponivel' | 'em-breve';

export interface Plan {
  id: string;
  name: string;
  /** Para quem é este plano, em uma linha. */
  audience: string;
  description: string;
  price: string;
  priceNote: string;
  /** Beneficios inclusos — subconjunto de PLAN_BENEFITS. */
  included: PlanBenefit[];
  /** Diferenciais fora da lista comparavel. */
  highlights: string[];
  ctaLabel: string;
  /** Rota interna do app. Tem precedencia sobre ctaHref. */
  ctaRouterLink?: string;
  /** Link externo (checkout ou contato) quando nao for rota interna. */
  ctaHref?: string;
  state: PlanState;
  /** Card em destaque na grid. */
  featured: boolean;
  badge?: string;
}

export const PLANS: Plan[] = [
  {
    id: 'mini-curso',
    name: 'Mini Curso',
    audience: 'Para quem quer conhecer o método antes de investir',
    description:
      'Produto de entrada com uma amostra prática do RH Estratégico. Conteúdo em definição.',
    price: PLACEHOLDER.price,
    priceNote: 'Lançamento em breve',
    included: ['Acesso à área do aluno (AVA)', 'Material de apoio e templates'],
    highlights: [PLACEHOLDER.course],
    ctaLabel: 'Em breve',
    state: 'em-breve',
    featured: false,
    badge: 'Em breve',
  },
  {
    id: 'curso-individual',
    name: 'Curso Individual',
    audience: 'Para quem precisa resolver um tema específico agora',
    description:
      'Um curso da grade, completo, com material e certificado. Comece pela Imersão RH Estratégico.',
    price: PLACEHOLDER.price,
    priceNote: PLACEHOLDER.installments,
    included: [
      'Acesso à área do aluno (AVA)',
      'Material de apoio e templates',
      'Certificado de conclusão',
      'Encontros ao vivo com a mentora',
    ],
    highlights: ['Imersão RH Estratégico', PLACEHOLDER.course],
    ctaLabel: 'Ver o curso',
    ctaRouterLink: `/cursos/${DEFAULT_COURSE_SLUG}`,
    state: 'disponivel',
    featured: false,
  },
  {
    id: 'trilhas',
    name: 'Trilhas',
    audience: 'Para quem quer se aprofundar em uma frente do RH',
    description:
      'Um conjunto de cursos agrupados por tema, na ordem certa de aprendizado. Não confundir com a trilha da área do aluno: aqui Trilhas é o pacote comercial de cursos.',
    price: PLACEHOLDER.price,
    priceNote: PLACEHOLDER.installments,
    included: [
      'Acesso à área do aluno (AVA)',
      'Material de apoio e templates',
      'Certificado de conclusão',
      'Encontros ao vivo com a mentora',
      'Mentoria em grupo',
    ],
    highlights: [PLACEHOLDER.course, PLACEHOLDER.course],
    ctaLabel: 'Quero uma trilha',
    // Spec 014 (decisao 21): o CTA leva a loja, que exige conta — o visitante
    // passa por cadastro e onboarding antes de pagar. O mockup da Spec 007 saiu.
    ctaRouterLink: '/loja',
    ctaHref: PLACEHOLDER.checkout,
    state: 'disponivel',
    featured: true,
    badge: 'Mais escolhido',
  },
  {
    id: 'formacao-completa',
    name: 'Formação Completa',
    audience: 'Para quem quer dominar o RH Estratégico de ponta a ponta',
    description:
      'Todos os cursos e todas as trilhas do catálogo, com acompanhamento ao longo de toda a formação.',
    price: PLACEHOLDER.price,
    priceNote: PLACEHOLDER.installments,
    included: [
      'Acesso à área do aluno (AVA)',
      'Material de apoio e templates',
      'Certificado de conclusão',
      'Encontros ao vivo com a mentora',
      'Mentoria em grupo',
      'Trilha completa de formação',
    ],
    highlights: ['Catálogo completo de cursos', PLACEHOLDER.course],
    ctaLabel: 'Quero a formação',
    ctaRouterLink: '/loja',
    ctaHref: PLACEHOLDER.checkout,
    state: 'disponivel',
    featured: false,
  },
  {
    id: 'empresas',
    name: 'Empresas',
    audience: 'Para times e organizações que vão estruturar o RH junto',
    description:
      'Turma fechada, diagnóstico da sua operação e conteúdo ajustado ao momento da empresa.',
    price: 'Sob consulta',
    priceNote: 'Proposta personalizada',
    included: [...PLAN_BENEFITS],
    highlights: ['Turma fechada', 'Diagnóstico organizacional', 'Relatório para a diretoria'],
    ctaLabel: 'Falar com o time',
    ctaHref: 'https://wa.me/5547992908953',
    state: 'disponivel',
    featured: false,
  },
];

export const PLANS_META = {
  title: 'Planos e Soluções | Delcastanher',
  description:
    'Compare os planos da Delcastanher: curso individual, trilhas, formação completa e soluções para empresas. Escolha o formato certo para estruturar o seu RH.',
};

/**
 * Copy fixa do Pacote de Lancamento (Spec 019). Preco, lote e vagas **nao**
 * moram aqui: mudam com a venda e chegam de `GET /store/offer`, lido no
 * navegador (decisao 10). Isto e so o texto que nao muda de um dia para outro.
 */
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
