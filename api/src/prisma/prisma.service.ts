import { Injectable, InternalServerErrorException, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

/**
 * URL do Neon. Lida antes do `super()`, por isso mora fora da classe: o
 * Prisma 7 exige um driver adapter ja pronto na construcao do client.
 */
function connectionString(config: ConfigService): string {
  const url = config.get<string>('DATABASE_URL');

  if (!url) {
    throw new InternalServerErrorException('DATABASE_URL nao configurada.');
  }

  return url;
}

/**
 * Prisma Client exposto como provider do Nest. Estender o client mantem a
 * API original (`prisma.user.findUnique(...)`) e adiciona apenas o ciclo de
 * vida do modulo, que abre e fecha a conexao junto com a aplicacao.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: ConfigService) {
    super({ adapter: new PrismaPg({ connectionString: connectionString(config) }) });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Conectado ao banco de dados.');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
