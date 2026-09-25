import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { MercadoPagoConnectionService } from './mercado-pago-connection.service';
import { MercadoPagoLinkService } from './mercado-pago-link.service';
import { InternalMercadoPagoController, MercadoPagoOAuthController } from './mercado-pago-oauth.controller';

const CRON_SECRET = 'segredo-do-cron';
const OK = 'https://www.delcastanher.srv.br/conexao-mercado-pago?resultado=ok';

async function buildApp() {
  const links = {
    complete: jest.fn().mockResolvedValue(OK),
    purgeStates: jest.fn().mockResolvedValue(2),
  };
  const connections = { refreshDue: jest.fn().mockResolvedValue({ checked: 1 }) };
  const config = { get: jest.fn((name: string) => (name === 'CRON_SECRET' ? CRON_SECRET : undefined)) };

  const moduleRef = await Test.createTestingModule({
    controllers: [MercadoPagoOAuthController, InternalMercadoPagoController],
    providers: [
      { provide: MercadoPagoLinkService, useValue: links },
      { provide: MercadoPagoConnectionService, useValue: connections },
      { provide: ConfigService, useValue: config },
    ],
  }).compile();

  const app = moduleRef.createNestApplication();
  await app.init();

  return { app, links, connections };
}

/** Spec 020, decisoes 5 e 8. */
describe('OAuth do Mercado Pago (HTTP)', () => {
  let app: INestApplication;

  afterEach(async () => {
    await app?.close();
  });

  describe('GET /mercadopago/oauth/callback', () => {
    // Publica: quem volta do Mercado Pago e o vendedor, que nao tem sessao aqui.
    // Quem autentica o retorno e o `state`.
    it('responde sem sessao e redireciona para o que o servico decidiu', async () => {
      let links: { complete: jest.Mock };
      ({ app, links } = await buildApp());

      const response = await request(app.getHttpServer())
        .get('/mercadopago/oauth/callback?code=TG-code&state=estado-1')
        .expect(302);

      expect(response.headers.location).toBe(OK);
      expect(links.complete).toHaveBeenCalledWith({ code: 'TG-code', state: 'estado-1', error: undefined });
    });

    it('repassa a recusa do vendedor', async () => {
      let links: { complete: jest.Mock };
      ({ app, links } = await buildApp());

      await request(app.getHttpServer())
        .get('/mercadopago/oauth/callback?error=access_denied&state=estado-1')
        .expect(302);

      expect(links.complete).toHaveBeenCalledWith({
        code: undefined,
        state: 'estado-1',
        error: 'access_denied',
      });
    });
  });

  describe('GET /internal/mercadopago/refresh', () => {
    it('recusa sem o segredo do cron', async () => {
      let connections: { refreshDue: jest.Mock };
      ({ app, connections } = await buildApp());

      await request(app.getHttpServer()).get('/internal/mercadopago/refresh').expect(401);
      await request(app.getHttpServer())
        .get('/internal/mercadopago/refresh')
        .set('Authorization', 'Bearer errado')
        .expect(401);

      expect(connections.refreshDue).not.toHaveBeenCalled();
    });

    it('renova e limpa os estados vencidos com o segredo certo', async () => {
      let connections: { refreshDue: jest.Mock };
      let links: { purgeStates: jest.Mock };
      ({ app, connections, links } = await buildApp());

      const response = await request(app.getHttpServer())
        .get('/internal/mercadopago/refresh')
        .set('Authorization', `Bearer ${CRON_SECRET}`)
        .expect(200);

      expect(connections.refreshDue).toHaveBeenCalled();
      expect(links.purgeStates).toHaveBeenCalled();
      expect(response.body).toEqual({ checked: 1, purgedStates: 2 });
    });
  });
});
