import { INestApplication, NotFoundException, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthService } from '../auth/auth.service';
import { AuthUser, Role } from '../auth/auth.types';
import { AuthenticatedRequest, FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { MuxService } from '../mux/mux.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { AdminLessonsController } from './admin-lessons.controller';
import { LessonsService } from './lessons.service';

function userWith(role: Role): AuthUser {
  return { uid: 'uid-1', email: 'pessoa@delcastanher.com', name: 'Pessoa', role };
}

async function buildApp(role: Role = 'admin') {
  const lessons = {
    updateModuleWorkload: jest.fn().mockResolvedValue({ id: 'mod-1', workloadHours: 6 }),
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
 * Carga horaria do modulo (Spec 023, Parte D). E o numero que o diploma de
 * modulo imprime; ate a Parte D ele imprimia a carga do curso inteiro.
 */
describe('PATCH /admin/modules/:moduleId/workload', () => {
  it('grava a carga horaria em horas inteiras', async () => {
    const { app, lessons } = await buildApp();

    await request(app.getHttpServer())
      .patch('/admin/modules/mod-1/workload')
      .send({ workloadHours: 6 })
      .expect(200);

    expect(lessons.updateModuleWorkload).toHaveBeenCalledWith('mod-1', 6);

    await app.close();
  });

  // Nulo e "a definir", como na carga do curso: o diploma volta a mostrar o
  // placeholder, e nao "0 horas".
  it('aceita nulo como volta para "a definir"', async () => {
    const { app, lessons } = await buildApp();

    await request(app.getHttpServer())
      .patch('/admin/modules/mod-1/workload')
      .send({ workloadHours: null })
      .expect(200);

    expect(lessons.updateModuleWorkload).toHaveBeenCalledWith('mod-1', null);

    await app.close();
  });

  it('recusa zero, negativo, fracionario, texto e acima de 999', async () => {
    const { app, lessons } = await buildApp();

    for (const workloadHours of [0, -3, 2.5, '12', 1000]) {
      await request(app.getHttpServer())
        .patch('/admin/modules/mod-1/workload')
        .send({ workloadHours })
        .expect(400);
    }

    expect(lessons.updateModuleWorkload).not.toHaveBeenCalled();

    await app.close();
  });

  it('recusa campo a mais no corpo', async () => {
    const { app, lessons } = await buildApp();

    await request(app.getHttpServer())
      .patch('/admin/modules/mod-1/workload')
      .send({ workloadHours: 6, title: 'Outro' })
      .expect(400);

    expect(lessons.updateModuleWorkload).not.toHaveBeenCalled();

    await app.close();
  });

  it('recusa o papel aluno com 403', async () => {
    const { app, lessons } = await buildApp('aluno');

    await request(app.getHttpServer())
      .patch('/admin/modules/mod-1/workload')
      .send({ workloadHours: 6 })
      .expect(403);

    expect(lessons.updateModuleWorkload).not.toHaveBeenCalled();

    await app.close();
  });
});

describe('LessonsService.updateModuleWorkload', () => {
  const MODULE = {
    id: 'mod-1',
    order: 1,
    title: 'Fundamentos do RH',
    summary: 'Resumo',
    priceCents: 19900,
    workloadHours: null as number | null,
  };

  async function build(found: typeof MODULE | null = MODULE) {
    const prisma = {
      module: {
        findUnique: jest.fn().mockResolvedValue(found),
        update: jest.fn(async ({ data }: { data: { workloadHours: number | null } }) => ({
          ...MODULE,
          ...data,
          _count: { lessons: 3 },
        })),
      },
      certificate: { count: jest.fn().mockResolvedValue(2) },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        LessonsService,
        { provide: PrismaService, useValue: prisma },
        { provide: StorageService, useValue: {} },
        { provide: MuxService, useValue: {} },
      ],
    }).compile();

    return { service: moduleRef.get(LessonsService), prisma };
  }

  it('grava a carga e devolve o modulo como o painel o ve', async () => {
    const { service, prisma } = await build();

    const updated = await service.updateModuleWorkload('mod-1', 6);

    expect(prisma.module.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'mod-1' }, data: { workloadHours: 6 } }),
    );
    expect(updated).toMatchObject({ id: 'mod-1', workloadHours: 6, lessonCount: 3, certificateCount: 2 });
  });

  it('recusa modulo inexistente', async () => {
    const { service, prisma } = await build(null);

    await expect(service.updateModuleWorkload('nao-existe', 6)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.module.update).not.toHaveBeenCalled();
  });
});
