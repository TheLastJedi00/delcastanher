import { ConflictException, INestApplication, NotFoundException, ValidationPipe } from '@nestjs/common';
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

  describe('detalhe', () => {
    it('GET devolve o detalhe do aluno', async () => {
      const findOne = jest.fn().mockResolvedValue({ id: 'uid-ana', name: 'Ana Silva' });
      app = await buildApp({ findOne });

      const response = await request(app.getHttpServer())
        .get('/admin/users/uid-ana')
        .expect(200);

      expect(findOne).toHaveBeenCalledWith('uid-ana');
      expect(response.body).toMatchObject({ id: 'uid-ana' });
    });

    it('propaga o 404 de id inexistente', async () => {
      const findOne = jest.fn().mockRejectedValue(new NotFoundException('nao encontrado'));
      app = await buildApp({ findOne });

      await request(app.getHttpServer()).get('/admin/users/uid-fantasma').expect(404);
    });

    it('recusa o papel aluno com 403', async () => {
      const findOne = jest.fn();
      app = await buildApp({ findOne }, 'aluno');

      await request(app.getHttpServer()).get('/admin/users/uid-ana').expect(403);

      expect(findOne).not.toHaveBeenCalled();
    });
  });

  describe('papel', () => {
    it('PATCH troca o papel e responde 204', async () => {
      const setRole = jest.fn().mockResolvedValue(undefined);
      app = await buildApp({ setRole });

      await request(app.getHttpServer())
        .patch('/admin/users/uid-ana/role')
        .send({ role: 'admin' })
        .expect(204);

      expect(setRole).toHaveBeenCalledWith(
        expect.objectContaining({ uid: 'uid-admin' }),
        'uid-ana',
        'admin',
      );
    });

    it('recusa papel fora do conjunto com 400', async () => {
      const setRole = jest.fn();
      app = await buildApp({ setRole });

      await request(app.getHttpServer())
        .patch('/admin/users/uid-ana/role')
        .send({ role: 'root' })
        .expect(400);

      expect(setRole).not.toHaveBeenCalled();
    });

    // Spec 013, decisao 10: a UI antecipa o motivo, mas a regra e do servidor.
    it('propaga o 409 de mudar o proprio papel', async () => {
      const setRole = jest.fn().mockRejectedValue(new ConflictException('proprio papel'));
      app = await buildApp({ setRole });

      await request(app.getHttpServer())
        .patch('/admin/users/uid-admin/role')
        .send({ role: 'aluno' })
        .expect(409);
    });

    it('recusa o papel aluno com 403', async () => {
      const setRole = jest.fn();
      app = await buildApp({ setRole }, 'aluno');

      await request(app.getHttpServer())
        .patch('/admin/users/uid-ana/role')
        .send({ role: 'admin' })
        .expect(403);

      expect(setRole).not.toHaveBeenCalled();
    });
  });

  describe('situacao', () => {
    it('PATCH bloqueia e responde 204', async () => {
      const setBlocked = jest.fn().mockResolvedValue(undefined);
      app = await buildApp({ setBlocked });

      await request(app.getHttpServer())
        .patch('/admin/users/uid-ana/status')
        .send({ blocked: true })
        .expect(204);

      expect(setBlocked).toHaveBeenCalledWith(
        expect.objectContaining({ uid: 'uid-admin' }),
        'uid-ana',
        true,
      );
    });

    it('recusa corpo sem o booleano com 400', async () => {
      const setBlocked = jest.fn();
      app = await buildApp({ setBlocked });

      await request(app.getHttpServer())
        .patch('/admin/users/uid-ana/status')
        .send({})
        .expect(400);

      expect(setBlocked).not.toHaveBeenCalled();
    });

    it('recusa o papel aluno com 403', async () => {
      const setBlocked = jest.fn();
      app = await buildApp({ setBlocked }, 'aluno');

      await request(app.getHttpServer())
        .patch('/admin/users/uid-ana/status')
        .send({ blocked: true })
        .expect(403);

      expect(setBlocked).not.toHaveBeenCalled();
    });
  });

  describe('exportacao', () => {
    const CSV = '﻿Nome;E-mail\nAna Silva;ana@empresa.com\n';

    // A rota precisa ser casada antes de `:id`, senao "export" vira o id de um
    // usuario e a resposta e um 404.
    it('GET export devolve o CSV, e nao cai na rota de detalhe', async () => {
      const exportCsv = jest.fn().mockResolvedValue(CSV);
      const findOne = jest.fn();
      app = await buildApp({ exportCsv, findOne });

      const response = await request(app.getHttpServer())
        .get('/admin/users/export')
        .expect(200);

      expect(findOne).not.toHaveBeenCalled();
      expect(response.text).toContain('Ana Silva;ana@empresa.com');
    });

    it('devolve o arquivo como anexo datado', async () => {
      app = await buildApp({ exportCsv: jest.fn().mockResolvedValue(CSV) });

      const response = await request(app.getHttpServer())
        .get('/admin/users/export')
        .expect(200);

      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.headers['content-disposition']).toMatch(
        /attachment; filename="alunos-\d{4}-\d{2}-\d{2}\.csv"/,
      );
    });

    it('repassa o filtro corrente da tela', async () => {
      const exportCsv = jest.fn().mockResolvedValue(CSV);
      app = await buildApp({ exportCsv });

      await request(app.getHttpServer())
        .get('/admin/users/export?search=ana&status=bloqueado')
        .expect(200);

      expect(exportCsv).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'ana', status: 'bloqueado' }),
      );
    });

    it('recusa o papel aluno com 403', async () => {
      const exportCsv = jest.fn();
      app = await buildApp({ exportCsv }, 'aluno');

      await request(app.getHttpServer()).get('/admin/users/export').expect(403);

      expect(exportCsv).not.toHaveBeenCalled();
    });
  });
});
