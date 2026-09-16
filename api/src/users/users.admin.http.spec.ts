import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthService } from '../auth/auth.service';
import { AuthUser, Role } from '../auth/auth.types';
import { AuthenticatedRequest, FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { AdminUsersController } from './users.admin.controller';
import { AdminUsersService } from './users.admin.service';

function userWith(role: Role): AuthUser {
  return { uid: 'uid-admin', email: 'admin@delcastanher.com', name: 'Admin', role };
}

const ITEM = {
  id: 'uid-ana',
  name: 'Ana Silva',
  email: 'ana@empresa.com',
  initials: 'AS',
  role: 'aluno',
  blocked: false,
  onboardingCompleted: true,
  createdAt: new Date('2026-08-10T12:00:00Z'),
  lastSeenAt: new Date('2026-09-14T12:00:00Z'),
  completedLessons: 3,
  totalLessons: 12,
  percentage: 25,
  currentModuleOrder: 2,
  currentModuleTitle: 'Diagnóstico',
  courseCompleted: false,
};

const RESULT = {
  items: [ITEM],
  total: 1,
  page: 1,
  pageSize: 20,
  kpis: { totalStudents: 10, activeStudents: 7, engagementRate: 50, windowDays: 30 },
};

/**
 * Mesmo arranjo dos demais `*.http.spec.ts`: sobe so o controller, com o
 * ValidationPipe global do `main.ts`. O `FirebaseAuthGuard` e trocado por um
 * que injeta o usuario do papel pedido — ou por nenhum usuario, para o caso
 * sem token; o `RolesGuard` e o **real**, que e o que esta sob teste aqui.
 */
async function buildApp(
  users: Partial<Record<keyof AdminUsersService, jest.Mock>>,
  role: Role | null = 'admin',
) {
  const moduleRef = await Test.createTestingModule({
    controllers: [AdminUsersController],
    providers: [
      Reflector,
      RolesGuard,
      { provide: AdminUsersService, useValue: users },
      { provide: AuthService, useValue: { verify: jest.fn() } },
    ],
  })
    .overrideGuard(FirebaseAuthGuard)
    .useValue({
      canActivate: (context: { switchToHttp: () => { getRequest: () => AuthenticatedRequest } }) => {
        if (role) {
          context.switchToHttp().getRequest().user = userWith(role);
        }

        return true;
      },
    })
    .compile();

  const app = moduleRef.createNestApplication();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      stopAtFirstError: true,
    }),
  );
  await app.init();

  return app;
}

describe('Admin — usuarios (HTTP)', () => {
  let app: INestApplication;

  afterEach(async () => {
    await app?.close();
  });

  it('GET devolve a pagina com itens e KPIs para o administrador', async () => {
    const list = jest.fn().mockResolvedValue(RESULT);
    app = await buildApp({ list });

    const response = await request(app.getHttpServer()).get('/admin/users').expect(200);

    expect(response.body.items[0]).toMatchObject({ id: 'uid-ana', percentage: 25 });
    expect(response.body.kpis).toMatchObject({ totalStudents: 10, windowDays: 30 });
  });

  it('aplica os defaults do DTO quando a query vem vazia', async () => {
    const list = jest.fn().mockResolvedValue(RESULT);
    app = await buildApp({ list });

    await request(app.getHttpServer()).get('/admin/users').expect(200);

    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, pageSize: 20, sort: 'nome', direction: 'asc' }),
    );
  });

  it('converte pagina e tamanho de texto da query para numero', async () => {
    const list = jest.fn().mockResolvedValue(RESULT);
    app = await buildApp({ list });

    await request(app.getHttpServer()).get('/admin/users?page=3&pageSize=50').expect(200);

    expect(list).toHaveBeenCalledWith(expect.objectContaining({ page: 3, pageSize: 50 }));
  });

  it('repassa busca, filtros e ordenacao', async () => {
    const list = jest.fn().mockResolvedValue(RESULT);
    app = await buildApp({ list });

    await request(app.getHttpServer())
      .get('/admin/users?search=ana&role=aluno&status=ativo&sort=acesso&direction=desc')
      .expect(200);

    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({
        search: 'ana',
        role: 'aluno',
        status: 'ativo',
        sort: 'acesso',
        direction: 'desc',
      }),
    );
  });

  // O papel `aluno` e o caso que importa: o cadastro inteiro da plataforma
  // esta atras desta rota.
  it('recusa o papel aluno com 403', async () => {
    const list = jest.fn();
    app = await buildApp({ list }, 'aluno');

    await request(app.getHttpServer()).get('/admin/users').expect(403);

    expect(list).not.toHaveBeenCalled();
  });

  // 401 e nao 403: a diferenca entre "entre de novo" e "sua conta nao pode
  // isso" importa para quem recebe.
  it('recusa requisicao sem sessao com 401', async () => {
    const list = jest.fn();
    app = await buildApp({ list }, null);

    await request(app.getHttpServer()).get('/admin/users').expect(401);

    expect(list).not.toHaveBeenCalled();
  });

  // Spec 013, decisao do DTO: valor fora do conjunto e recusado, e nao trocado
  // pelo default em silencio.
  it('recusa ordenacao por coluna inexistente com 400', async () => {
    const list = jest.fn();
    app = await buildApp({ list });

    await request(app.getHttpServer()).get('/admin/users?sort=salario').expect(400);

    expect(list).not.toHaveBeenCalled();
  });

  it('recusa situacao fora do conjunto com 400', async () => {
    app = await buildApp({ list: jest.fn() });

    await request(app.getHttpServer()).get('/admin/users?status=suspenso').expect(400);
  });

  it('recusa pagina zero e tamanho acima do teto com 400', async () => {
    app = await buildApp({ list: jest.fn() });

    await request(app.getHttpServer()).get('/admin/users?page=0').expect(400);
    await request(app.getHttpServer()).get('/admin/users?pageSize=500').expect(400);
  });

  it('recusa parametro desconhecido com 400', async () => {
    app = await buildApp({ list: jest.fn() });

    await request(app.getHttpServer()).get('/admin/users?ordem=nome').expect(400);
  });
});
