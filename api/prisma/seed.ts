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

const MODULES: readonly { order: number; title: string; summary: string }[] = [
  {
    order: 1,
    title: 'Fundamentos do RH Estratégico',
    summary: 'O que separa o RH operacional do RH que participa da estratégia.',
  },
  {
    order: 2,
    title: 'Diagnóstico Organizacional',
    summary: 'Onde a sua área está hoje e o que precisa ser atacado primeiro.',
  },
  {
    order: 3,
    title: 'Recrutamento e Seleção',
    summary: 'Atrair e escolher a pessoa certa com critério, não com feeling.',
  },
  {
    order: 4,
    title: 'Onboarding e Integração',
    summary: 'Os primeiros 90 dias que definem a permanência da pessoa.',
  },
  {
    order: 5,
    title: 'Desenvolvimento e Trilhas de Aprendizado',
    summary: 'Formar gente dentro de casa em vez de repor sempre do mercado.',
  },
  {
    order: 6,
    title: 'Gestão de Desempenho',
    summary: 'Avaliação que gera conversa de desenvolvimento, não constrangimento.',
  },
  {
    order: 7,
    title: 'Clima e Cultura',
    summary: 'Segurança psicológica, pertencimento e comunicação assertiva.',
  },
  {
    order: 8,
    title: 'Cargos, Salários e Reconhecimento',
    summary: 'Critério claro para remunerar e reconhecer sem gerar ruído.',
  },
  {
    order: 9,
    title: 'Relações Trabalhistas e Compliance',
    summary: 'Reduzir passivo cuidando de processo e de conversa.',
  },
  {
    order: 10,
    title: 'Comunicação Interna',
    summary: 'Fazer a informação chegar em todos os níveis da operação.',
  },
  {
    order: 11,
    title: 'Indicadores e People Analytics',
    summary: 'Traduzir o trabalho do RH em números que a diretoria entende.',
  },
  {
    order: 12,
    title: 'Plano de Ação Final',
    summary: 'Você sai com o roteiro dos seus próximos 90 dias escrito.',
  },
];

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

    for (const module of MODULES) {
      await prisma.module.upsert({
        where: { courseId_order: { courseId: course.id, order: module.order } },
        update: { title: module.title, summary: module.summary },
        create: { courseId: course.id, ...module },
      });
    }

    console.log(`Curso "${course.title}" e ${MODULES.length} modulos sincronizados.`);
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
