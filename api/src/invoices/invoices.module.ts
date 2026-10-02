import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminInvoicesController } from './admin-invoices.controller';
import { InternalInvoicesController } from './internal-invoices.controller';
import { INVOICE_GATEWAY } from './invoice-gateway';
import { InvoicesService } from './invoices.service';
import { NotaasClient } from './notaas/notaas.client';
import { NotaasWebhookController } from './notaas-webhook.controller';

/**
 * Nota fiscal (Spec 023, Parte A).
 *
 * O `NotaasClient` entra pela `InvoiceGateway` e nao e exportado: **ninguem
 * fora daqui fala com a Notaas**, como ninguem fora do `PaymentsModule` fala
 * com o Mercado Pago. O que sai e o `InvoicesService`, que o `OrdersService`
 * chama na aprovacao e no estorno.
 */
@Module({
  imports: [AuthModule],
  controllers: [NotaasWebhookController, InternalInvoicesController, AdminInvoicesController],
  providers: [
    InvoicesService,
    NotaasClient,
    { provide: INVOICE_GATEWAY, useExisting: NotaasClient },
  ],
  exports: [InvoicesService],
})
export class InvoicesModule {}
