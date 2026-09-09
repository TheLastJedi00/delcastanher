import { PLACEHOLDER } from './placeholders';

export interface CourseModule {
  number: number;
  title: string;
  summary: string;
  topics: string[];
}

export interface CourseBonus {
  title: string;
  description: string;
  /** Valor percebido — placeholder ate o comercial definir. */
  value: string;
}

export interface CourseGuarantee {
  title: string;
  description: string;
}

export interface CourseFaqItem {
  question: string;
  answer: string;
}

export interface CourseTestimonial {
  name: string;
  role: string;
  quote: string;
  /** Vazio enquanto o video nao existe; o card cai no placeholder. */
  videoUrl: string;
}

export interface CourseOffer {
  /** Preco cheio riscado (ancoragem). */
  priceFrom: string;
  price: string;
  installments: string;
  /** Observacao curta abaixo do preco. */
  priceNote: string;
  checkoutUrl: string;
  ctaLabel: string;
  scarcityDeadline: string;
  scarcitySeats: string;
}

export interface CourseProblem {
  title: string;
  description: string;
  pains: string[];
}

export interface Course {
  slug: string;
  name: string;
  /** Selo curto acima da headline. */
  overline: string;
  headline: string;
  subheadline: string;
  format: { label: string; value: string }[];
  problem: CourseProblem;
  /** Capacitacoes ao final do curso. */
  outcomes: string[];
  modules: CourseModule[];
  bonuses: CourseBonus[];
  offer: CourseOffer;
  guarantees: CourseGuarantee[];
  faq: CourseFaqItem[];
  testimonials: CourseTestimonial[];
  metaTitle: string;
  metaDescription: string;
}

const IMERSAO_RH: Course = {
  slug: 'imersao-rh',
  name: 'Imersão RH Estratégico',
  overline: 'Imersão RH Estratégico',
  headline: 'Estruture o RH da sua empresa do zero e vire parceiro de resultado',
  subheadline:
    'Um método consultivo e aplicado para transformar o departamento de pessoas em uma área que sustenta a estratégia do negócio — com processos claros, cultura forte e indicadores que a diretoria entende.',
  format: [
    { label: 'Formato', value: 'Imersão online ao vivo' },
    { label: 'Carga horária', value: PLACEHOLDER.workload },
    { label: 'Início da turma', value: PLACEHOLDER.startDate },
    { label: 'Certificado', value: 'Sim, ao concluir a trilha' },
  ],
  problem: {
    title: 'O RH que apaga incêndio nunca senta à mesa da decisão',
    description:
      'Na maioria das empresas o RH nasceu operacional: folha, admissão, desligamento e demanda urgente. O resultado é uma área respeitada no dia a dia, mas ausente quando o negócio decide para onde vai.',
    pains: [
      'Você sente que o RH é visto como custo, não como estratégia.',
      'Faltam processos escritos — cada seleção, integração e avaliação acontece de um jeito.',
      'Não existem indicadores para provar o impacto do RH em números.',
      'O turnover e o clima pioram e ninguém sabe apontar a causa raiz.',
      'Você foi promovido para estruturar a área, mas não recebeu um método para isso.',
    ],
  },
  outcomes: [
    'Diagnosticar a maturidade do RH da sua empresa e priorizar o que atacar primeiro.',
    'Desenhar processos de recrutamento, seleção e onboarding replicáveis e documentados.',
    'Construir trilhas de desenvolvimento e avaliação de desempenho alinhadas às metas do negócio.',
    'Estruturar cargos, salários e política de reconhecimento com critério defensável.',
    'Medir clima, engajamento e turnover com indicadores que sustentam decisão.',
    'Apresentar resultados de RH em linguagem de diretoria, com dados e não com percepção.',
    'Sair da imersão com um plano de ação escrito para os primeiros 90 dias.',
  ],
  modules: [
    {
      number: 1,
      title: 'Fundamentos do RH Estratégico',
      summary: 'O que separa o RH operacional do RH que participa da estratégia.',
      topics: [
        'O papel do RH como parceiro do negócio',
        'Maturidade de RH: os quatro estágios',
        'Como o RH se conecta ao planejamento estratégico',
      ],
    },
    {
      number: 2,
      title: 'Diagnóstico Organizacional',
      summary: 'Onde a sua área está hoje e o que precisa ser atacado primeiro.',
      topics: [
        'Mapeamento dos processos existentes',
        'Escuta ativa com liderança e time',
        'Matriz de priorização das dores',
      ],
    },
    {
      number: 3,
      title: 'Recrutamento e Seleção',
      summary: 'Atrair e escolher a pessoa certa com critério, não com feeling.',
      topics: [
        'Alinhamento de perfil com o gestor',
        'Fontes de atração e employer branding',
        'Entrevista por competências e avaliação estruturada',
      ],
    },
    {
      number: 4,
      title: 'Onboarding e Integração',
      summary: 'Os primeiros 90 dias que definem a permanência da pessoa.',
      topics: [
        'Jornada de integração desenhada',
        'Papel do gestor no onboarding',
        'Rituais de acompanhamento e feedback inicial',
      ],
    },
    {
      number: 5,
      title: 'Desenvolvimento e Trilhas de Aprendizado',
      summary: 'Formar gente dentro de casa em vez de repor sempre do mercado.',
      topics: [
        'Levantamento de necessidades de treinamento',
        'Construção de trilhas por cargo',
        'Medição de eficácia do treinamento',
      ],
    },
    {
      number: 6,
      title: 'Gestão de Desempenho',
      summary: 'Avaliação que gera conversa de desenvolvimento, não constrangimento.',
      topics: [
        'Modelos de avaliação e quando usar cada um',
        'Ciclo de metas e acompanhamento',
        'Feedback e plano de desenvolvimento individual',
      ],
    },
    {
      number: 7,
      title: 'Clima e Cultura',
      summary: 'Segurança psicológica, pertencimento e comunicação assertiva.',
      topics: [
        'Pesquisa de clima que gera ação',
        'Cultura declarada x cultura praticada',
        'Rituais que sustentam a cultura no dia a dia',
      ],
    },
    {
      number: 8,
      title: 'Cargos, Salários e Reconhecimento',
      summary: 'Critério claro para remunerar e reconhecer sem gerar ruído.',
      topics: [
        'Descrição e avaliação de cargos',
        'Faixas salariais e pesquisa de mercado',
        'Reconhecimento além do dinheiro',
      ],
    },
    {
      number: 9,
      title: 'Relações Trabalhistas e Compliance',
      summary: 'Reduzir passivo cuidando de processo e de conversa.',
      topics: [
        'Riscos trabalhistas mais comuns no dia a dia do RH',
        'Documentação e formalização',
        'Condução de desligamentos',
      ],
    },
    {
      number: 10,
      title: 'Comunicação Interna',
      summary: 'Fazer a informação chegar em todos os níveis da operação.',
      topics: [
        'Canais e cadência de comunicação',
        'Comunicação de mudanças difíceis',
        'Liderança como multiplicadora da mensagem',
      ],
    },
    {
      number: 11,
      title: 'Indicadores e People Analytics',
      summary: 'Traduzir o trabalho do RH em números que a diretoria entende.',
      topics: [
        'Indicadores essenciais: turnover, absenteísmo e tempo de contratação',
        'Como montar um painel de RH',
        'Apresentação de resultados para a diretoria',
      ],
    },
    {
      number: 12,
      title: 'Plano de Ação Final',
      summary: 'Você sai com o roteiro dos seus próximos 90 dias escrito.',
      topics: [
        'Consolidação do diagnóstico',
        'Definição de prioridades e responsáveis',
        'Apresentação do plano para a liderança',
      ],
    },
  ],
  bonuses: [
    {
      title: 'Kit de templates do RH Estratégico',
      description:
        'Planilhas e documentos base de descrição de cargo, roteiro de entrevista, plano de onboarding e painel de indicadores.',
      value: PLACEHOLDER.price,
    },
    {
      title: 'Encontro de mentoria em grupo',
      description:
        'Sessão ao vivo para levar o seu caso real e receber direcionamento da mentora e do grupo.',
      value: PLACEHOLDER.price,
    },
    {
      title: 'Comunidade de alunos',
      description:
        'Acesso ao grupo de profissionais de RH para trocar prática, indicação e oportunidade.',
      value: PLACEHOLDER.price,
    },
  ],
  offer: {
    priceFrom: PLACEHOLDER.priceFrom,
    price: PLACEHOLDER.price,
    installments: PLACEHOLDER.installments,
    priceNote: 'Condição válida para a turma atual.',
    checkoutUrl: PLACEHOLDER.checkout,
    ctaLabel: 'Garantir minha vaga',
    scarcityDeadline: PLACEHOLDER.deadline,
    scarcitySeats: PLACEHOLDER.seats,
  },
  guarantees: [
    {
      title: 'Garantia incondicional de ' + PLACEHOLDER.guaranteePeriod,
      description:
        'Se dentro do prazo você entender que a imersão não é para o seu momento, devolvemos o valor integral. O risco é nosso.',
    },
    {
      title: 'Acesso ao material da turma',
      description:
        'O material de apoio e as gravações ficam disponíveis na área do aluno durante o período da turma.',
    },
  ],
  faq: [
    {
      question: 'Preciso já trabalhar com RH para participar?',
      answer:
        'Não. A imersão atende tanto quem está estruturando a área do zero quanto empreendedores e gestores que hoje acumulam a função de pessoas.',
    },
    {
      question: 'As aulas são ao vivo ou gravadas?',
      answer:
        'Os encontros são ao vivo e ficam gravados na área do aluno para você rever no seu ritmo, dentro do período da turma.',
    },
    {
      question: 'Quanto tempo por semana eu preciso dedicar?',
      answer:
        'A carga horária total da turma é de ' +
        PLACEHOLDER.workload +
        ', distribuída entre encontros ao vivo e atividades práticas.',
    },
    {
      question: 'Vou receber certificado?',
      answer: 'Sim. O certificado é emitido ao concluir a trilha completa da imersão.',
    },
    {
      question: 'Serve para empresa pequena?',
      answer:
        'Serve — e é onde o método costuma render mais rápido, porque quase tudo ainda pode ser desenhado do jeito certo desde o começo.',
    },
    {
      question: 'Como funciona o pagamento?',
      answer:
        'O pagamento é feito no checkout, com as condições exibidas na seção de investimento desta página.',
    },
    {
      question: 'E se eu não gostar?',
      answer:
        'Você tem ' +
        PLACEHOLDER.guaranteePeriod +
        ' de garantia incondicional. Basta pedir o reembolso dentro do prazo.',
    },
  ],
  testimonials: [
    { name: PLACEHOLDER.videoTestimonial, role: 'Aluna da Imersão', quote: PLACEHOLDER.videoTestimonial, videoUrl: '' },
    { name: PLACEHOLDER.videoTestimonial, role: 'Gestor de Pessoas', quote: PLACEHOLDER.videoTestimonial, videoUrl: '' },
    { name: PLACEHOLDER.videoTestimonial, role: 'Empresária', quote: PLACEHOLDER.videoTestimonial, videoUrl: '' },
  ],
  metaTitle: 'Imersão RH Estratégico | Estruture o RH da sua empresa do zero',
  metaDescription:
    'Imersão online e ao vivo com Lidiane Delcastanher: processos, cultura e indicadores para transformar o RH em parceiro de resultado. Vagas limitadas por turma.',
};

/** Mock indexado por slug. Novos cursos entram aqui sem criar componente novo. */
export const COURSES: Record<string, Course> = {
  [IMERSAO_RH.slug]: IMERSAO_RH,
};

export const DEFAULT_COURSE_SLUG = IMERSAO_RH.slug;

export function findCourseBySlug(slug: string | null | undefined): Course | null {
  if (!slug) {
    return null;
  }
  return COURSES[slug] ?? null;
}
