import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { OrderStatus, PaymentMethodKind } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from './access.service';
import { BundlesService } from './bundles.service';
import { CreateOrderDto, MAX_INSTALLMENTS } from './dto/create-order.dto';
import { MercadoPagoService } from './mercado-pago.service';
import { MercadoPagoOrder, PixDetails, rejectionMessage, toOrderStatus } from './payments.types';

/** Item do pedido como a tela o exibe. */
export interface OrderItemView {
  moduleId: string;
  title: string;
  priceCents: number;
}

/** Pedido como a tela o acompanha. */
export interface OrderView {
  id: string;
  status: OrderStatus;
  amountCents: number;
  method: PaymentMethodKind;
  installments: number;
  items: OrderItemView[];
  pix: PixDetails | null;
  expiresAt: string | null;
  paidAt: string | null;
  /** Texto para o comprador: o que aconteceu e o que fazer a seguir. */
  message: string | null;
  mpOrderId: string | null;
  mpPaymentId: string | null;
  /** Pacote e lote do pedido de pacote (Spec 019); nulo no avulso. */
  bundle: { title: string; tierName: string } | null;
}

/** Linha do pedido com os itens, como o Prisma a devolve. */
interface OrderRow {
  id: string;
  userId: string;
  status: OrderStatus;
  amountCents: number;
  method: PaymentMethodKind;
  installments: number;
  mpOrderId: string | null;
  mpPaymentId: string | null;
  mpStatus: string | null;
  mpStatusDetail: string | null;
  paidAt: Date | null;
  refundedAt: Date | null;
  expiresAt: Date | null;
  bundleTitleSnapshot?: string | null;
  tierNameSnapshot?: string | null;
  items: { moduleId: string; priceCents: number; titleSnapshot: string }[];
}

/** Estados a partir dos quais cada transicao e permitida (decisao 13). */
function allowedFrom(next: OrderStatus): OrderStatus[] {
  // Estorno e contestacao chegam depois da aprovacao — e sao a unica saida de
  // um pedido ja pago.
  return next === 'REFUNDED' ? ['PENDING', 'PAID'] : ['PENDING'];
}

/** Estados em que nao ha mais nada a perguntar ao gateway. */
const TERMINAL: OrderStatus[] = ['PAID', 'REJECTED', 'CANCELLED', 'EXPIRED', 'REFUNDED'];

/**
 * Pedido de compra de modulos (Spec 014).
 *
 * Duas regras organizam tudo o que esta aqui:
 *
 * 1. **O valor e do servidor** (decisao 2). O cliente manda ids de modulo; o
 *    preco sai de `Module.priceCents` e e congelado no item do pedido.
 * 2. **O desfecho vem do gateway, e so o gateway** (decisoes 12 e 14). Webhook
 *    e polling entram pelo mesmo metodo, e a transicao e condicionada ao estado
 *    anterior — reprocessar dez vezes concede acesso uma vez.
 */
@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly gateway: MercadoPagoService,
    private readonly bundles: BundlesService,
  ) {}

  /** Cria o pedido, cobra e devolve o desfecho — ou o QR, no caso do PIX. */
  async create(user: AuthUser, dto: CreateOrderDto): Promise<OrderView> {
    if (dto.bundleSlug) {
      return this.createBundleOrder(user, dto);
    }

    const items = await this.resolveItems(user, dto);

    this.validatePayment(dto);

    const amountCents = items.reduce((total, item) => total + item.priceCents, 0);

    // Decisao 11: um pendente por vez. Dois PIX abertos para os mesmos modulos
    // sao duas cobrancas possiveis da mesma coisa.
    await this.prisma.order.updateMany({
      where: { userId: user.uid, status: 'PENDING' },
      data: { status: 'CANCELLED' },
    });

    const order = (await this.prisma.order.create({
      data: {
        userId: user.uid,
        amountCents,
        method: dto.method,
        installments: dto.method === 'CREDIT_CARD' ? (dto.card?.installments ?? 1) : 1,
        items: {
          create: items.map((item) => ({
            moduleId: item.moduleId,
            priceCents: item.priceCents,
            titleSnapshot: item.title,
          })),
        },
      },
      include: { items: true },
    })) as unknown as OrderRow;

    const mpOrder = await this.gateway.createOrder({
      orderId: order.id,
      amountCents,
      method: dto.method,
      payer: dto.payer,
      items: items.map((item) => ({
        moduleId: item.moduleId,
        title: item.title,
        priceCents: item.priceCents,
      })),
      card: dto.card,
      deviceId: dto.deviceId,
    });

    return this.apply({ ...order, amountCents, method: dto.method }, mpOrder);
  }

  /**
   * Pedido de pacote (Spec 019, decisao 5).
   *
   * O lote, o valor e o rateio sao decididos pelo `BundlesService`, numa
   * transacao travada; daqui sai so o que o cliente pode escolher — pacote,
   * meio e parcelas. Diferente do avulso, modulo ja ativo **nao** e recusado:
   * o pacote estende os 6 meses dele, como qualquer recompra (decisao 7).
   */
  private async createBundleOrder(user: AuthUser, dto: CreateOrderDto): Promise<OrderView> {
    this.validatePayment(dto);

    const { order: placed } = await this.bundles.placeOrder({
      slug: dto.bundleSlug as string,
      userId: user.uid,
      method: dto.method,
      installments: dto.method === 'CREDIT_CARD' ? (dto.card?.installments ?? 1) : 1,
    });
    const order = placed as unknown as OrderRow;

    const mpOrder = await this.gateway.createOrder({
      orderId: order.id,
      amountCents: order.amountCents,
      method: dto.method,
      payer: dto.payer,
      items: order.items.map((item) => ({
        moduleId: item.moduleId,
        title: item.titleSnapshot,
        priceCents: item.priceCents,
      })),
      card: dto.card,
      deviceId: dto.deviceId,
    });

    return this.apply(order, mpOrder);
  }

  /**
   * Pedido do proprio aluno, com reconsulta quando ainda pendente (decisao 14).
   *
   * Pedido de outra pessoa responde **404**, e nao 403: um 403 confirmaria que
   * aquele id existe.
   */
  async findOne(user: AuthUser, orderId: string): Promise<OrderView> {
    const order = (await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    })) as OrderRow | null;

    if (!order || order.userId !== user.uid) {
      throw new NotFoundException('Pedido nao encontrado.');
    }

    if (!TERMINAL.includes(order.status)) {
      return this.refresh(order);
    }

    return this.toView(order);
  }

  /** Historico do aluno, do mais recente ao mais antigo. */
  async listMine(user: AuthUser): Promise<OrderView[]> {
    const orders = (await this.prisma.order.findMany({
      where: { userId: user.uid },
      orderBy: { createdAt: 'desc' },
      include: { items: true },
    })) as unknown as OrderRow[];

    return orders.map((order) => this.toView(order));
  }

  /**
   * Aplica o estado que o gateway reporta para uma order — a porta unica do
   * webhook (decisao 12).
   *
   * Order desconhecida e ignorada em silencio: a conta do Mercado Pago pode
   * receber notificacao de integracao que nao e esta, e recusar faria o
   * gateway reentregar para sempre algo que nunca sera tratado.
   */
  async applyFromGateway(mpOrderId: string): Promise<void> {
    const order = (await this.prisma.order.findFirst({
      where: { mpOrderId },
      include: { items: true },
    })) as OrderRow | null;

    if (!order) {
      this.logger.warn(`Notificacao de order desconhecida: ${mpOrderId}`);

      return;
    }

    const mpOrder = await this.gateway.getOrder(mpOrderId);

    await this.apply(order, mpOrder);
  }

  /** Reconsulta o gateway e aplica o resultado; expira sem consultar. */
  private async refresh(order: OrderRow): Promise<OrderView> {
    // Decisao 10: vencido e vencido. Perguntar ao gateway seria gastar uma
    // chamada de rede para confirmar o que o relogio ja respondeu.
    if (order.expiresAt && order.expiresAt.getTime() <= Date.now()) {
      await this.transition(order, 'EXPIRED', null);

      return this.toView({ ...order, status: 'EXPIRED' });
    }

    if (!order.mpOrderId) {
      return this.toView(order);
    }

    const mpOrder = await this.gateway.getOrder(order.mpOrderId);

    return this.apply(order, mpOrder);
  }

  /**
   * Traduz o desfecho, grava e — quando aprovado — concede o acesso.
   *
   * A concessao so acontece se **esta** chamada foi a que tirou o pedido de
   * pendente: e isso que torna webhook e polling simultaneos inofensivos.
   */
  private async apply(order: OrderRow, mpOrder: MercadoPagoOrder): Promise<OrderView> {
    const status = toOrderStatus(mpOrder.status);
    const changed = await this.transition(order, status, mpOrder);

    if (changed && status === 'PAID') {
      for (const item of order.items) {
        await this.access.grant({
          userId: order.userId,
          moduleId: item.moduleId,
          source: 'PURCHASE',
          orderId: order.id,
        });
      }
    }

    // Decisao 22: dinheiro devolvido nao pode deixar o conteudo liberado.
    if (changed && status === 'REFUNDED') {
      await this.access.revokeByOrder(order.id);
    }

    const expiresAt = this.pixExpiration(order, status, mpOrder);

    return this.toView({
      ...order,
      status,
      mpOrderId: mpOrder.id,
      mpPaymentId: mpOrder.paymentId,
      mpStatus: mpOrder.status,
      mpStatusDetail: mpOrder.statusDetail,
      paidAt: status === 'PAID' ? (order.paidAt ?? new Date()) : order.paidAt,
      expiresAt,
      pix: mpOrder.pix,
    } as OrderRow & { pix: PixDetails | null });
  }

  /** Gravacao condicionada ao estado anterior. Devolve se **esta** chamada mudou. */
  private async transition(
    order: OrderRow,
    status: OrderStatus,
    mpOrder: MercadoPagoOrder | null,
  ): Promise<boolean> {
    const { count } = await this.prisma.order.updateMany({
      where: { id: order.id, status: { in: allowedFrom(status) } },
      data: {
        status,
        mpOrderId: mpOrder?.id ?? order.mpOrderId,
        mpPaymentId: mpOrder?.paymentId ?? order.mpPaymentId,
        mpStatus: mpOrder?.status ?? order.mpStatus,
        mpStatusDetail: mpOrder?.statusDetail ?? order.mpStatusDetail,
        ...(status === 'PAID' ? { paidAt: new Date() } : {}),
        // Spec 016, decisao 8: o estorno precisa de mes proprio. `paidAt`
        // continua onde esta — o dinheiro entrou naquele mes, e devolve-lo
        // depois nao muda isso.
        ...(status === 'REFUNDED' ? { refundedAt: new Date() } : {}),
        ...(this.pixExpirationDate(order, status, mpOrder)
          ? { expiresAt: this.pixExpirationDate(order, status, mpOrder) }
          : {}),
      },
    });

    return count > 0;
  }

  /** Vencimento do PIX, espelhando os 30 minutos enviados na order. */
  private pixExpirationDate(
    order: OrderRow,
    status: OrderStatus,
    mpOrder: MercadoPagoOrder | null,
  ): Date | null {
    if (order.expiresAt || status !== 'PENDING' || !mpOrder?.pix) {
      return null;
    }

    return new Date(Date.now() + 30 * 60 * 1000);
  }

  private pixExpiration(
    order: OrderRow,
    status: OrderStatus,
    mpOrder: MercadoPagoOrder,
  ): Date | null {
    return order.expiresAt ?? this.pixExpirationDate(order, status, mpOrder);
  }

  /**
   * Resolve os modulos do pedido e recusa o que nao pode ser vendido.
   *
   * As tres recusas dizem coisas diferentes de proposito: id que nao existe e
   * erro do cliente, modulo sem preco e conteudo nao publicado, e modulo ja
   * liberado e quase sempre engano do comprador — cobrar por ele seria pior do
   * que recusar.
   */
  private async resolveItems(user: AuthUser, dto: CreateOrderDto): Promise<OrderItemView[]> {
    if (!dto.moduleIds?.length) {
      throw new BadRequestException('Escolha ao menos um modulo.');
    }

    const modules = await this.prisma.module.findMany({
      where: { id: { in: dto.moduleIds } },
      select: { id: true, title: true, priceCents: true },
    });

    if (modules.length !== dto.moduleIds.length) {
      throw new BadRequestException('Algum modulo do pedido nao existe mais.');
    }

    const semPreco = modules.filter((module) => module.priceCents === null);

    if (semPreco.length > 0) {
      throw new BadRequestException(
        `O módulo "${semPreco[0].title}" ainda não está à venda.`,
      );
    }

    const active = await this.access.activeMap(user.uid);
    const jaLiberado = modules.filter((module) => active.has(module.id));

    if (jaLiberado.length > 0) {
      throw new ConflictException(
        `Você já tem acesso ao módulo "${jaLiberado[0].title}". Ele não precisa ser comprado de novo.`,
      );
    }

    // A ordem segue a do pedido, e nao a do banco: e assim que o resumo na tela
    // lista os itens.
    return dto.moduleIds.map((id) => {
      const module = modules.find((row) => row.id === id) as (typeof modules)[number];

      return { moduleId: module.id, title: module.title, priceCents: module.priceCents as number };
    });
  }

  /** Regras do meio de pagamento (decisao 9). */
  private validatePayment(dto: CreateOrderDto): void {
    if (dto.method === 'PIX') {
      if ((dto.installments ?? 1) > 1 || (dto.card?.installments ?? 1) > 1) {
        throw new BadRequestException('PIX não é parcelado.');
      }

      return;
    }

    if (!dto.card?.token) {
      throw new BadRequestException('Dados do cartão ausentes.');
    }

    const installments = dto.card.installments ?? dto.installments ?? 1;

    if (installments < 1 || installments > MAX_INSTALLMENTS) {
      throw new BadRequestException(`Parcelamento máximo de ${MAX_INSTALLMENTS}x.`);
    }
  }

  private toView(order: OrderRow & { pix?: PixDetails | null }): OrderView {
    return {
      id: order.id,
      status: order.status,
      amountCents: order.amountCents,
      method: order.method,
      installments: order.installments,
      items: (order.items ?? []).map((item) => ({
        moduleId: item.moduleId,
        title: item.titleSnapshot,
        priceCents: item.priceCents,
      })),
      pix: order.pix ?? null,
      expiresAt: order.expiresAt?.toISOString() ?? null,
      paidAt: order.paidAt?.toISOString() ?? null,
      message: order.status === 'REJECTED' ? rejectionMessage(order.mpStatusDetail) : null,
      mpOrderId: order.mpOrderId,
      mpPaymentId: order.mpPaymentId,
      bundle:
        order.bundleTitleSnapshot && order.tierNameSnapshot
          ? { title: order.bundleTitleSnapshot, tierName: order.tierNameSnapshot }
          : null,
    };
  }
}
