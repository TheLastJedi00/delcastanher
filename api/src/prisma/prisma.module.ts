import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * Global como o `FirebaseModule`: a conexao com o banco e infraestrutura
 * compartilhada, e um pool unico por processo e o que o Neon espera.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
