import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

/**
 * Prepara o cenario do teste funcional da Spec 014: um aluno com acesso
 * PARCIAL, que e o estado normal de quem compra por modulo.
 *
 * Revoga o acesso do aluno ao modulo 1 — o mesmo efeito do botao "Revogar" do
 * painel, que ja foi testado pela UI. Aqui e so montagem de cenario, para nao
 * exigir uma sessao de admin so para isso.
 *
 * Reverter: `npm run spec014:cenario -- --restaurar`.
 */
const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env['DATABASE_URL_UNPOOLED'] ?? process.env['DATABASE_URL'],
  }),
});

const EMAIL = process.argv.find((a) => a.includes('@')) ?? 'jediaelborges23@gmail.com';
const RESTAURAR = process.argv.includes('--restaurar');

async function main() {
  const user = await prisma.user.findUnique({ where: { email: EMAIL } });

  if (!user) {
    console.log(`Conta ${EMAIL} nao encontrada.`);
    return;
  }

  const primeiro = await prisma.module.findFirst({ orderBy: { order: 'asc' } });

  if (!primeiro) {
    console.log('Nenhum modulo cadastrado.');
    return;
  }

  if (RESTAURAR) {
    const seisMeses = new Date();
    seisMeses.setMonth(seisMeses.getMonth() + 6);

    await prisma.moduleAccess.upsert({
      where: { userId_moduleId: { userId: user.id, moduleId: primeiro.id } },
      update: { expiresAt: seisMeses, source: 'COURTESY' },
      create: {
        userId: user.id,
        moduleId: primeiro.id,
        expiresAt: seisMeses,
        source: 'COURTESY',
      },
    });

    console.log(`Acesso ao modulo 1 devolvido para ${EMAIL} (cortesia, 6 meses).`);
  } else {
    const { count } = await prisma.moduleAccess.deleteMany({
      where: { userId: user.id, moduleId: primeiro.id },
    });

    console.log(`Acesso ao modulo "${primeiro.title}" revogado de ${EMAIL} (${count} linha).`);
  }

  const ativos = await prisma.moduleAccess.count({
    where: { userId: user.id, expiresAt: { gt: new Date() } },
  });

  console.log(`${EMAIL} agora tem ${ativos} modulo(s) com acesso ativo. Papel: ${user.role}.`);
  await prisma.$disconnect();
}

main();
