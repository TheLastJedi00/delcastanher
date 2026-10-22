import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentTestService, TEST_PAYMENT_CENTS } from './payment-test.service';

interface Row {
  id: string;
  enabled: boolean;
  accessKey: string | null;
  enabledAt: Date | null;
  enabledById: string | null;
}

async function build(initial: Row | null = null) {
  let row = initial;
  const prisma = {
    paymentTestSettings: {
      findUnique: jest.fn(async () => row),
      upsert: jest.fn(async ({ create, update }: { create: Row; update: Partial<Row> }) => {
        row = row ? { ...row, ...update } : { ...create };

        return row;
      }),
    },
  };

  const moduleRef = await Test.createTestingModule({
    providers: [PaymentTestService, { provide: PrismaService, useValue: prisma }],
  }).compile();

  return { service: moduleRef.get(PaymentTestService), prisma, current: () => row };
}

/** Spec 030, decisoes 2 e 3. */
describe('PaymentTestService', () => {
  it('o preco e R$ 1,00', () => {
    expect(TEST_PAYMENT_CENTS).toBe(100);
  });

  it('sem linha na tabela, o teste conta como desligado', async () => {
    const { service } = await build();

    await expect(service.status()).resolves.toEqual({
      enabled: false,
      priceCents: 100,
      accessKey: null,
      enabledAt: null,
    });
  });

  it('ligar gera uma chave base64url de 43 caracteres e guarda quem ligou', async () => {
    const { service, current } = await build();

    const status = await service.setEnabled(true, 'uid-admin');

    expect(status.enabled).toBe(true);
    expect(status.accessKey).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(status.enabledAt).toBeInstanceOf(Date);
    expect(current()).toMatchObject({ id: 'default', enabled: true, enabledById: 'uid-admin' });
  });

  it('desligar apaga a chave', async () => {
    const { service, current } = await build();

    await service.setEnabled(true, 'uid-admin');
    const status = await service.setEnabled(false, 'uid-admin');

    expect(status).toMatchObject({ enabled: false, accessKey: null });
    expect(current()?.accessKey).toBeNull();
  });

  it('religar gera uma chave diferente', async () => {
    const { service } = await build();

    const first = await service.setEnabled(true, 'uid-admin');
    await service.setEnabled(false, 'uid-admin');
    const second = await service.setEnabled(true, 'uid-admin');

    expect(second.accessKey).not.toBe(first.accessKey);
  });

  it('ligar de novo com o teste ja ligado mantem a chave', async () => {
    const { service } = await build();

    const first = await service.setEnabled(true, 'uid-admin');
    const again = await service.setEnabled(true, 'uid-admin');

    expect(again.accessKey).toBe(first.accessKey);
  });

  describe('resolve', () => {
    it('devolve o produto com a chave certa e o teste ligado', async () => {
      const { service } = await build();
      const { accessKey } = await service.setEnabled(true, 'uid-admin');

      await expect(service.resolve(accessKey as string)).resolves.toEqual({
        title: 'Módulo de teste',
        summary: expect.any(String),
        priceCents: 100,
      });
    });

    it.each([
      ['chave errada', 'A'.repeat(43)],
      ['chave de outro tamanho', 'abc'],
      ['chave vazia', ''],
    ])('devolve nulo com %s', async (_case, key) => {
      const { service } = await build();

      await service.setEnabled(true, 'uid-admin');

      await expect(service.resolve(key)).resolves.toBeNull();
    });

    it('devolve nulo com o teste desligado, mesmo com a chave antiga', async () => {
      const { service } = await build();
      const { accessKey } = await service.setEnabled(true, 'uid-admin');

      await service.setEnabled(false, 'uid-admin');

      await expect(service.resolve(accessKey as string)).resolves.toBeNull();
    });
  });
});
