/**
 * Gerencia o perfil (custom claim `role`) de um usuario ja existente no
 * Firebase Auth. Nao cria conta nem altera senha.
 *
 *   npm run role -- --promote aluno@delcastanher.com    # vira admin
 *   npm run role -- --revoke  admin@delcastanher.com    # volta para aluno
 *
 * Reaproveita o AppModule, entao usa exatamente a mesma leitura de credenciais
 * da API (FIREBASE_SERVICE_ACCOUNT_JSON) - nada de parsing duplicado aqui.
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { FirebaseService } from '../src/firebase/firebase.service';
import { Role } from '../src/auth/auth.types';

const USAGE = `
Uso:
  npm run role -- --promote <email>   Promove o usuario a admin
  npm run role -- --revoke  <email>   Revoga o admin, voltando o usuario a aluno
`.trim();

interface Args {
  email: string;
  target: Role;
}

/** Le e valida os argumentos; devolve null (com a mensagem impressa) se invalidos. */
function parseArgs(argv: readonly string[]): Args | null {
  const promote = argv.includes('--promote');
  const revoke = argv.includes('--revoke');
  const email = argv.find((arg) => !arg.startsWith('--'));

  if (promote === revoke) {
    console.error(
      promote
        ? 'Use --promote OU --revoke, nao os dois.'
        : 'Informe --promote ou --revoke.',
    );
    console.error(`\n${USAGE}`);

    return null;
  }

  if (!email) {
    console.error('Informe o e-mail do usuario.');
    console.error(`\n${USAGE}`);

    return null;
  }

  return {
    email: email.trim().toLowerCase(),
    target: promote ? 'admin' : 'aluno',
  };
}

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

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (!args) {
    process.exitCode = 1;

    return;
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });

  try {
    const auth = app.get(FirebaseService).auth;
    const user = await auth.getUserByEmail(args.email).catch(() => null);

    if (!user) {
      console.error(
        `Nenhum usuario com o e-mail ${args.email} em ${projectId()}.`,
      );
      process.exitCode = 1;

      return;
    }

    // Sem claim definida o backend ja trata o usuario como aluno.
    const current = (user.customClaims?.role as Role | undefined) ?? 'aluno';

    console.log(`Projeto Firebase: ${projectId()}`);
    console.log(`Usuario: ${args.email} (uid: ${user.uid})`);

    if (current === args.target) {
      console.log(`Ja esta como ${args.target}. Nada a fazer.`);

      return;
    }

    // setCustomUserClaims substitui todas as claims: preserva as demais.
    await auth.setCustomUserClaims(user.uid, {
      ...user.customClaims,
      role: args.target,
    });

    console.log(`Perfil alterado: ${current} -> ${args.target}`);
    console.log('\nO token atual continua com o perfil antigo ate expirar.');
    console.log(
      'Peca ao usuario para sair e entrar de novo para valer imediatamente.',
    );
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(
    'Falhou:',
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
});
