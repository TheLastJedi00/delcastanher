/**
 * Cria (ou atualiza) os usuarios de teste da plataforma no Firebase Auth.
 *
 * O projeto Firebase nasce sem nenhum usuario, entao sem isso nao ha como
 * exercitar o login em desenvolvimento. O script e idempotente: se a conta ja
 * existir, apenas redefine a senha, o nome e a custom claim `role`.
 *
 *   npm run seed:users
 *   SEED_PASSWORD='OutraSenha@123' npm run seed:users
 *
 * Reaproveita o AppModule, entao usa exatamente a mesma leitura de credenciais
 * da API (FIREBASE_SERVICE_ACCOUNT_JSON) - nada de parsing duplicado aqui.
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { FirebaseService } from '../src/firebase/firebase.service';
import { Role } from '../src/auth/auth.types';

interface SeedUser {
  email: string;
  displayName: string;
  role: Role;
}

const SEED_USERS: readonly SeedUser[] = [
  {
    email: 'aluno@delcastanher.com',
    displayName: 'Aluno Teste',
    role: 'aluno',
  },
  {
    email: 'admin@delcastanher.com',
    displayName: 'Admin Teste',
    role: 'admin',
  },
];

const DEFAULT_PASSWORD = 'Delcas@2026';

/** Le o project_id da credencial so para exibir; o SDK ja foi configurado pelo AppModule. */
function projectId(): string {
  try {
    const parsed = JSON.parse(
      process.env.FIREBASE_SERVICE_ACCOUNT_JSON ?? '{}',
    ) as {
      project_id?: string;
    };

    return parsed.project_id ?? 'desconhecido';
  } catch {
    return 'desconhecido';
  }
}

async function seed(): Promise<void> {
  const password = process.env.SEED_PASSWORD ?? DEFAULT_PASSWORD;
  const force = process.argv.includes('--force');

  // O script redefine senhas de contas existentes: nunca deve rodar sem
  // intencao explicita contra um ambiente produtivo.
  if (process.env.NODE_ENV === 'production' && !force) {
    console.error(
      'NODE_ENV=production: recusando redefinir senhas. Use --force se for mesmo isso que voce quer.',
    );
    process.exitCode = 1;

    return;
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });

  try {
    const auth = app.get(FirebaseService).auth;

    // Deixa explicito qual projeto sera alterado antes de mexer em senhas.
    console.log(`Projeto Firebase: ${projectId()}\n`);

    for (const user of SEED_USERS) {
      const existing = await auth.getUserByEmail(user.email).catch(() => null);

      const record = existing
        ? await auth.updateUser(existing.uid, {
            password,
            displayName: user.displayName,
            emailVerified: true,
          })
        : await auth.createUser({
            email: user.email,
            password,
            displayName: user.displayName,
            emailVerified: true,
          });

      // O perfil vem daqui: o login le a claim `role` do token verificado.
      await auth.setCustomUserClaims(record.uid, { role: user.role });

      const acao = existing ? 'atualizado' : 'criado    ';

      console.log(
        `${acao}  ${user.email.padEnd(26)} role=${user.role.padEnd(5)} uid=${record.uid}`,
      );
    }

    console.log(
      `\n${SEED_USERS.length} usuario(s) prontos. Senha aplicada: ${password}`,
    );
  } finally {
    await app.close();
  }
}

seed().catch((error: unknown) => {
  console.error(
    'Falhou:',
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
});
