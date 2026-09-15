/**
 * Cria (ou atualiza) um usuario de teste no Firebase Auth com senha conhecida e
 * papel definido, para a verificacao funcional local da Spec 012.
 *
 *   npx ts-node -P tsconfig.json scripts/create-test-user.ts <email> <senha> <aluno|admin>
 *
 * Reaproveita o AppModule, entao usa exatamente a mesma leitura de credenciais
 * da API, como o `manage-role.ts`.
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { Role } from '../src/auth/auth.types';
import { FirebaseService } from '../src/firebase/firebase.service';

async function main(): Promise<void> {
  const [email, password, role] = process.argv.slice(2);

  if (!email || !password || (role !== 'aluno' && role !== 'admin')) {
    console.error('Uso: create-test-user.ts <email> <senha> <aluno|admin>');
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });

  try {
    const auth = app.get(FirebaseService).auth;

    const user = await auth
      .getUserByEmail(email)
      .then((existing) => auth.updateUser(existing.uid, { password, emailVerified: true }))
      .catch(() => auth.createUser({ email, password, emailVerified: true }));

    await auth.setCustomUserClaims(user.uid, { role: role as Role });

    console.log(`${email} pronto com papel "${role}" (uid ${user.uid}).`);
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
