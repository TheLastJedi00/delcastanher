/**
 * Confere se o Firebase Auth reconhece o dominio do front como destino do
 * link de definicao de senha (Spec 017, decisao 8 e Task 6.2).
 *
 *   npm run spec017:firebase-dominio
 *   npm run spec017:firebase-dominio -- https://outro.dominio   # testa outra origem
 *
 * Usa `generatePasswordResetLink` do Admin SDK, que valida o `continueUrl`
 * contra "Authorized domains" exatamente como o e-mail real, mas **nao envia
 * e-mail nenhum**: o link e so gerado e descartado.
 *
 * Roda duas vezes. A primeira, com o dominio do front, precisa gerar o link.
 * A segunda, com um dominio que certamente nao esta autorizado, precisa ser
 * recusada — e o controle: sem ele, um "passou" nao provaria que o Firebase
 * esta de fato conferindo o dominio.
 *
 * Reaproveita o AppModule, entao le as mesmas credenciais da API.
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { FirebaseService } from '../src/firebase/firebase.service';

const DEFAULT_ORIGIN = 'https://www.delcastanher.srv.br';
const CONTROL_ORIGIN = 'https://dominio-nao-autorizado.invalid';
const UNAUTHORIZED = 'auth/unauthorized-continue-uri';

type Outcome = { ok: true } | { ok: false; code: string };

async function main(): Promise<void> {
  const origin = (process.argv.slice(2).find((arg) => arg.startsWith('http')) ?? DEFAULT_ORIGIN).replace(/\/$/, '');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });

  try {
    const auth = app.get(FirebaseService).auth;

    // Qualquer conta existente serve: o link nao e enviado a ninguem.
    const { users } = await auth.listUsers(1);
    const email = users[0]?.email;

    if (!email) {
      console.error('Nenhuma conta com e-mail no projeto para gerar o link de teste.');
      process.exitCode = 1;

      return;
    }

    const linkFor = async (base: string): Promise<Outcome> => {
      try {
        await auth.generatePasswordResetLink(email, { url: `${base}/login` });

        return { ok: true };
      } catch (error) {
        return { ok: false, code: (error as { code?: string }).code ?? String(error) };
      }
    };

    const target = await linkFor(origin);
    const control = await linkFor(CONTROL_ORIGIN);

    console.log(`Dominio testado: ${origin}`);
    console.log(`  ${target.ok ? 'OK    ' : 'FALHOU'} link gerado com continueUrl ${origin}/login` +
      (target.ok ? '' : ` (${target.code})`));
    console.log(`Controle: ${CONTROL_ORIGIN}`);
    const controlRefused = !control.ok && control.code === UNAUTHORIZED;

    console.log(`  ${controlRefused ? 'OK    ' : 'FALHOU'} recusado com ${UNAUTHORIZED}` +
      (control.ok ? ' (foi ACEITO: o Firebase nao esta conferindo o dominio)' : controlRefused ? '' : ` (${control.code})`));

    if (!target.ok || !controlRefused) {
      if (!target.ok && target.code === UNAUTHORIZED) {
        console.error(`\nAdicione ${new URL(origin).hostname} em Authentication > Settings > Authorized domains.`);
      }

      process.exitCode = 1;
    }
  } finally {
    await app.close();
  }
}

void main();
