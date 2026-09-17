import { ForbiddenException, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthUser } from '../auth/auth.types';
import { AuthenticatedRequest, FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { AccessService } from '../payments/access.service';
import { ContentController } from './content.controller';
import { ContentService } from './content.service';
import { VideoService } from './video.service';

const ALUNO: AuthUser = {
  uid: 'uid-aluno',
  email: 'aluno@delcastanher.com',
  name: 'Aluno',
  role: 'aluno',
};

const GRANT = { playbackId: 'pb-1', token: 'jwt', expiresAt: '2026-09-17T14:00:00.000Z' };

const MATERIAL = {
  id: 'mat-1',
  fileName: 'Checklist.pdf',
  fileType: 'pdf',
  moduleId: 'mod-1',
  lessonId: 'les-1',
  downloadUrl: 'https://storage.googleapis.com/leitura',
};

/**
 * Portao de conteudo (Spec 014, decisao 17).
 *
 * Ate a Spec 012 bastava estar autenticado: toda a plataforma era paga na
 * porta de entrada. Com a venda por modulo, video e material passam a exigir
 * **acesso ativo ao modulo da aula** — e essa exigencia mora aqui, no servidor,
 * e nao no cadeado que a trilha desenha.
 */
async function buildApp(access: Partial<Record<keyof AccessService, jest.Mock>>) {
  const content = {
    listForLesson: jest.fn().mockResolvedValue([MATERIAL]),
    // O filtro por modulo e da consulta, e nao da tela: o servico devolve o
    // que foi pedido, e nada do que nao foi.
    listForCourse: jest.fn(async (moduleIds: string[]) => (moduleIds.length ? [MATERIAL] : [])),
  };
  const video = { createPlaybackToken: jest.fn().mockResolvedValue(GRANT) };

  const moduleRef = await Test.createTestingModule({
    controllers: [ContentController],
    providers: [
      { provide: ContentService, useValue: content },
      { provide: VideoService, useValue: video },
      { provide: AccessService, useValue: access },
    ],
  })
    .overrideGuard(FirebaseAuthGuard)
    .useValue({
      canActivate: (context: { switchToHttp: () => { getRequest: () => AuthenticatedRequest } }) => {
        context.switchToHttp().getRequest().user = ALUNO;

        return true;
      },
    })
    .compile();

  const app: INestApplication = moduleRef.createNestApplication();

  await app.init();

  return { app, content, video };
}

/** Portao aberto: o modulo da aula tem acesso ativo. */
function granted() {
  return {
    requireForLesson: jest.fn().mockResolvedValue(undefined),
    activeMap: jest.fn().mockResolvedValue(new Map([['mod-1', new Date('2027-03-17')]])),
  };
}

/** Portao fechado: sem acesso, ou com acesso vencido — o 403 e o mesmo. */
function denied() {
  return {
    requireForLesson: jest.fn().mockRejectedValue(new ForbiddenException('sem acesso')),
    activeMap: jest.fn().mockResolvedValue(new Map()),
  };
}

describe('Conteudo do aluno sob o portao de acesso', () => {
  describe('GET /lessons/:lessonId/playback-token', () => {
    it('autoriza a reproducao quando o modulo tem acesso ativo', async () => {
      const { app, video } = await buildApp(granted());

      await request(app.getHttpServer()).get('/lessons/les-1/playback-token').expect(200);

      expect(video.createPlaybackToken).toHaveBeenCalledWith('les-1');

      await app.close();
    });

    // O token de playback e a chave do video no Mux: se ele sair sem acesso,
    // todo o resto do portao e decorativo.
    it('recusa com 403 e nao chega a assinar o token sem acesso', async () => {
      const { app, video } = await buildApp(denied());

      await request(app.getHttpServer()).get('/lessons/les-1/playback-token').expect(403);

      expect(video.createPlaybackToken).not.toHaveBeenCalled();

      await app.close();
    });
  });

  describe('GET /lessons/:lessonId/materials', () => {
    it('entrega os materiais da aula com acesso ativo', async () => {
      const { app, content } = await buildApp(granted());

      await request(app.getHttpServer()).get('/lessons/les-1/materials').expect(200);

      expect(content.listForLesson).toHaveBeenCalledWith('les-1');

      await app.close();
    });

    // A URL assinada de download nem chega a ser gerada: o servico de conteudo
    // nao e chamado.
    it('recusa com 403 e nao gera URL assinada sem acesso', async () => {
      const { app, content } = await buildApp(denied());

      await request(app.getHttpServer()).get('/lessons/les-1/materials').expect(403);

      expect(content.listForLesson).not.toHaveBeenCalled();

      await app.close();
    });
  });

  /**
   * A central de materiais e a unica rota de conteudo que nao fala de uma aula
   * so: ela lista o curso inteiro. Aqui o portao nao pode ser 403 — a resposta
   * certa e a lista **do que a pessoa comprou**, e nao um erro para quem tem
   * acesso a metade da trilha.
   */
  describe('GET /materials', () => {
    it('lista apenas os materiais dos modulos com acesso ativo', async () => {
      const { app, content } = await buildApp(granted());

      await request(app.getHttpServer()).get('/materials').expect(200);

      expect(content.listForCourse).toHaveBeenCalledWith(['mod-1']);

      await app.close();
    });

    it('devolve lista vazia, e nao o curso inteiro, para quem nao comprou nada', async () => {
      const { app, content } = await buildApp(denied());

      const response = await request(app.getHttpServer()).get('/materials').expect(200);

      expect(content.listForCourse).toHaveBeenCalledWith([]);
      expect(response.body).toEqual([]);

      await app.close();
    });
  });
});
