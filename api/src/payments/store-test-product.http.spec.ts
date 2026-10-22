import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { Role } from '../auth/auth.types';
import { AuthenticatedRequest, FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { PaymentTestService } from './payment-test.service';
import { StoreTestProductController } from './store-test-product.controller';

const KEY = 'k'.repeat(43);
const PRODUCT = { title: 'Módulo de teste', summary: 'Para testar o pagamento.', priceCents: 100 };

async function buildApp(role: Role | null) {
  const tests = {
    resolve: jest.fn(async (key: string) => (key === KEY ? PRODUCT : null)),
  };

  const moduleRef = await Test.createTestingModule({
    controllers: [StoreTestProductController],
    providers: [{ provide: PaymentTestService, useValue: tests }],
  })
    .overrideGuard(FirebaseAuthGuard)
    .useValue({
      canActivate: (context: { switchToHttp: () => { getRequest: () => AuthenticatedRequest } }) => {
        if (!role) {
          throw new UnauthorizedException();
        }

        context.switchToHttp().getRequest().user = {
          uid: 'uid-1',
          email: 'pessoa@delcastanher.com',
          name: 'Pessoa',
          role,
        };

        return true;
      },
    })
    .compile();

  const app: INestApplication = moduleRef.createNestApplication();
  await app.init();

  return { app, tests };
}

/** Spec 030, decisao 4 e resposta 1: so admin, e com a chave. */
describe('GET /store/test-product/:key', () => {
  it('devolve o produto ao admin com a chave certa', async () => {
    const { app } = await buildApp('admin');

    const response = await request(app.getHttpServer()).get(`/store/test-product/${KEY}`).expect(200);

    expect(response.body).toEqual(PRODUCT);

    await app.close();
  });

  it('responde 404 ao admin com a chave errada ou o teste desligado', async () => {
    const { app } = await buildApp('admin');

    const response = await request(app.getHttpServer()).get('/store/test-product/errada').expect(404);

    expect(response.body.message).toBe('Página não encontrada.');

    await app.close();
  });

  it('responde 404 ao aluno, mesmo com a chave certa, sem consultar a chave', async () => {
    const { app, tests } = await buildApp('aluno');

    const response = await request(app.getHttpServer()).get(`/store/test-product/${KEY}`).expect(404);

    expect(response.body.message).toBe('Página não encontrada.');
    expect(tests.resolve).not.toHaveBeenCalled();

    await app.close();
  });

  it('pede login a quem nao tem sessao', async () => {
    const { app } = await buildApp(null);

    await request(app.getHttpServer()).get(`/store/test-product/${KEY}`).expect(401);

    await app.close();
  });
});
