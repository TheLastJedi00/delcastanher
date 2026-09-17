import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthService } from '../auth/auth.service';
import { AuthUser, Role } from '../auth/auth.types';
import { AuthenticatedRequest, FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { AdminLessonsController } from './admin-lessons.controller';
import { LessonsService } from './lessons.service';

function userWith(role: Role): AuthUser {
  return { uid: 'uid-1', email: 'pessoa@delcastanher.com', name: 'Pessoa', role };
}

async function buildApp(role: Role = 'admin') {
  const lessons = {
    updateModulePrice: jest.fn().mockResolvedValue({ id: 'mod-1', priceCents: 24900 }),
  };

  const moduleRef = await Test.createTestingModule({
    controllers: [AdminLessonsController],
    providers: [
      Reflector,
      RolesGuard,
      { provide: LessonsService, useValue: lessons },
      { provide: AuthService, useValue: { verify: jest.fn() } },
    ],
  })
    .overrideGuard(FirebaseAuthGuard)
    .useValue({
      canActivate: (context: { switchToHttp: () => { getRequest: () => AuthenticatedRequest } }) => {
        context.switchToHttp().getRequest().user = userWith(role);

        return true;
      },
    })
    .compile();

  const app: INestApplication = moduleRef.createNestApplication();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      stopAtFirstError: true,
    }),
  );

  await app.init();

  return { app, lessons };
}

/**
 * Preco do modulo (Spec 014, decisao 1).
 *
 * E esta rota que troca os R$ 199,00 provisorios da migration pelo preco
 * definitivo — sem redeploy, porque preco e dado operacional, e nao constante
 * de codigo.
 */
describe('PATCH /admin/modules/:moduleId/price', () => {
  it('grava o preco em centavos', async () => {
    const { app, lessons } = await buildApp();

    await request(app.getHttpServer())
      .patch('/admin/modules/mod-1/price')
      .send({ priceCents: 24900 })
      .expect(200);

    expect(lessons.updateModulePrice).toHaveBeenCalledWith('mod-1', 24900);

    await app.close();
  });

  // Nulo e "a definir", e nao "de graca": o modulo sai da venda e volta a
  // aparecer como "em breve" na loja.
  it('aceita nulo como volta para "a definir"', async () => {
    const { app, lessons } = await buildApp();

    await request(app.getHttpServer())
      .patch('/admin/modules/mod-1/price')
      .send({ priceCents: null })
      .expect(200);

    expect(lessons.updateModulePrice).toHaveBeenCalledWith('mod-1', null);

    await app.close();
  });

  it('recusa preco negativo e preco zero', async () => {
    const { app, lessons } = await buildApp();

    await request(app.getHttpServer())
      .patch('/admin/modules/mod-1/price')
      .send({ priceCents: -100 })
      .expect(400);

    await request(app.getHttpServer())
      .patch('/admin/modules/mod-1/price')
      .send({ priceCents: 0 })
      .expect(400);

    expect(lessons.updateModulePrice).not.toHaveBeenCalled();

    await app.close();
  });

  // Centavos sao inteiros: aceitar 199.9 gravaria um valor que ninguem sabe se
  // e R$ 1,99 ou R$ 199,90.
  it('recusa preco fracionario', async () => {
    const { app, lessons } = await buildApp();

    await request(app.getHttpServer())
      .patch('/admin/modules/mod-1/price')
      .send({ priceCents: 199.9 })
      .expect(400);

    expect(lessons.updateModulePrice).not.toHaveBeenCalled();

    await app.close();
  });

  it('recusa o papel aluno com 403', async () => {
    const { app, lessons } = await buildApp('aluno');

    await request(app.getHttpServer())
      .patch('/admin/modules/mod-1/price')
      .send({ priceCents: 24900 })
      .expect(403);

    expect(lessons.updateModulePrice).not.toHaveBeenCalled();

    await app.close();
  });
});
