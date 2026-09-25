import { INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthService } from '../auth/auth.service';
import { AuthUser, Role } from '../auth/auth.types';
import { AuthenticatedRequest, FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { AdminMercadoPagoController } from './admin-mercado-pago.controller';
import { MercadoPagoConnectionService } from './mercado-pago-connection.service';
import { MercadoPagoLinkService } from './mercado-pago-link.service';

const VIEW = {
  environment: 'production',
  status: 'connected',
  account: { mpUserId: '123', nickname: 'LIDIANE', email: 'l@exemplo.com' },
  connectedAt: '2026-09-25T12:00:00.000Z',
  connectedByEmail: 'admin@delcastanher.com',
  expiresAt: '2027-03-24T12:00:00.000Z',
  lastRefreshedAt: null,
  disconnectedAt: null,
  disconnectReason: null,
  expiringSoon: false,
};

async function buildApp(role: Role | null = 'admin') {
  const connections = {
    view: jest.fn().mockResolvedValue(VIEW),
    disconnect: jest.fn().mockResolvedValue(undefined),
  };
  const links = {
    createLink: jest.fn().mockResolvedValue({
      url: 'https://auth.mercadopago.com/authorization?state=s',
      expiresAt: '2026-09-26T12:00:00.000Z',
    }),
  };

  const moduleRef = await Test.createTestingModule({
    controllers: [AdminMercadoPagoController],
    providers: [
      Reflector,
      RolesGuard,
      { provide: MercadoPagoConnectionService, useValue: connections },
      { provide: MercadoPagoLinkService, useValue: links },
      { provide: AuthService, useValue: { verify: jest.fn() } },
    ],
  })
    .overrideGuard(FirebaseAuthGuard)
    .useValue({
      canActivate: (context: { switchToHttp: () => { getRequest: () => AuthenticatedRequest } }) => {
        if (!role) {
          throw new UnauthorizedException();
        }

        const user: AuthUser = { uid: 'uid-admin', email: 'admin@delcastanher.com', name: 'Admin', role };
        context.switchToHttp().getRequest().user = user;

        return true;
      },
    })
    .compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();

  return { app, connections, links };
}

const BASE = '/admin/mercadopago/connection';

/** Spec 020, decisao 12. */
describe('Admin — conta recebedora (HTTP)', () => {
  let app: INestApplication;

  afterEach(async () => {
    await app?.close();
  });

  it('recusa sem sessao e com papel aluno, nas tres rotas', async () => {
    ({ app } = await buildApp(null));
    await request(app.getHttpServer()).get(BASE).expect(401);
    await request(app.getHttpServer()).post(`${BASE}/link`).expect(401);
    await request(app.getHttpServer()).delete(BASE).expect(401);
    await app.close();

    ({ app } = await buildApp('aluno'));
    await request(app.getHttpServer()).get(BASE).expect(403);
    await request(app.getHttpServer()).post(`${BASE}/link`).expect(403);
    await request(app.getHttpServer()).delete(BASE).expect(403);
  });

  it('mostra o estado da conexao', async () => {
    ({ app } = await buildApp());

    const response = await request(app.getHttpServer()).get(BASE).expect(200);

    expect(response.body).toEqual(VIEW);
  });

  // O autor vem do token, e nunca do corpo: autoria declarada pelo cliente nao
  // e autoria (mesma regra do GatewayFeeRate, Spec 016).
  it('gera o link com o admin da sessao como autor', async () => {
    let links: { createLink: jest.Mock };
    ({ app, links } = await buildApp());

    const response = await request(app.getHttpServer())
      .post(`${BASE}/link`)
      .send({ createdById: 'outra-pessoa' })
      .expect(201);

    expect(links.createLink).toHaveBeenCalledWith({ id: 'uid-admin', email: 'admin@delcastanher.com' });
    expect(response.body).toEqual({
      url: 'https://auth.mercadopago.com/authorization?state=s',
      expiresAt: '2026-09-26T12:00:00.000Z',
    });
  });

  it('desconecta e devolve o estado novo', async () => {
    let connections: { disconnect: jest.Mock; view: jest.Mock };
    ({ app, connections } = await buildApp());

    await request(app.getHttpServer()).delete(BASE).expect(200);

    expect(connections.disconnect).toHaveBeenCalled();
    expect(connections.view).toHaveBeenCalled();
  });

  it('nenhuma resposta leva token', async () => {
    ({ app } = await buildApp());

    const bodies = [
      (await request(app.getHttpServer()).get(BASE)).text,
      (await request(app.getHttpServer()).post(`${BASE}/link`)).text,
      (await request(app.getHttpServer()).delete(BASE)).text,
    ];

    for (const body of bodies) {
      expect(body).not.toMatch(/accessToken|refreshToken|Encrypted|codeVerifier/);
    }
  });
});
