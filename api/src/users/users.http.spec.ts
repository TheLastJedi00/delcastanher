import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthService } from '../auth/auth.service';
import { AuthUser } from '../auth/auth.types';
import { AuthenticatedRequest, FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

const USER: AuthUser = {
  uid: 'uid-123',
  email: 'aluno@delcastanher.com',
  name: 'Aluno Teste',
  role: 'aluno',
};

const VALID_BODY = {
  name: 'Aluno Completo',
  bio: 'Analista de RH ha 8 anos.',
  phone: '(11) 90000-0000',
};

/**
 * Sobe apenas o controller, com o mesmo ValidationPipe global do `main.ts`, e
 * troca o guard por um que injeta um usuario fixo: o que se testa aqui e o
 * contrato HTTP das rotas, nao a verificacao do token.
 */
async function buildApp(users: Partial<Record<keyof UsersService, jest.Mock>>) {
  const moduleRef = await Test.createTestingModule({
    controllers: [UsersController],
    providers: [
      { provide: UsersService, useValue: users },
      { provide: AuthService, useValue: { verify: jest.fn() } },
    ],
  })
    .overrideGuard(FirebaseAuthGuard)
    .useValue({
      canActivate: (context: { switchToHttp: () => { getRequest: () => AuthenticatedRequest } }) => {
        context.switchToHttp().getRequest().user = USER;

        return true;
      },
    })
    .compile();

  const app = moduleRef.createNestApplication();

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  await app.init();

  return app;
}

describe('Users (HTTP)', () => {
  let app: INestApplication;

  afterEach(async () => {
    await app?.close();
  });

  it('GET /users/me devolve o perfil do usuario da sessao', async () => {
    const profile = { id: 'uid-123', onboardingCompleted: false };
    app = await buildApp({ findOrCreate: jest.fn().mockResolvedValue(profile) });

    const response = await request(app.getHttpServer()).get('/users/me').expect(200);

    expect(response.body).toEqual(profile);
  });

  it('PATCH /users/me responde 400 quando falta um campo obrigatorio', async () => {
    const update = jest.fn();
    app = await buildApp({ update });

    await request(app.getHttpServer())
      .patch('/users/me')
      .send({ name: 'So o nome' })
      .expect(400);

    expect(update).not.toHaveBeenCalled();
  });

  it('PATCH /users/me responde 400 quando o linkedin nao e uma URL', async () => {
    app = await buildApp({ update: jest.fn() });

    await request(app.getHttpServer())
      .patch('/users/me')
      .send({ ...VALID_BODY, linkedin: 'nao e url' })
      .expect(400);
  });

  it('PATCH /users/me grava o perfil e devolve o onboarding concluido', async () => {
    const updated = { id: 'uid-123', ...VALID_BODY, onboardingCompleted: true };
    app = await buildApp({ update: jest.fn().mockResolvedValue(updated) });

    const response = await request(app.getHttpServer())
      .patch('/users/me')
      .send(VALID_BODY)
      .expect(200);

    expect(response.body).toEqual(updated);
  });
});
