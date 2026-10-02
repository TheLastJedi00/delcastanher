import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { InternalInvoicesController } from './internal-invoices.controller';
import { InvoicesService } from './invoices.service';

const CRON_SECRET = 'segredo-do-cron';

async function buildApp() {
  const invoices = {
    reconcile: jest
      .fn()
      .mockResolvedValue({ refreshed: 1, emitted: 0, completed: 2, certificateWarning: false }),
  };

  const moduleRef = await Test.createTestingModule({
    controllers: [InternalInvoicesController],
    providers: [
      { provide: InvoicesService, useValue: invoices },
      { provide: ConfigService, useValue: { get: (key: string) => ({ CRON_SECRET })[key] } },
    ],
  }).compile();

  const app: INestApplication = moduleRef.createNestApplication();

  await app.init();

  return { app, invoices };
}

/** Spec 023, decisoes A5 e A10: a rede do webhook, pelo Vercel Cron. */
describe('GET /internal/invoices/reconcile', () => {
  it('recusa com 401 sem o CRON_SECRET', async () => {
    const { app, invoices } = await buildApp();

    await request(app.getHttpServer()).get('/internal/invoices/reconcile').expect(401);
    await request(app.getHttpServer())
      .get('/internal/invoices/reconcile')
      .set('Authorization', 'Bearer errado')
      .expect(401);

    expect(invoices.reconcile).not.toHaveBeenCalled();

    await app.close();
  });

  it('reconcilia com o segredo e devolve o que fez', async () => {
    const { app, invoices } = await buildApp();

    await request(app.getHttpServer())
      .get('/internal/invoices/reconcile')
      .set('Authorization', `Bearer ${CRON_SECRET}`)
      .expect(200)
      .expect({ refreshed: 1, emitted: 0, completed: 2, certificateWarning: false });

    expect(invoices.reconcile).toHaveBeenCalledTimes(1);

    await app.close();
  });

  it('esta no cron diario do vercel.json', () => {
    const vercel = JSON.parse(readFileSync(join(__dirname, '..', '..', 'vercel.json'), 'utf8')) as {
      crons: { path: string }[];
    };

    expect(vercel.crons.map((cron) => cron.path)).toContain('/internal/invoices/reconcile');
  });
});
