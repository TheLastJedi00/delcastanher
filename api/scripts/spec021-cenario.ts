/**
 * Cenario da verificacao funcional da Spec 021 (adicionar administrador).
 *
 *   npx ts-node -P tsconfig.json scripts/spec021-cenario.ts preparar
 *   npx ts-node -P tsconfig.json scripts/spec021-cenario.ts senha <email>
 *   npx ts-node -P tsconfig.json scripts/spec021-cenario.ts conferir
 *   npx ts-node -P tsconfig.json scripts/spec021-cenario.ts limpar
 *
 * `preparar` cria, com senha conhecida:
 *   - spec021-admin@example.com   admin com onboarding feito (quem opera o painel)
 *   - spec021-aluna@example.com   aluna com onboarding feito (caminho "promoted")
 *   - spec021-bloqueada@example.com  aluna bloqueada (caminho 409)
 * e garante que spec021-novo@example.com NAO exista (caminho "created").
 *
 * `senha` faz o papel do link do e-mail de definicao de senha, que para um
 * dominio example.com nunca chega: define a senha conhecida na conta.
 *
 * `limpar` apaga as quatro contas do Firebase e do banco. O banco e o de
 * producao, com o app ainda nao lancado (memoria do projeto).
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { FirebaseService } from '../src/firebase/firebase.service';
import { LegalDocumentsService } from '../src/legal/legal-documents.service';
import { PrismaService } from '../src/prisma/prisma.service';

const PASSWORD = 'Spec021-teste!';
const ADMIN = 'spec021-admin@example.com';
const ALUNA = 'spec021-aluna@example.com';
const BLOQUEADA = 'spec021-bloqueada@example.com';
const NOVO = 'spec021-novo@example.com';
const ALL = [ADMIN, ALUNA, BLOQUEADA, NOVO];

async function main(): Promise<void> {
  const [mode, email] = process.argv.slice(2);
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const auth = app.get(FirebaseService).auth;
  const prisma = app.get(PrismaService);
  // A versao vigente vem do banco desde a Spec 022 (decisao 7).
  const policyVersion = await app.get(LegalDocumentsService).policyVersion();

  const uidOf = (address: string) =>
    auth.getUserByEmail(address).then(
      (user) => user.uid,
      () => null,
    );

  /** Conta com senha conhecida, papel e perfil completo, como se tivesse feito o onboarding. */
  async function seed(address: string, name: string, role: 'aluno' | 'admin', disabled = false) {
    const existing = await uidOf(address);
    const user = existing
      ? await auth.updateUser(existing, { password: PASSWORD, emailVerified: true, disabled })
      : await auth.createUser({ email: address, password: PASSWORD, emailVerified: true, disabled });

    await auth.setCustomUserClaims(user.uid, { role });

    const profile = {
      email: address,
      name,
      bio: 'Conta de teste da Spec 021.',
      phone: '(11) 90000-0021',
      role,
      onboardingCompleted: true,
      policyAcceptedAt: new Date(),
      policyAcceptedVersion: policyVersion,
      blockedAt: disabled ? new Date() : null,
    };

    await prisma.user.upsert({ where: { id: user.uid }, update: profile, create: { id: user.uid, ...profile } });
    console.log(`${address} pronto (${role}${disabled ? ', bloqueada' : ''}).`);
  }

  async function remove(address: string) {
    const uid = await uidOf(address);

    if (uid) {
      await auth.deleteUser(uid);
    }

    const { count } = await prisma.user.deleteMany({ where: { email: address } });
    console.log(`${address}: ${uid ? 'removida do Firebase' : 'sem conta no Firebase'}, ${count} linha(s) no banco.`);
  }

  try {
    switch (mode) {
      case 'preparar':
        await seed(ADMIN, 'Admin Spec 021', 'admin');
        await seed(ALUNA, 'Aluna Spec 021', 'aluno');
        await seed(BLOQUEADA, 'Bloqueada Spec 021', 'aluno', true);
        await remove(NOVO);
        console.log(`Senha de todas: ${PASSWORD}`);
        break;

      case 'senha': {
        const uid = email ? await uidOf(email) : null;

        if (!uid) {
          throw new Error(`Conta ${email ?? '(sem e-mail)'} nao encontrada.`);
        }

        await auth.updateUser(uid, { password: PASSWORD });
        console.log(`Senha de ${email} definida como ${PASSWORD}.`);
        break;
      }

      case 'conferir':
        for (const address of ALL) {
          const uid = await uidOf(address);
          const claims = uid ? (await auth.getUser(uid)).customClaims : undefined;
          const row = await prisma.user.findUnique({
            where: { email: address },
            select: { role: true, name: true, onboardingCompleted: true, lastSeenAt: true, blockedAt: true },
          });
          console.log(address, { firebase: uid ? { claims } : null, banco: row });
        }
        break;

      case 'limpar':
        for (const address of ALL) {
          await remove(address);
        }
        break;

      default:
        console.error('Uso: spec021-cenario.ts <preparar|senha <email>|conferir|limpar>');
        process.exitCode = 1;
    }
  } finally {
    await app.close();
  }
}

void main();
