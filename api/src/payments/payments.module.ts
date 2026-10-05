import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AccessService } from './access.service';
import { AdminAccessController } from './admin-access.controller';
import { AdminAccessService } from './admin-access.service';
import { AdminBundlesController } from './admin-bundles.controller';
import { AdminFinanceController } from './admin-finance.controller';
import { AdminPurchaseEmailController } from './admin-purchase-email.controller';
import { AdminFinanceService } from './admin-finance.service';
import { AdminMercadoPagoController } from './admin-mercado-pago.controller';
import { BundlesService } from './bundles.service';
import { GatewayFeesService } from './gateway-fees.service';
import { MercadoPagoConnectionService } from './mercado-pago-connection.service';
import { MercadoPagoLinkService } from './mercado-pago-link.service';
import { InternalMercadoPagoController, MercadoPagoOAuthController } from './mercado-pago-oauth.controller';
import { MercadoPagoOAuthService } from './mercado-pago-oauth.service';
import { MercadoPagoService } from './mercado-pago.service';
import { MercadoPagoWebhookController } from './mercado-pago-webhook.controller';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { PurchaseEmailService } from './purchase-email.service';
import { StoreController } from './store.controller';
import { StoreService } from './store.service';
import { TokenCipher } from './token-cipher';

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
  imports: [PrismaModule, AuthModule, InvoicesModule],
  controllers: [
    StoreController,
    OrdersController,
    AdminAccessController,
    AdminBundlesController,
    AdminFinanceController,
    AdminMercadoPagoController,
    AdminPurchaseEmailController,
    MercadoPagoWebhookController,
    MercadoPagoOAuthController,
    InternalMercadoPagoController,
  ],
  providers: [
    AccessService,
    AdminAccessService,
    AdminFinanceService,
    BundlesService,
    GatewayFeesService,
    MercadoPagoConnectionService,
    MercadoPagoLinkService,
    MercadoPagoOAuthService,
    MercadoPagoService,
    OrdersService,
    PurchaseEmailService,
    StoreService,
    TokenCipher,
  ],
  exports: [AccessService, OrdersService],
})
export class PaymentsModule {}
