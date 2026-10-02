import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { ReadUrlResult } from '../storage/storage.service';
import { LinkInvoiceDto, ReissueInvoiceDto } from './dto/admin-invoice.dto';
import { toAdminInvoiceView } from './invoice-view';
import type { AdminInvoiceView } from './invoice-view';
import { InvoicesService } from './invoices.service';
import type { InvoiceSettings } from './invoices.service';

/**
 * Acoes da nota no painel financeiro (Spec 023, decisao A9).
 *
 * Guards na classe, como em todo controller administrativo (Spec 010,
 * decisao 13). As acoes dependem do status, e quem decide e o servico: aqui
 * so entra o pedido e sai a nota, sem caminho do Storage.
 */
@Controller('admin/invoices')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles('admin')
export class AdminInvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  /** Ambiente, prazo de cancelamento e vencimento do certificado (A6 e A10). */
  @Get('config')
  config(): InvoiceSettings {
    return this.invoices.settings();
  }

  /** "Emitir de novo" — em `UNKNOWN`, so com a confirmacao (decisao A2). */
  @Post(':orderId/issue')
  @HttpCode(200)
  async issue(@Param('orderId') orderId: string, @Body() dto: ReissueInvoiceDto): Promise<AdminInvoiceView> {
    return toAdminInvoiceView(await this.invoices.reissue(orderId, dto.confirmNoInvoice === true));
  }

  /** "Vincular nota existente", para `UNKNOWN`. */
  @Post(':orderId/link')
  @HttpCode(200)
  async link(@Param('orderId') orderId: string, @Body() dto: LinkInvoiceDto): Promise<AdminInvoiceView> {
    return toAdminInvoiceView(await this.invoices.link(orderId, dto.invoiceId));
  }

  /** "Cancelar", dentro de 24 horas. */
  @Post(':orderId/cancel')
  @HttpCode(200)
  async cancel(@Param('orderId') orderId: string): Promise<AdminInvoiceView> {
    return toAdminInvoiceView(await this.invoices.cancel(orderId));
  }

  /** "Reenviar e-mail" com o DANFE e o XML. */
  @Post(':orderId/email')
  @HttpCode(200)
  async email(@Param('orderId') orderId: string): Promise<AdminInvoiceView> {
    return toAdminInvoiceView(await this.invoices.resendEmail(orderId));
  }

  /** "Atualizar situacao": reconsulta a Notaas agora. */
  @Post(':orderId/sync')
  @HttpCode(200)
  async sync(@Param('orderId') orderId: string): Promise<AdminInvoiceView> {
    return toAdminInvoiceView(await this.invoices.sync(orderId));
  }

  /** "Baixar PDF": URL assinada de leitura do DANFE. */
  @Get(':orderId/pdf')
  pdf(@Param('orderId') orderId: string): Promise<ReadUrlResult> {
    return this.invoices.pdfUrl(orderId);
  }
}
