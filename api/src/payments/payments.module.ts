import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AccessService } from './access.service';
import { MercadoPagoService } from './mercado-pago.service';
import { MercadoPagoWebhookController } from './mercado-pago-webhook.controller';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { StoreController } from './store.controller';
import { StoreService } from './store.service';

/**
 * Pagamento e acesso (Spec 014).
 *
 * O `MercadoPagoService` nao e exportado de proposito: **ninguem fora daqui
 * fala com o gateway**. O que sai e o `AccessService`, que `ContentModule`,
 * `ProgressModule` e `CertificatesModule` consultam para decidir o que
 * entregam (decisao 17) — e esses tres seguem sem saber que existe um gateway,
 * mesma separacao que o `MuxModule` faz para o video (Spec 010, decisao 16).
 */
@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [StoreController, OrdersController, MercadoPagoWebhookController],
  providers: [AccessService, MercadoPagoService, OrdersService, StoreService],
  exports: [AccessService, OrdersService],
})
export class PaymentsModule {}
