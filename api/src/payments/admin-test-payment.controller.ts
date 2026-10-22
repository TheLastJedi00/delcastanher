import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { IsBoolean } from 'class-validator';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { PaymentTestService, PaymentTestStatus } from './payment-test.service';

/** Corpo do toggle: so o liga/desliga. O preco e a chave sao do servidor. */
export class SetTestPaymentDto {
  @IsBoolean({ message: 'Informe se o modulo de teste fica ligado.' })
  enabled!: boolean;
}

/**
 * Toggle do modulo de teste de pagamento no financeiro (Spec 030, decisao 4).
 * Guards na classe, como em todo controller administrativo.
 */
@Controller('admin/finance/test-payment')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles('admin')
export class AdminTestPaymentController {
  constructor(private readonly tests: PaymentTestService) {}

  @Get()
  status(): Promise<PaymentTestStatus> {
    return this.tests.status();
  }

  @Put()
  setEnabled(@CurrentUser() user: AuthUser, @Body() dto: SetTestPaymentDto): Promise<PaymentTestStatus> {
    return this.tests.setEnabled(dto.enabled, user.uid);
  }
}
