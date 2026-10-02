import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PrismaService } from '../prisma/prisma.service';
import { UnsubscribeController } from './unsubscribe.controller';
import { UnsubscribeService } from './unsubscribe.service';
import { signUnsubscribeToken } from './unsubscribe-token';

const SECRET = 'segredo-do-descadastro';

async function buildApp() {
  const updateMany = jest.fn().mockResolvedValue({ count: 1 });

  const moduleRef = await Test.createTestingModule({
    controllers: [UnsubscribeController],
    providers: [
      UnsubscribeService,
      { provide: PrismaService, useValue: { user: { updateMany } } },
      {
        provide: ConfigService,
        useValue: { get: (key: string) => ({ EMAIL_UNSUBSCRIBE_SECRET: SECRET })[key] },
      },
    ],
  }).compile();

  const app: INestApplication = moduleRef.createNestApplication();

  // O mesmo pipe do main.ts: com `forbidNonWhitelisted`, um DTO no corpo
  // recusaria o `List-Unsubscribe=One-Click` que o Gmail manda.
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));

  await app.init();

  return { app, updateMany };
}

/**
 * Descadastro de campanhas (Spec 023, decisao B5). Rota **publica**: quem chega
 * e o aluno pelo link do e-mail, ou o proprio Gmail no "Cancelar inscricao".
 * O que autentica e o token HMAC.
 */
describe('POST /email/unsubscribe', () => {
  it('grava marketingOptOutAt com o token da pagina, no corpo', async () => {
    const { app, updateMany } = await buildApp();

    await request(app.getHttpServer())
      .post('/email/unsubscribe')
      .send({ token: signUnsubscribeToken('uid-123', SECRET) })
      .expect(200)
      .expect({ unsubscribed: true });

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'uid-123', marketingOptOutAt: null },
      data: { marketingOptOutAt: expect.any(Date) },
    });

    await app.close();
  });

  // RFC 8058: o Gmail manda `List-Unsubscribe=One-Click` no corpo, como
  // formulario, para a URL do cabecalho — e o token vai na query.
  it('aceita o POST de um clique do Gmail, com o token na query', async () => {
    const { app, updateMany } = await buildApp();

    await request(app.getHttpServer())
      .post(`/email/unsubscribe?token=${signUnsubscribeToken('uid-123', SECRET)}`)
      .type('form')
      .send('List-Unsubscribe=One-Click')
      .expect(200);

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'uid-123', marketingOptOutAt: null } }),
    );

    await app.close();
  });

  it('recusa com 400 o token adulterado, sem tocar no banco', async () => {
    const { app, updateMany } = await buildApp();
    const [, signature] = signUnsubscribeToken('uid-123', SECRET).split('.');

    await request(app.getHttpServer())
      .post('/email/unsubscribe')
      .send({ token: `${Buffer.from('uid-outro').toString('base64url')}.${signature}` })
      .expect(400);

    expect(updateMany).not.toHaveBeenCalled();

    await app.close();
  });

  it('recusa com 400 a chamada sem token', async () => {
    const { app } = await buildApp();

    await request(app.getHttpServer()).post('/email/unsubscribe').send({}).expect(400);

    await app.close();
  });

  // Descadastrar quem ja se descadastrou nao muda a data: ela registra quando
  // a pessoa se opos, e um segundo clique nao e uma nova oposicao.
  it('repetir o descadastro responde 200 sem reescrever a data', async () => {
    const { app, updateMany } = await buildApp();

    updateMany.mockResolvedValue({ count: 0 });

    await request(app.getHttpServer())
      .post('/email/unsubscribe')
      .send({ token: signUnsubscribeToken('uid-123', SECRET) })
      .expect(200);

    await app.close();
  });
});
