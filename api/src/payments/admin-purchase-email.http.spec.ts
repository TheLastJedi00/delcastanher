import { BadGatewayException, ConflictException, INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthService } from '../auth/auth.service';
import { Role } from '../auth/auth.types';
import { AuthenticatedRequest, FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { AdminPurchaseEmailController } from './admin-purchase-email.controller';
import { PurchaseEmailService } from './purchase-email.service';

const ENVIADO_EM = new Date('2026-10-05T15:00:00.000Z');

async function buildApp(role: Role | null = 'admin', resend?: jest.Mock) {
  const purchaseEmail = {
    resend: resend ?? jest.fn().mockResolvedValue({ confirmationEmailedAt: ENVIADO_EM }),
  };

  const moduleRef = await Test.createTestingModule({
    controllers: [AdminPurchaseEmailController],
    providers: [
      Reflector,
      RolesGuard,
      { provide: PurchaseEmailService, useValue: purchaseEmail },
      { provide: AuthService, useValue: { verify: jest.fn() } },
    ],
  })
    .overrideGuard(FirebaseAuthGuard)
    .useValue({
      canActivate: (context: { switchToHttp: () => { getRequest: () => AuthenticatedRequest } }) => {
        if (role) {
          context.switchToHttp().getRequest().user = {
            uid: 'uid-1',
            email: 'pessoa@delcastanher.com',
            name: 'Pessoa',
            role,
          };
        }

        return true;
      },
    })
    .compile();

  const app: INestApplication = moduleRef.createNestApplication();
  await app.init();

  return { app, purchaseEmail };
}

const ROUTE = '/admin/orders/ord-1/confirmation-email';

/** "Reenviar confirmacao" do financeiro (Spec 024, Task 3.4). */
describe('POST /admin/orders/:orderId/confirmation-email', () => {
  it('reenvia e devolve a data do envio', async () => {
    const { app, purchaseEmail } = await buildApp();

    const response = await request(app.getHttpServer()).post(ROUTE).expect(200);

    expect(purchaseEmail.resend).toHaveBeenCalledWith('ord-1');
    expect(response.body).toEqual({ confirmationEmailedAt: ENVIADO_EM.toISOString() });

    await app.close();
  });

  it('recusa aluno com 403 e quem nao tem sessao com 401', async () => {
    for (const [role, status] of [['aluno', 403], [null, 401]] as const) {
      const { app, purchaseEmail } = await buildApp(role);

      await request(app.getHttpServer()).post(ROUTE).expect(status);
      expect(purchaseEmail.resend).not.toHaveBeenCalled();

      await app.close();
    }
  });

  it('repassa o 409 de pedido nao pago e o 502 da recusa do Resend, com a mensagem', async () => {
    const naoPago = await buildApp(
      'admin',
      jest.fn().mockRejectedValue(new ConflictException('Só pedido pago recebe a confirmação de compra.')),
    );
    const semChave = await buildApp(
      'admin',
      jest.fn().mockRejectedValue(new BadGatewayException('Não foi possível enviar o e-mail: chave ausente')),
    );

    const conflito = await request(naoPago.app.getHttpServer()).post(ROUTE).expect(409);
    const gateway = await request(semChave.app.getHttpServer()).post(ROUTE).expect(502);

    expect(conflito.body.message).toContain('pedido pago');
    expect(gateway.body.message).toContain('Não foi possível enviar o e-mail');

    await naoPago.app.close();
    await semChave.app.close();
  });
});
