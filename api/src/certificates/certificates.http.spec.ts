import { ConflictException, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthService } from '../auth/auth.service';
import { AuthUser } from '../auth/auth.types';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { CertificatesController } from './certificates.controller';
import { CertificatesService } from './certificates.service';

const USER: AuthUser = {
  uid: 'uid-123',
  email: 'aluno@delcastanher.com',
  name: 'Aluno Teste',
  role: 'aluno',
};

const CERTIFICATE = {
  code: 'DELC-ABCD-2345',
  hash: 'a'.repeat(64),
  studentName: 'Aluno Teste',
  courseTitle: 'Imersão RH Estratégico',
  workloadHours: null,
  issuedAt: new Date('2026-09-10T12:00:00.000Z').toISOString(),
  status: 'ACTIVE',
};

/**
 * Aqui o guard NAO e substituido por um passa-tudo: ele e trocado pelo guard
 * real com um `AuthService` falso, para que a rota publica seja verificada
 * como publica de verdade — se alguem colar `@UseGuards` na classe, este
 * arquivo quebra.
 */
async function buildApp(
  certificates: Partial<Record<keyof CertificatesService, jest.Mock>>,
  verifyToken: jest.Mock = jest.fn().mockResolvedValue(USER),
) {
  const moduleRef = await Test.createTestingModule({
    controllers: [CertificatesController],
    providers: [
      { provide: CertificatesService, useValue: certificates },
      { provide: AuthService, useValue: { verify: verifyToken } },
      FirebaseAuthGuard,
    ],
  }).compile();

  const app = moduleRef.createNestApplication();

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  await app.init();

  return app;
}

describe('Certificates (HTTP)', () => {
  let app: INestApplication;

  afterEach(async () => {
    await app?.close();
  });

  describe('rotas do aluno', () => {
    it('GET /certificates/me devolve o certificado do usuario da sessao', async () => {
      const findForUser = jest.fn().mockResolvedValue(CERTIFICATE);
      app = await buildApp({ findForUser });

      const response = await request(app.getHttpServer())
        .get('/certificates/me')
        .set('Authorization', 'Bearer token-valido')
        .expect(200);

      expect(response.body).toEqual(CERTIFICATE);
      expect(findForUser).toHaveBeenCalledWith(USER);
    });

    it('GET /certificates/me exige token', async () => {
      const findForUser = jest.fn();
      app = await buildApp({ findForUser });

      await request(app.getHttpServer()).get('/certificates/me').expect(401);

      expect(findForUser).not.toHaveBeenCalled();
    });

    it('POST /certificates/me emite o diploma', async () => {
      const issueForUser = jest.fn().mockResolvedValue(CERTIFICATE);
      app = await buildApp({ issueForUser });

      const response = await request(app.getHttpServer())
        .post('/certificates/me')
        .set('Authorization', 'Bearer token-valido')
        .expect(201);

      expect(response.body).toMatchObject({ code: 'DELC-ABCD-2345' });
    });

    it('POST /certificates/me exige token', async () => {
      const issueForUser = jest.fn();
      app = await buildApp({ issueForUser });

      await request(app.getHttpServer()).post('/certificates/me').expect(401);

      expect(issueForUser).not.toHaveBeenCalled();
    });

    it('POST /certificates/me responde 409 com a trilha incompleta', async () => {
      app = await buildApp({
        issueForUser: jest.fn().mockRejectedValue(new ConflictException('Conclua todos')),
      });

      await request(app.getHttpServer())
        .post('/certificates/me')
        .set('Authorization', 'Bearer token-valido')
        .expect(409);
    });
  });

  describe('rotas do certificado de modulo', () => {
    const MODULE_CERTIFICATE = {
      ...CERTIFICATE,
      code: 'DELC-MODU-2345',
      scope: 'module',
      moduleId: 'mod-1',
      moduleTitle: 'Módulo 1: Fundamentos do RH',
    };

    it('POST /certificates/me/modules/:moduleId emite o diploma do modulo', async () => {
      const issueForModule = jest.fn().mockResolvedValue(MODULE_CERTIFICATE);
      app = await buildApp({ issueForModule });

      const response = await request(app.getHttpServer())
        .post('/certificates/me/modules/mod-1')
        .set('Authorization', 'Bearer token-valido')
        .expect(201);

      expect(issueForModule).toHaveBeenCalledWith(USER, 'mod-1');
      expect(response.body).toMatchObject({ scope: 'module', moduleId: 'mod-1' });
    });

    it('POST do diploma de modulo exige token', async () => {
      const issueForModule = jest.fn();
      app = await buildApp({ issueForModule });

      await request(app.getHttpServer()).post('/certificates/me/modules/mod-1').expect(401);
      expect(issueForModule).not.toHaveBeenCalled();
    });

    it('POST responde 409 com o modulo ainda em aberto', async () => {
      app = await buildApp({
        issueForModule: jest.fn().mockRejectedValue(new ConflictException('em aberto')),
      });

      await request(app.getHttpServer())
        .post('/certificates/me/modules/mod-1')
        .set('Authorization', 'Bearer token-valido')
        .expect(409);
    });

    it('GET /certificates/me/modules lista os diplomas de modulo', async () => {
      const findModuleCertificates = jest.fn().mockResolvedValue([MODULE_CERTIFICATE]);
      app = await buildApp({ findModuleCertificates });

      const response = await request(app.getHttpServer())
        .get('/certificates/me/modules')
        .set('Authorization', 'Bearer token-valido')
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(findModuleCertificates).toHaveBeenCalledWith(USER);
    });

    it('GET /certificates/me/modules exige token', async () => {
      const findModuleCertificates = jest.fn();
      app = await buildApp({ findModuleCertificates });

      await request(app.getHttpServer()).get('/certificates/me/modules').expect(401);
      expect(findModuleCertificates).not.toHaveBeenCalled();
    });

    it('GET /certificates/me/modules nao colide com GET /certificates/me', async () => {
      const me = jest.fn().mockResolvedValue(null);
      const findModuleCertificates = jest.fn().mockResolvedValue([]);
      app = await buildApp({ findForUser: me, findModuleCertificates });

      await request(app.getHttpServer())
        .get('/certificates/me/modules')
        .set('Authorization', 'Bearer token-valido')
        .expect(200);

      // A rota mais especifica precisa vir antes da generica no controller.
      expect(me).not.toHaveBeenCalled();
    });
  });

  describe('verificacao publica', () => {
    it('responde sem nenhum token — o recrutador nao tem conta', async () => {
      const verify = jest
        .fn()
        .mockResolvedValue({ status: 'valid', certificate: { code: 'DELC-ABCD-2345' } });
      const verifyToken = jest.fn();
      app = await buildApp({ verify }, verifyToken);

      const response = await request(app.getHttpServer())
        .get('/certificates/verify/DELC-ABCD-2345')
        .expect(200);

      expect(response.body.status).toBe('valid');
      // Nenhuma verificacao de token foi sequer tentada nesta rota.
      expect(verifyToken).not.toHaveBeenCalled();
    });

    it('ignora um token invalido enviado por engano', async () => {
      const verify = jest.fn().mockResolvedValue({ status: 'not_found' });
      app = await buildApp({ verify }, jest.fn().mockRejectedValue(new Error('token invalido')));

      await request(app.getHttpServer())
        .get('/certificates/verify/DELC-ZZZZ-9999')
        .set('Authorization', 'Bearer lixo')
        .expect(200);
    });

    it('distingue os dois escopos na resposta publica', async () => {
      const verify = jest.fn().mockResolvedValue({
        status: 'valid',
        certificate: {
          code: 'DELC-MODU-2345',
          scope: 'module',
          studentName: 'Aluno Teste',
          courseTitle: 'Imersão RH Estratégico',
          moduleTitle: 'Módulo 1: Fundamentos do RH',
          workloadHours: null,
          issuedAt: CERTIFICATE.issuedAt,
        },
      });
      app = await buildApp({ verify });

      const response = await request(app.getHttpServer())
        .get('/certificates/verify/DELC-MODU-2345')
        .expect(200);

      expect(response.body.certificate).toMatchObject({
        scope: 'module',
        moduleTitle: 'Módulo 1: Fundamentos do RH',
      });
      // Nem no escopo de modulo o portal recebe PII ou id interno (decisao 12).
      const exposed = JSON.stringify(response.body);
      expect(exposed).not.toContain('aluno@delcastanher.com');
      expect(exposed).not.toContain('uid-123');
      expect(exposed).not.toContain('mod-1');
    });

    it('devolve not_found para codigo inexistente, com 200', async () => {
      app = await buildApp({ verify: jest.fn().mockResolvedValue({ status: 'not_found' }) });

      const response = await request(app.getHttpServer())
        .get('/certificates/verify/DELC-ZZZZ-9999')
        .expect(200);

      expect(response.body).toEqual({ status: 'not_found' });
    });

    it('devolve invalid com o motivo da revogacao', async () => {
      app = await buildApp({
        verify: jest.fn().mockResolvedValue({ status: 'invalid', reason: 'revoked' }),
      });

      const response = await request(app.getHttpServer())
        .get('/certificates/verify/DELC-ABCD-2345')
        .expect(200);

      expect(response.body).toEqual({ status: 'invalid', reason: 'revoked' });
    });

    it('repassa o codigo digitado para o servico normalizar', async () => {
      const verify = jest.fn().mockResolvedValue({ status: 'not_found' });
      app = await buildApp({ verify });

      await request(app.getHttpServer()).get('/certificates/verify/delc-abcd-2345').expect(200);

      expect(verify).toHaveBeenCalledWith('delc-abcd-2345');
    });
  });
});
