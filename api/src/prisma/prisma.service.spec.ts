import { InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';

const mockPrismaPg = jest.fn();

// Adapter falso com a identificacao que o PrismaClient exige, para que o
// service seja testado sem abrir conexao com o Neon.
jest.mock('@prisma/adapter-pg', () => ({
  PrismaPg: class {
    readonly provider = 'postgres';
    readonly adapterName = '@prisma/adapter-pg';

    constructor(...args: unknown[]) {
      mockPrismaPg(...args);
    }

    connect() {
      return Promise.resolve({});
    }
  },
}));

// Importado depois do mock para que o service resolva o adapter mockado.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PrismaService } = require('./prisma.service') as typeof import('./prisma.service');

const DATABASE_URL = 'postgresql://user:pass@localhost:5432/test';

async function build(env: Record<string, string | undefined> = { DATABASE_URL }) {
  const moduleRef = await Test.createTestingModule({
    providers: [
      PrismaService,
      { provide: ConfigService, useValue: { get: (key: string) => env[key] } },
    ],
  }).compile();

  return moduleRef.get(PrismaService);
}

describe('PrismaService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('cria o adapter com a DATABASE_URL do ambiente', async () => {
    await build();

    expect(mockPrismaPg).toHaveBeenCalledWith({ connectionString: DATABASE_URL });
  });

  it('falha de forma explicita quando a DATABASE_URL nao esta configurada', async () => {
    await expect(build({})).rejects.toThrow(InternalServerErrorException);
  });

  it('conecta ao banco no onModuleInit', async () => {
    const service = await build();
    const connect = jest.spyOn(service, '$connect').mockResolvedValue(undefined);

    await service.onModuleInit();

    expect(connect).toHaveBeenCalledTimes(1);
  });

  it('desconecta do banco no onModuleDestroy', async () => {
    const service = await build();
    const disconnect = jest.spyOn(service, '$disconnect').mockResolvedValue(undefined);

    await service.onModuleDestroy();

    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
