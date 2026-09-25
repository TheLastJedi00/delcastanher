import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AccessService } from './access.service';
import { AdminAccessController } from './admin-access.controller';
import { AdminAccessService } from './admin-access.service';
import { AdminBundlesController } from './admin-bundles.controller';
import { AdminFinanceController } from './admin-finance.controller';
import { AdminFinanceService } from './admin-finance.service';
import { BundlesService } from './bundles.service';
import { GatewayFeesService } from './gateway-fees.service';
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
  controllers: [
    StoreController,
    OrdersController,
    AdminAccessController,
    AdminBundlesController,
    AdminFinanceController,
    MercadoPagoWebhookController,
  ],
  providers: [
    AccessService,
    AdminAccessService,
    AdminFinanceService,
    BundlesService,
    GatewayFeesService,
    MercadoPagoService,
    OrdersService,
    StoreService,
  ],
  exports: [AccessService, OrdersService],
})
export class PaymentsModule {}
