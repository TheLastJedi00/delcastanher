import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthService } from '../auth/auth.service';
import { Role } from '../auth/auth.types';
import { AuthenticatedRequest, FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { AdminInvoicesController } from './admin-invoices.controller';
import { InvoicesService } from './invoices.service';

const NOTA = {
  id: 'inv-1',
  orderId: 'ord-1',
  status: 'AUTHORIZED',
  environment: 'homologacao',
  amountCents: 19900,
  providerInvoiceId: 'nts-1',
  number: '42',
  series: '1',
  accessKey: '35261012345678000195550010000000421234567890',
  protocol: '135',
  xmlPath: 'invoices/homologacao/chave.xml',
  pdfPath: 'invoices/homologacao/chave.pdf',
  cancelXmlPath: null,
  lastError: null,
  issuedAt: new Date('2026-10-02T12:00:00Z'),
  cancelledAt: null,
  emailedAt: new Date('2026-10-02T12:01:00Z'),
  createdAt: new Date('2026-10-02T12:00:00Z'),
  updatedAt: new Date('2026-10-02T12:01:00Z'),
};

async function buildApp(role: Role | null = 'admin') {
  const invoices = {
    settings: jest.fn().mockReturnValue({
      enabled: true,
      environment: 'homologacao',
      certificateExpiresAt: null,
      certificateDaysLeft: null,
      certificateWarning: false,
      cancelWindowHours: 24,
    }),
    reissue: jest.fn().mockResolvedValue(NOTA),
    link: jest.fn().mockResolvedValue(NOTA),
    cancel: jest.fn().mockResolvedValue({ ...NOTA, status: 'CANCELLING' }),
    resendEmail: jest.fn().mockResolvedValue(NOTA),
    pdfUrl: jest.fn().mockResolvedValue({ url: 'https://assinada', expiresAt: '2026-10-02T12:15:00Z' }),
    sync: jest.fn().mockResolvedValue(NOTA),
  };

  const moduleRef = await Test.createTestingModule({
    controllers: [AdminInvoicesController],
    providers: [
      Reflector,
      RolesGuard,
      { provide: InvoicesService, useValue: invoices },
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

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, stopAtFirstError: true }),
  );
  await app.init();

  return { app, invoices };
}

/** Spec 023, decisoes A2, A9 e A10. */
describe('/admin/invoices', () => {
  it('recusa aluno com 403 e quem nao tem sessao com 401, em todas as rotas', async () => {
    for (const [role, status] of [['aluno', 403], [null, 401]] as const) {
      const { app, invoices } = await buildApp(role);
      const server = app.getHttpServer();

      await request(server).get('/admin/invoices/config').expect(status);
      await request(server).post('/admin/invoices/ord-1/issue').send({}).expect(status);
      await request(server).post('/admin/invoices/ord-1/link').send({ invoiceId: 'x' }).expect(status);
      await request(server).post('/admin/invoices/ord-1/cancel').expect(status);
      await request(server).post('/admin/invoices/ord-1/email').expect(status);
      await request(server).get('/admin/invoices/ord-1/pdf').expect(status);
      await request(server).post('/admin/invoices/ord-1/sync').expect(status);

      expect(invoices.reissue).not.toHaveBeenCalled();
      expect(invoices.cancel).not.toHaveBeenCalled();

      await app.close();
    }
  });

  it('GET config devolve ambiente e certificado', async () => {
    const { app } = await buildApp();

    const response = await request(app.getHttpServer()).get('/admin/invoices/config').expect(200);

    expect(response.body).toMatchObject({ environment: 'homologacao', certificateWarning: false });

    await app.close();
  });

  it('emitir de novo repassa a confirmacao da decisao A2', async () => {
    const { app, invoices } = await buildApp();

    await request(app.getHttpServer())
      .post('/admin/invoices/ord-1/issue')
      .send({ confirmNoInvoice: true })
      .expect(200);
    await request(app.getHttpServer()).post('/admin/invoices/ord-2/issue').send({}).expect(200);

    expect(invoices.reissue).toHaveBeenNthCalledWith(1, 'ord-1', true);
    expect(invoices.reissue).toHaveBeenNthCalledWith(2, 'ord-2', false);

    await app.close();
  });

  it('vincular exige o invoiceId', async () => {
    const { app, invoices } = await buildApp();

    await request(app.getHttpServer()).post('/admin/invoices/ord-1/link').send({}).expect(400);
    await request(app.getHttpServer())
      .post('/admin/invoices/ord-1/link')
      .send({ invoiceId: ' nts-visto ' })
      .expect(200);

    expect(invoices.link).toHaveBeenCalledWith('ord-1', 'nts-visto');

    await app.close();
  });

  it('a resposta da nota nao expoe caminho do Storage', async () => {
    const { app } = await buildApp();

    const response = await request(app.getHttpServer()).post('/admin/invoices/ord-1/email').expect(200);

    expect(response.body).toMatchObject({ status: 'AUTHORIZED', number: '42', hasPdf: true });
    expect(response.body).not.toHaveProperty('pdfPath');
    expect(response.body).not.toHaveProperty('xmlPath');

    await app.close();
  });

  it('cancelar, atualizar e baixar o PDF chamam o servico', async () => {
    const { app, invoices } = await buildApp();
    const server = app.getHttpServer();

    await request(server).post('/admin/invoices/ord-1/cancel').expect(200);
    await request(server).post('/admin/invoices/ord-1/sync').expect(200);
    const pdf = await request(server).get('/admin/invoices/ord-1/pdf').expect(200);

    expect(invoices.cancel).toHaveBeenCalledWith('ord-1');
    expect(invoices.sync).toHaveBeenCalledWith('ord-1');
    expect(pdf.body.url).toBe('https://assinada');

    await app.close();
  });
});
