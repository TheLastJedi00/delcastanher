import { Controller, Get, Headers } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { assertCronSecret } from '../common/cron-auth';
import { InvoicesService, ReconcileResult } from './invoices.service';

/**
 * Reconciliacao diaria das notas (Spec 023, decisoes A5 e A10), chamada pelo
 * Vercel Cron com o `CRON_SECRET`, como a rotina da Spec 020.
 *
 * Reconsulta o que ficou em processamento, reenvia so o `PENDING` que nunca
 * saiu, completa arquivos e e-mail que faltaram e avisa o vencimento do
 * certificado. Nunca reenvia `UNKNOWN` nem `ERROR` (decisao A2).
 */
@Controller('internal/invoices')
export class InternalInvoicesController {
  constructor(
    private readonly invoices: InvoicesService,
    private readonly config: ConfigService,
  ) {}

  @Get('reconcile')
  reconcile(@Headers('authorization') authorization: string | undefined): Promise<ReconcileResult> {
    assertCronSecret(this.config, authorization);

    return this.invoices.reconcile();
  }
}
