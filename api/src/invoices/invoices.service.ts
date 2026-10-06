import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  certificateExpiresAt,
  fiscalConfig,
  invoicesEnabled,
  nfseCancelWindowHours,
  nfseEnvironment,
  NfseEnvironment,
} from '../config/invoice.config';
import { InvoiceStatus, Prisma } from '../generated/prisma/client';
import { renderEmail } from '../mail/email-content';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReadUrlResult, StorageService } from '../storage/storage.service';
import { INVOICE_GATEWAY } from './invoice-gateway';
import type { InvoiceGateway, ProviderInvoice } from './invoice-gateway';
import { buildNfse, NfseOrder } from './notaas/nfse-builder';

/** Motivo do cancelamento no estorno: ate 255 caracteres (decisoes A7 e N7). */
export const REFUND_CANCEL_REASON = 'Venda desfeita: pagamento estornado ao comprador';

/** Motivo do cancelamento pelo painel, a saida para uma duplicata (decisao A2). */
export const ADMIN_CANCEL_REASON = 'Nota cancelada pelo painel: emitida em duplicidade ou por engano';

/** O cron so trata o que esta parado ha mais de 1 hora (decisao A5). */
const STALE_MS = 60 * 60 * 1000;

/** Aviso de vencimento do certificado A1 (decisao A10). */
const CERT_WARNING_DAYS = 30;

/** A nota como o servico a le, com o pedido que ela documenta. */
type InvoiceRow = Prisma.InvoiceGetPayload<object>;

/** Configuracao da emissao, para o aviso do painel (decisoes A6 e A10). */
export interface InvoiceSettings {
  enabled: boolean;
  environment: NfseEnvironment;
  certificateExpiresAt: string | null;
  /** Dias ate o vencimento; nulo sem data configurada. */
  certificateDaysLeft: number | null;
  certificateWarning: boolean;
  /** Prazo de cancelamento, para o painel saber quando oferecer "Cancelar". */
  cancelWindowHours: number;
}

/** O que o cron fez em uma passada. */
export interface ReconcileResult {
  refreshed: number;
  emitted: number;
  completed: number;
  certificateWarning: boolean;
}

/** Da `ProviderInvoice` para o nosso estado (decisao A5). */
function translate(status: ProviderInvoice['status']): InvoiceStatus {
  switch (status) {
    case 'issued':
      return 'AUTHORIZED';
    case 'error':
      return 'DENIED';
    case 'cancelled':
      return 'CANCELLED';
    default:
      return 'PROCESSING';
  }
}

/**
 * NFS-e de cada venda (Spec 023, Parte A, com a Spec 024.2).
 *
 * Tres regras organizam tudo o que esta aqui:
 *
 * 1. **Uma falha da nota nunca desfaz nem atrasa o pagamento** (decisao A4).
 *    `onOrderPaid` e `onOrderRefunded` nunca lancam: a nota e assunto do
 *    painel, e nao do comprador.
 * 2. **Nada reenvia o que pode ter sido enfileirado** (decisoes A2 e N3). A
 *    `referencia` vai com o id do pedido, mas nada garante que ela barre uma
 *    segunda nota: o `invoiceId` e gravado no instante do `202`, e `UNKNOWN`
 *    so sai do lugar pela mao do admin.
 * 3. **O estado vem da consulta, e nao do aviso** (decisao A5). O webhook e o
 *    cron so dizem qual nota reconsultar.
 */
@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(INVOICE_GATEWAY) private readonly gateway: InvoiceGateway,
    private readonly storage: StorageService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Pedido aprovado: cria a nota e emite (decisao A4). Chamado pelo
   * `OrdersService` so na transicao que concedeu o acesso — um segundo `apply`
   * do mesmo pedido nao chega aqui, e se chegasse, a nota ja existe.
   */
  async onOrderPaid(orderId: string): Promise<void> {
    try {
      if (!invoicesEnabled(this.config)) {
        return;
      }

      const invoice = await this.createPending(orderId);

      if (invoice) {
        await this.emit(invoice);
      }
    } catch (error) {
      this.logger.error(`Falha ao emitir a nota do pedido ${orderId}.`, error as Error);
    }
  }

  /**
   * Pedido estornado: cancela a nota autorizada dentro do prazo, ou marca a
   * pendencia fora dele (decisao A7). O estorno nunca e desfeito por isto.
   */
  async onOrderRefunded(orderId: string): Promise<void> {
    try {
      const invoice = await this.prisma.invoice.findUnique({ where: { orderId } });

      if (invoice?.status === 'AUTHORIZED') {
        await this.cancelForRefund(invoice);
      }
    } catch (error) {
      this.logger.error(`Falha ao cancelar a nota do pedido ${orderId}.`, error as Error);
    }
  }

  /**
   * Aviso do webhook (decisao A5): reconsulta e grava o que a Notaas diz. Id
   * desconhecido e ignorado — inclusive o de outro ambiente, que divide o
   * banco mas nao a chave da API (decisao A6).
   */
  async syncByProviderId(providerInvoiceId: string): Promise<void> {
    const invoice = await this.prisma.invoice.findUnique({ where: { providerInvoiceId } });

    if (!invoice || invoice.environment !== this.environment()) {
      this.logger.warn(`Aviso da Notaas para nota desconhecida neste ambiente: ${providerInvoiceId}`);

      return;
    }

    await this.refresh(invoice);
  }

  /**
   * Rede do webhook (decisao A5), chamada pelo cron diario. So o proprio
   * ambiente, e so o que esta parado ha mais de 1 hora. `UNKNOWN` e `ERROR`
   * **nunca** sao reenviados aqui (decisao A2).
   */
  async reconcile(now: Date = new Date()): Promise<ReconcileResult> {
    const environment = this.environment();
    const stale = { lt: new Date(now.getTime() - STALE_MS) };
    const result: ReconcileResult = {
      refreshed: 0,
      emitted: 0,
      completed: 0,
      certificateWarning: this.settings(now).certificateWarning,
    };

    if (result.certificateWarning) {
      this.logger.warn(
        `Certificado A1 vence em ${this.settings(now).certificateDaysLeft} dia(s): renove e envie a Notaas.`,
      );
    }

    if (!invoicesEnabled(this.config)) {
      return result;
    }

    const waiting = await this.prisma.invoice.findMany({
      where: { environment, status: { in: ['PROCESSING', 'CANCELLING'] }, updatedAt: stale },
    });

    for (const invoice of waiting) {
      await this.safely(invoice, () => this.refresh(invoice));
      result.refreshed++;
    }

    // A chamada nunca saiu: sem `providerInvoiceId`, nao existe nota na Notaas.
    const neverSent = await this.prisma.invoice.findMany({
      where: { environment, status: 'PENDING', providerInvoiceId: null, updatedAt: stale },
    });

    for (const invoice of neverSent) {
      await this.safely(invoice, () => this.emit(invoice));
      result.emitted++;
    }

    const incomplete = await this.prisma.invoice.findMany({
      where: {
        environment,
        status: 'AUTHORIZED',
        updatedAt: stale,
        OR: [{ xmlPath: null }, { pdfPath: null }, { emailedAt: null }],
      },
    });

    for (const invoice of incomplete) {
      await this.safely(invoice, () => this.afterAuthorized(invoice.id));
      result.completed++;
    }

    return result;
  }

  // --- Painel (decisao A9) -------------------------------------------------

  /**
   * "Emitir de novo". Para `ERROR` e `DENIED`, depois de corrigir a causa: o
   * `invoiceId` anterior fica em `lastError`. Para `UNKNOWN`, so com a
   * confirmacao de que nao existe nota para o pedido (decisao A2). Pedido pago
   * sem nota — anterior a spec, ou de quando a emissao estava desligada —
   * tambem emite por aqui.
   */
  async reissue(orderId: string, confirmNoInvoice = false): Promise<InvoiceRow> {
    this.requireEnabled();

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { status: true, invoice: true },
    });

    if (!order) {
      throw new NotFoundException('Pedido nao encontrado.');
    }

    if (order.status !== 'PAID') {
      throw new ConflictException('So pedido pago tem nota fiscal.');
    }

    const current = order.invoice;

    if (!current) {
      const created = await this.createPending(orderId);

      return this.emit(created as InvoiceRow);
    }

    if (current.status === 'UNKNOWN' && !confirmNoInvoice) {
      throw new BadRequestException(
        'Confira no painel da Notaas que nao existe nota para este pedido e confirme a reemissao.',
      );
    }

    if (!['ERROR', 'DENIED', 'UNKNOWN'].includes(current.status)) {
      throw new ConflictException(`A nota esta em ${current.status} e nao pode ser emitida de novo.`);
    }

    const note = [
      current.providerInvoiceId ? `invoiceId anterior: ${current.providerInvoiceId}` : null,
      current.lastError ? `erro anterior: ${current.lastError}` : null,
    ]
      .filter(Boolean)
      .join('; ');

    const reset = await this.prisma.invoice.update({
      where: { id: current.id },
      data: {
        status: 'PENDING',
        environment: this.environment(),
        providerInvoiceId: null,
        number: null,
        series: null,
        accessKey: null,
        protocol: null,
        issuedAt: null,
        lastError: note || null,
      },
    });

    return this.emit(reset, note || null);
  }

  /** "Vincular nota existente": o `invoiceId` visto no painel da Notaas. */
  async link(orderId: string, providerInvoiceId: string): Promise<InvoiceRow> {
    this.requireEnabled();

    const invoice = await this.requireInvoice(orderId);

    if (invoice.status !== 'UNKNOWN') {
      throw new ConflictException('So a nota em situacao desconhecida pode ser vinculada.');
    }

    try {
      const linked = await this.prisma.invoice.update({
        where: { id: invoice.id },
        data: { providerInvoiceId, status: 'PROCESSING' },
      });

      return this.refresh(linked);
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new ConflictException('Este invoiceId ja esta vinculado a outro pedido.');
      }

      throw error;
    }
  }

  /** "Cancelar", dentro do prazo — a saida para uma duplicata (decisao A2). */
  async cancel(orderId: string): Promise<InvoiceRow> {
    this.requireEnabled();

    const invoice = await this.requireInvoice(orderId);

    if (invoice.status !== 'AUTHORIZED' && invoice.status !== 'CANCEL_ERROR') {
      throw new ConflictException('So nota autorizada pode ser cancelada.');
    }

    if (!this.withinCancelWindow(invoice)) {
      throw new ConflictException(
        `O prazo de cancelamento da NFS-e (${nfseCancelWindowHours(this.config)} horas) ja passou.`,
      );
    }

    return this.requestCancel(invoice, ADMIN_CANCEL_REASON);
  }

  /** "Reenviar e-mail": manda de novo, mesmo que ja tenha sido enviado. */
  async resendEmail(orderId: string): Promise<InvoiceRow> {
    const invoice = await this.requireInvoice(orderId);

    if (invoice.status !== 'AUTHORIZED' || !invoice.xmlPath || !invoice.pdfPath) {
      throw new ConflictException('A nota ainda nao tem os arquivos para enviar.');
    }

    await this.sendEmail(invoice, `nfse-${invoice.id}-${Date.now()}`);

    return this.prisma.invoice.update({ where: { id: invoice.id }, data: { emailedAt: new Date() } });
  }

  /** "Baixar PDF": URL assinada de leitura do DANFSe guardado. */
  async pdfUrl(orderId: string): Promise<ReadUrlResult> {
    const invoice = await this.requireInvoice(orderId);

    if (!invoice.pdfPath) {
      throw new NotFoundException('O PDF desta nota ainda nao foi guardado.');
    }

    return this.storage.createReadUrl(invoice.pdfPath);
  }

  /**
   * "Atualizar situacao": reconsulta agora. Necessario na homologacao, onde o
   * webhook do projeto de teste nao chega a API publicada e o cron so roda em
   * producao.
   */
  async sync(orderId: string): Promise<InvoiceRow> {
    this.requireEnabled();

    const invoice = await this.requireInvoice(orderId);

    if (!invoice.providerInvoiceId) {
      throw new ConflictException('A nota nao tem invoiceId da Notaas para consultar.');
    }

    return this.refresh(invoice);
  }

  /** Ambiente e certificado, para o painel (decisoes A6 e A10). */
  settings(now: Date = new Date()): InvoiceSettings {
    const expires = certificateExpiresAt(this.config);
    const daysLeft = expires
      ? Math.ceil((expires.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
      : null;

    return {
      enabled: invoicesEnabled(this.config),
      environment: this.environment(),
      certificateExpiresAt: expires?.toISOString() ?? null,
      certificateDaysLeft: daysLeft,
      certificateWarning: daysLeft !== null && daysLeft <= CERT_WARNING_DAYS,
      cancelWindowHours: nfseCancelWindowHours(this.config),
    };
  }

  // --- Fluxo ---------------------------------------------------------------

  /**
   * A linha nasce em `PENDING` **antes** do `POST` (decisao A2). Pedido que ja
   * tem nota devolve nulo: e o `orderId @unique` que segura dois `apply`
   * simultaneos.
   */
  private async createPending(orderId: string): Promise<InvoiceRow | null> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { amountCents: true },
    });

    if (!order) {
      return null;
    }

    try {
      return await this.prisma.invoice.create({
        data: { orderId, environment: this.environment(), amountCents: order.amountCents },
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        return null;
      }

      throw error;
    }
  }

  /** Monta, chama `/emitir` e grava o desfecho na hora (decisoes A2 e A4). */
  private async emit(invoice: InvoiceRow, note: string | null = null): Promise<InvoiceRow> {
    const order = (await this.prisma.order.findUnique({
      where: { id: invoice.orderId },
      include: { items: true },
    })) as unknown as NfseOrder | null;

    if (!order) {
      throw new NotFoundException('Pedido da nota nao encontrado.');
    }

    let body;

    try {
      body = buildNfse(order, fiscalConfig(this.config));
    } catch (error) {
      // Dado fiscal ausente ou pedido sem CPF: nada saiu, e reenviar depois
      // de corrigir e seguro.
      return this.prisma.invoice.update({
        where: { id: invoice.id },
        data: { status: 'ERROR', lastError: (error as Error).message },
      });
    }

    const result = await this.gateway.emit(body);

    switch (result.kind) {
      case 'queued':
        return this.prisma.invoice.update({
          where: { id: invoice.id },
          data: {
            providerInvoiceId: result.providerInvoiceId,
            status: 'PROCESSING',
            lastError: note,
          },
        });
      case 'rejected':
        return this.prisma.invoice.update({
          where: { id: invoice.id },
          data: { status: 'ERROR', lastError: result.message },
        });
      default:
        this.logger.error(
          `Emissao da nota ${invoice.id} sem resposta da Notaas: verificar no painel dela. ${result.message}`,
        );

        return this.prisma.invoice.update({
          where: { id: invoice.id },
          data: { status: 'UNKNOWN', lastError: result.message },
        });
    }
  }

  /** Reconsulta e grava; autorizada, completa arquivos e e-mail. */
  private async refresh(invoice: InvoiceRow): Promise<InvoiceRow> {
    const provider = await this.gateway.status(invoice.providerInvoiceId as string);

    // Decisao N4: preview e producao dividem o banco. Uma chave de API do
    // ambiente errado emitiria nota real de uma venda de teste, ou o inverso.
    // A Notaas so devolve o `ambiente` com a nota emitida.
    if (provider.environment !== null && provider.environment !== invoice.environment) {
      this.logger.error(
        `Nota ${invoice.id} voltou em ${provider.environment}, esperado ${invoice.environment}: chave de API do ambiente errado.`,
      );

      return this.prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          status: 'ERROR',
          lastError: `Chave de API do ambiente errado: a Notaas emitiu em ${provider.environment}, e a nota e de ${invoice.environment}.`,
        },
      });
    }

    const translated = translate(provider.status);

    // Cancelamento pedido e ainda nao confirmado: a nota segue `issued` na
    // Notaas ate o sistema nacional registrar o evento.
    const status =
      invoice.status === 'CANCELLING' && translated === 'AUTHORIZED' ? 'CANCELLING' : translated;

    // Contingencia (decisao A5): vale sempre a chave da ultima consulta. Os
    // arquivos guardados com a chave antiga sao baixados de novo.
    const keyChanged =
      !!invoice.accessKey && !!provider.accessKey && invoice.accessKey !== provider.accessKey;

    const updated = await this.prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        status,
        number: provider.number ?? invoice.number,
        series: provider.series ?? invoice.series,
        accessKey: provider.accessKey ?? invoice.accessKey,
        protocol: provider.protocol ?? invoice.protocol,
        ...(status === 'AUTHORIZED' ? { issuedAt: invoice.issuedAt ?? provider.issuedAt ?? new Date() } : {}),
        ...(status === 'DENIED' ? { lastError: provider.errorDetail } : {}),
        ...(status === 'CANCELLED'
          ? { cancelledAt: invoice.cancelledAt ?? provider.cancelledAt ?? new Date() }
          : {}),
        ...(keyChanged ? { xmlPath: null, pdfPath: null } : {}),
      },
    });

    if (status === 'AUTHORIZED') {
      return this.afterAuthorized(updated.id);
    }

    if (status === 'CANCELLED' && !updated.cancelXmlPath) {
      return this.storeCancelXml(updated);
    }

    return updated;
  }

  /**
   * Nota autorizada: se o pedido foi estornado enquanto ela processava,
   * cancela; senao, guarda os arquivos e manda o e-mail (decisao A8).
   */
  private async afterAuthorized(invoiceId: string): Promise<InvoiceRow> {
    const invoice = (await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { order: { select: { status: true } } },
    })) as (InvoiceRow & { order: { status: string } }) | null;

    if (!invoice) {
      throw new NotFoundException('Nota nao encontrada.');
    }

    const { order, ...row } = invoice;

    if (order.status === 'REFUNDED') {
      return this.cancelForRefund(row);
    }

    const stored = await this.storeDocuments(row);

    if (!stored.xmlPath || !stored.pdfPath || stored.emailedAt) {
      return stored;
    }

    return this.sendEmailOnce(stored);
  }

  /** XML e DANFSe no Storage (decisao A8). Falha fica para o cron. */
  private async storeDocuments(invoice: InvoiceRow): Promise<InvoiceRow> {
    if ((invoice.xmlPath && invoice.pdfPath) || !invoice.accessKey) {
      return invoice;
    }

    const id = invoice.providerInvoiceId as string;
    const base = `invoices/${invoice.environment}/${invoice.accessKey}`;

    try {
      const [xml, pdf] = await Promise.all([this.gateway.downloadXml(id), this.gateway.downloadPdf(id)]);

      await this.storage.saveFile(`${base}.xml`, xml, 'application/xml');
      await this.storage.saveFile(`${base}.pdf`, pdf, 'application/pdf');

      return this.prisma.invoice.update({
        where: { id: invoice.id },
        data: { xmlPath: `${base}.xml`, pdfPath: `${base}.pdf` },
      });
    } catch (error) {
      this.logger.error(`Falha ao guardar os arquivos da nota ${invoice.id}.`, error as Error);

      return invoice;
    }
  }

  /** XML do evento de cancelamento (decisao A8). */
  private async storeCancelXml(invoice: InvoiceRow): Promise<InvoiceRow> {
    if (!invoice.accessKey || !invoice.providerInvoiceId) {
      return invoice;
    }

    try {
      const path = `invoices/${invoice.environment}/${invoice.accessKey}-cancelamento.xml`;
      const xml = await this.gateway.downloadXml(invoice.providerInvoiceId, 'cancel');

      await this.storage.saveFile(path, xml, 'application/xml');

      return this.prisma.invoice.update({ where: { id: invoice.id }, data: { cancelXmlPath: path } });
    } catch (error) {
      this.logger.error(`Falha ao guardar o XML de cancelamento da nota ${invoice.id}.`, error as Error);

      return invoice;
    }
  }

  /**
   * O e-mail sai **uma vez**: a linha e reivindicada por `emailedAt` antes do
   * envio, e webhook e cron simultaneos nao mandam dois. Falhou, a
   * reivindicacao e desfeita para o cron tentar de novo.
   */
  private async sendEmailOnce(invoice: InvoiceRow): Promise<InvoiceRow> {
    const claimedAt = new Date();
    const { count } = await this.prisma.invoice.updateMany({
      where: { id: invoice.id, emailedAt: null },
      data: { emailedAt: claimedAt },
    });

    if (count === 0) {
      return invoice;
    }

    try {
      await this.sendEmail(invoice, `nfse-${invoice.id}`);

      return { ...invoice, emailedAt: claimedAt };
    } catch (error) {
      this.logger.error(`Falha ao enviar o e-mail da nota ${invoice.id}.`, error as Error);

      await this.prisma.invoice.updateMany({
        where: { id: invoice.id, emailedAt: claimedAt },
        data: { emailedAt: null },
      });

      return invoice;
    }
  }

  /**
   * "Sua nota fiscal", com o DANFSe e o XML em anexo (decisoes A8 e N8). Transacional:
   * **ignora o descadastro** de campanhas (decisao B5) e nao leva cabecalho de
   * descadastro.
   */
  private async sendEmail(invoice: InvoiceRow, idempotencyKey: string): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: invoice.orderId },
      select: { payerName: true, user: { select: { email: true, name: true } } },
    });

    if (!order) {
      throw new NotFoundException('Pedido da nota nao encontrado.');
    }

    const [xml, pdf] = await Promise.all([
      this.storage.readFile(invoice.xmlPath as string),
      this.storage.readFile(invoice.pdfPath as string),
    ]);

    const testing = invoice.environment !== 'producao';
    const firstName = (order.payerName ?? order.user.name ?? '').trim().split(/\s+/)[0];

    const body = [
      firstName ? `Olá, ${firstName}!` : 'Olá!',
      `Segue a nota fiscal de serviço da sua compra na Delcastanher: NFS-e nº ${invoice.number ?? '-'}.`,
      `Código de verificação: ${invoice.accessKey}`,
      'O PDF (DANFSe) e o XML estão em anexo. O XML é o documento fiscal da compra: guarde este e-mail.',
      'Você pode consultar a nota pelo código de verificação no portal da NFS-e: https://www.nfse.gov.br/consultapublica',
      ...(testing ? ['Esta é uma nota de HOMOLOGAÇÃO, emitida em ambiente de teste e sem valor fiscal.'] : []),
    ].join('\n\n');

    const content = renderEmail({ body, preheader: `NFS-e nº ${invoice.number ?? ''} da sua compra` });

    await this.mail.send({
      to: order.user.email,
      subject: `${testing ? '[HOMOLOGAÇÃO] ' : ''}Sua nota fiscal da Imersão RH Estratégico`,
      html: content.html,
      text: content.text,
      attachments: [
        { filename: `nfse-${invoice.accessKey}.pdf`, content: pdf },
        { filename: `nfse-${invoice.accessKey}.xml`, content: xml },
      ],
      idempotencyKey,
    });
  }

  /** Estorno: cancela dentro do prazo, ou marca a pendencia (decisao A7). */
  private async cancelForRefund(invoice: InvoiceRow): Promise<InvoiceRow> {
    if (!this.withinCancelWindow(invoice)) {
      return this.prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          status: 'REFUND_PENDING',
          lastError:
            'Estorno fora do prazo de cancelamento da NFS-e: o cancelamento direto nao e mais possivel, tratar com a contadora.',
        },
      });
    }

    return this.requestCancel(invoice, REFUND_CANCEL_REASON);
  }

  private async requestCancel(invoice: InvoiceRow, reason: string): Promise<InvoiceRow> {
    try {
      const result = await this.gateway.cancel(invoice.providerInvoiceId as string, reason);

      switch (result.kind) {
        case 'accepted':
          return this.prisma.invoice.update({
            where: { id: invoice.id },
            data: { status: 'CANCELLING', lastError: null },
          });
        case 'expired':
          return this.prisma.invoice.update({
            where: { id: invoice.id },
            data: { status: 'REFUND_PENDING', lastError: result.message },
          });
        default:
          return this.prisma.invoice.update({
            where: { id: invoice.id },
            data: { status: 'CANCEL_ERROR', lastError: result.message },
          });
      }
    } catch (error) {
      return this.prisma.invoice.update({
        where: { id: invoice.id },
        data: { status: 'CANCEL_ERROR', lastError: (error as Error).message },
      });
    }
  }

  private withinCancelWindow(invoice: InvoiceRow, now: Date = new Date()): boolean {
    const issuedAt = invoice.issuedAt ?? invoice.updatedAt;
    const windowMs = nfseCancelWindowHours(this.config) * 60 * 60 * 1000;

    return now.getTime() - issuedAt.getTime() < windowMs;
  }

  private async requireInvoice(orderId: string): Promise<InvoiceRow> {
    const invoice = await this.prisma.invoice.findUnique({ where: { orderId } });

    if (!invoice) {
      throw new NotFoundException('Este pedido nao tem nota fiscal.');
    }

    return invoice;
  }

  private requireEnabled(): void {
    if (!invoicesEnabled(this.config)) {
      throw new ConflictException('Emissao de nota fiscal desligada: NOTAAS_API_KEY nao configurada.');
    }
  }

  private environment(): NfseEnvironment {
    return nfseEnvironment(this.config);
  }

  /** Um item do cron que falha nao derruba os outros. */
  private async safely(invoice: InvoiceRow, work: () => Promise<unknown>): Promise<void> {
    try {
      await work();
    } catch (error) {
      this.logger.error(`Reconciliacao da nota ${invoice.id} falhou.`, error as Error);
    }
  }
}
