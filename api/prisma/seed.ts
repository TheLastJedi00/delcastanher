/**
 * Seed do curso unico da plataforma e dos seus 12 modulos.
 *
 *   npm run db:seed
 *
 * Os titulos e resumos sao os mesmos da grade publicada em
 * `front/src/app/core/mocks/courses.mock.ts` — a pagina de vendas e a trilha do
 * aluno precisam prometer e entregar exatamente a mesma lista.
 *
 * O script e idempotente: roda quantas vezes for preciso sem duplicar modulo
 * nem apagar o progresso de quem ja estudou.
 *
 * Preco e vagas entram **so na criacao** (Spec 019, decisao 1): rodar de novo
 * nao desfaz um reajuste feito no painel. Em banco que ja existia, quem aplica
 * a tabela comercial e a migration `20260925120100`, uma vez.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

/** Mesmo slug do mock do front (`DEFAULT_COURSE_SLUG`). */
const COURSE_SLUG = 'imersao-rh';

const COURSE = {
  slug: COURSE_SLUG,
  title: 'Imersão RH Estratégico',
  // Nulo de proposito: a carga horaria ainda e placeholder no comercial.
  workloadHours: null,
};

const MODULES: readonly { order: number; title: string; summary: string; priceCents: number }[] = [
  {
    order: 1,
    title: 'Fundamentos do RH Estratégico',
    summary: 'O que separa o RH operacional do RH que participa da estratégia.',
    priceCents: 19700,
  },
  {
    order: 2,
    title: 'Diagnóstico Organizacional',
    summary: 'Onde a sua área está hoje e o que precisa ser atacado primeiro.',
    priceCents: 19700,
  },
  {
    order: 3,
    title: 'Recrutamento e Seleção',
    summary: 'Atrair e escolher a pessoa certa com critério, não com feeling.',
    priceCents: 29700,
  },
  {
    order: 4,
    title: 'Onboarding e Integração',
    summary: 'Os primeiros 90 dias que definem a permanência da pessoa.',
    priceCents: 19700,
  },
  {
    order: 5,
    title: 'Desenvolvimento e Trilhas de Aprendizado',
    summary: 'Formar gente dentro de casa em vez de repor sempre do mercado.',
    priceCents: 19700,
  },
  {
    order: 6,
    title: 'Gestão de Desempenho',
    summary: 'Avaliação que gera conversa de desenvolvimento, não constrangimento.',
    priceCents: 19700,
  },
  {
    order: 7,
    title: 'Clima e Cultura',
    summary: 'Segurança psicológica, pertencimento e comunicação assertiva.',
    priceCents: 19700,
  },
  {
    order: 8,
    title: 'Cargos, Salários e Reconhecimento',
    summary: 'Critério claro para remunerar e reconhecer sem gerar ruído.',
    priceCents: 19700,
  },
  {
    order: 9,
    title: 'Relações Trabalhistas e Compliance',
    summary: 'Reduzir passivo cuidando de processo e de conversa.',
    priceCents: 19700,
  },
  {
    order: 10,
    title: 'Comunicação Interna',
    summary: 'Fazer a informação chegar em todos os níveis da operação.',
    priceCents: 19700,
  },
  {
    order: 11,
    title: 'Indicadores e People Analytics',
    summary: 'Traduzir o trabalho do RH em números que a diretoria entende.',
    priceCents: 24700,
  },
  {
    order: 12,
    title: 'Plano de Ação Final',
    summary: 'Você sai com o roteiro dos seus próximos 90 dias escrito.',
    priceCents: 24700,
  },
];

/**
 * Pacote com os 12 modulos (Spec 019). O slug e o da Spec 019, que ja esta em
 * links publicados; o titulo e o da Spec 027.
 */
const BUNDLE = {
  slug: 'imersao-rh-lancamento',
  title: 'Imersão RH Estratégico — Pacote completo',
};

/** Preco unico, sem limite de vagas (Spec 027, decisao 3). */
const SINGLE_TIER = { order: 1, name: 'Preço único', priceCents: 98900, capacity: null };

function connectionString(): string {
  const url = process.env['DATABASE_URL_UNPOOLED'] ?? process.env['DATABASE_URL'];

  if (!url) {
    throw new Error('DATABASE_URL nao configurada.');
  }

  return url;
}

async function main(): Promise<void> {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: connectionString() }),
  });

  try {
    const course = await prisma.course.upsert({
      where: { slug: COURSE.slug },
      update: { title: COURSE.title },
      create: COURSE,
    });

    let createdLessons = 0;
    const moduleIds: string[] = [];

    for (const module of MODULES) {
      // Preco so no `create`: no `update` ele desfaria o reajuste do painel.
      const saved = await prisma.module.upsert({
        where: { courseId_order: { courseId: course.id, order: module.order } },
        update: { title: module.title, summary: module.summary },
        create: { courseId: course.id, ...module },
      });
      moduleIds.push(saved.id);

      // Aula inicial do modulo (Spec 012). Um modulo sem aula nenhuma nao
      // reproduz nada e nunca conclui — ele existe, mas nao entrega conteudo.
      //
      // Aqui o seed **cria sem atualizar**: a aula 1 de um modulo ja semeado
      // pode ter sido renomeada no painel e ter video e materiais pendurados,
      // e sobrescrever o titulo a cada `db:seed` desfaria o trabalho do
      // administrador. Rodar de novo nao duplica aula nem toca no progresso.
      const existing = await prisma.lesson.findUnique({
        where: { moduleId_order: { moduleId: saved.id, order: 1 } },
      });

      if (!existing) {
        await prisma.lesson.create({
          data: {
            moduleId: saved.id,
            order: 1,
            title: `Aula 1 — ${module.title}`,
            summary: module.summary,
          },
        });

        createdLessons += 1;
      }
    }

    // Pacote e lotes (Spec 019). O `update` vazio e de proposito: titulo,
    // preco e vagas sao do painel depois de criados, como o preco do modulo.
    const bundle = await prisma.bundle.upsert({
      where: { slug: BUNDLE.slug },
      update: {},
      create: { ...BUNDLE, courseId: course.id },
    });

    await prisma.bundleModule.createMany({
      data: moduleIds.map((moduleId) => ({ bundleId: bundle.id, moduleId })),
      skipDuplicates: true,
    });

    // Lote so em pacote sem nenhum (Spec 027, decisao 3). Um `upsert` por
    // ordem recriaria os lotes que a migration da Spec 027 apagou, com vagas,
    // e o pacote voltaria a ser vendido pelo preco de lancamento.
    const tierCount = await prisma.bundleTier.count({ where: { bundleId: bundle.id } });

    if (tierCount === 0) {
      await prisma.bundleTier.create({ data: { bundleId: bundle.id, ...SINGLE_TIER } });
    }

    console.log(
      `Curso "${course.title}" e ${MODULES.length} modulos sincronizados` +
        (createdLessons > 0 ? `, ${createdLessons} aula(s) inicial(is) criada(s)` : '') +
        `; pacote "${bundle.title}"` +
        (tierCount === 0 ? ' criado com o preco unico.' : ` com ${tierCount} lote(s), sem mudanca.`),
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
