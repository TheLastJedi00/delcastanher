import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AccessService } from './access.service';

/**
 * Pagamento e acesso (Spec 014).
 *
 * O `AccessService` e exportado porque `ContentModule`, `ProgressModule` e
 * `CertificatesModule` passam a consultar **so ele** para decidir o que
 * entregam (decisao 17) — e continuam sem saber que existe um gateway: quem
 * fala com o Mercado Pago e o `MercadoPagoService`, que nao sai daqui.
 */
@Module({
  imports: [PrismaModule],
  providers: [AccessService],
  exports: [AccessService],
})
export class PaymentsModule {}
