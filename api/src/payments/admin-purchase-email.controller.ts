import { Controller, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { PurchaseEmailService } from './purchase-email.service';

/**
 * "Reenviar confirmacao" do financeiro (Spec 024, Task 3.4).
 *
 * Fica fora do `AdminFinanceController` de proposito: aquele so le e grava taxa
 * (Spec 016, decisao 20). Reenviar o e-mail da compra nao mexe em dinheiro nem
 * no pedido — so manda de novo o que ja devia ter saido. Guards na classe, como
 * em todo controller administrativo.
 */
@Controller('admin/orders')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles('admin')
export class AdminPurchaseEmailController {
  constructor(private readonly purchaseEmail: PurchaseEmailService) {}

  @Post(':orderId/confirmation-email')
  @HttpCode(200)
  resend(@Param('orderId') orderId: string): Promise<{ confirmationEmailedAt: Date }> {
    return this.purchaseEmail.resend(orderId);
  }
}
