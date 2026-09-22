import { BadRequestException, Injectable } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { PaymentMethodKind } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGatewayFeeDto } from './dto/gateway-fee.dto';

/** Uma vigencia de taxa, como o painel a le. */
export interface GatewayFeeRateView {
  id: string;
  method: PaymentMethodKind;
  percentBasisPoints: number;
  fixedCents: number;
  validFrom: Date;
  /** Nulo e a vigencia corrente. */
  validTo: Date | null;
  createdById: string;
  createdByEmail: string;
  note: string | null;
  createdAt: Date;
}

/** A vigencia corrente de cada metodo; nulo onde nada foi cadastrado. */
export type CurrentFeeRates = Record<PaymentMethodKind, GatewayFeeRateView | null>;

/** O que o calculo precisa de uma vigencia — e so isso. */
export interface FeeRateParts {
  percentBasisPoints: number;
  fixedCents: number;
}

/**
 * A taxa de **um** pedido, meio para cima.
 *
 * O arredondamento e por pedido, e a soma vem depois. Aplicar o percentual
 * sobre a soma do periodo daria um total que nao bate com a soma das linhas, e
 * a primeira conferencia manual encontraria a diferenca (decisao 4, secao
 * "Arredondamento").
 */
export function feeOf(amountCents: number, rate: FeeRateParts): number {
  return Math.round((amountCents * rate.percentBasisPoints) / 10000) + rate.fixedCents;
}

/**
 * Taxas do gateway, mantidas a mao (Spec 016, decisoes 3, 4 e 7).
 *
 * Duas regras organizam tudo o que esta aqui:
 *
 * 1. **Ausencia de vigencia nao e zero.** `rateAt` devolve `null`, e quem
 *    chama precisa decidir o que fazer com isso — que no painel e dizer
 *    "liquido nao apurado" (decisao 5). Uma taxa zerada por omissao produziria
 *    um liquido inflado e crivel, que e a pior forma de errar dinheiro.
 * 2. **Nada e editado no lugar.** Corrigir uma taxa cria uma linha nova e
 *    encerra a anterior. A unica escrita sobre linha existente e o `validTo`
 *    do encerramento, e ela nao altera nenhum valor de taxa (decisao 7).
 */
@Injectable()
export class GatewayFeesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Historico inteiro, da vigencia mais recente para a mais antiga. */
  async history(): Promise<GatewayFeeRateView[]> {
    return (await this.prisma.gatewayFeeRate.findMany({
      orderBy: [{ validFrom: 'desc' }, { createdAt: 'desc' }],
    })) as GatewayFeeRateView[];
  }

  /** A vigencia corrente de cada metodo, ou nulo onde nao ha nenhuma. */
  async current(): Promise<CurrentFeeRates> {
    const open = (await this.prisma.gatewayFeeRate.findMany({
      where: { validTo: null },
      orderBy: [{ validFrom: 'desc' }, { createdAt: 'desc' }],
    })) as GatewayFeeRateView[];

    return {
      PIX: open.find((rate) => rate.method === 'PIX') ?? null,
      CREDIT_CARD: open.find((rate) => rate.method === 'CREDIT_CARD') ?? null,
    };
  }

  /**
   * As vigencias que podem alcancar um periodo, em **uma** consulta.
   *
   * O resumo resolve a taxa de centenas de pedidos; consultar por pedido seria
   * um N+1 no caminho de um relatorio (decisao 12). Sao poucas linhas ao todo,
   * entao elas vem inteiras e a resolucao acontece em memoria — o que esta
   * proibido de acontecer em memoria e a **soma do dinheiro**, e nao a escolha
   * de qual vigencia se aplica.
   */
  async ratesUntil(to: Date): Promise<GatewayFeeRateView[]> {
    return (await this.prisma.gatewayFeeRate.findMany({
      where: { validFrom: { lte: to } },
      orderBy: [{ validFrom: 'desc' }],
    })) as GatewayFeeRateView[];
  }

  /**
   * A vigencia aplicavel a um pagamento: mesmo metodo, `validFrom` inclusivo e
   * `validTo` exclusivo. Sem linha que case, **nulo** — e nunca uma taxa
   * zerada (decisao 5).
   */
  rateAt(
    rates: GatewayFeeRateView[],
    method: PaymentMethodKind,
    at: Date,
  ): GatewayFeeRateView | null {
    const instant = at.getTime();

    return (
      rates.find(
        (rate) =>
          rate.method === method &&
          rate.validFrom.getTime() <= instant &&
          (rate.validTo === null || rate.validTo.getTime() > instant),
      ) ?? null
    );
  }

  /**
   * Cadastra uma vigencia e encerra a anterior do mesmo metodo.
   *
   * As duas escritas vao na mesma transacao: um encerramento sem a linha nova
   * deixaria o metodo sem vigencia corrente, e o painel passaria a dizer "nao
   * apurado" para as vendas de hoje por causa de uma falha de rede.
   */
  async create(actor: AuthUser, dto: CreateGatewayFeeDto): Promise<GatewayFeeRateView> {
    const validFrom = new Date(dto.validFrom);

    await this.assertNoOverlap(dto.method, validFrom);

    return this.prisma.$transaction(async (tx) => {
      // A unica escrita desta spec sobre linha existente — e ela grava apenas
      // o fim da vigencia, nunca um valor de taxa (decisao 7).
      await tx.gatewayFeeRate.updateMany({
        where: { method: dto.method, validTo: null },
        data: { validTo: validFrom },
      });

      return (await tx.gatewayFeeRate.create({
        data: {
          method: dto.method,
          percentBasisPoints: dto.percentBasisPoints,
          fixedCents: dto.fixedCents ?? 0,
          validFrom,
          // Do token, e nunca do corpo: autoria que o cliente declara nao e
          // autoria. O e-mail e copia para continuar legivel depois de a conta
          // do autor sair da plataforma.
          createdById: actor.uid,
          createdByEmail: actor.email,
          note: dto.note ?? null,
        },
      })) as GatewayFeeRateView;
    });
  }

  /**
   * Vigencias do mesmo metodo nao se sobrepoem, e e aqui que isso e garantido.
   *
   * Duas recusas, e elas dizem coisas diferentes: uma data dentro de um
   * periodo ja encerrado reescreveria um mes fechado, e uma data anterior ao
   * inicio da vigencia corrente fecharia essa vigencia com um fim anterior ao
   * proprio comeco dela.
   */
  private async assertNoOverlap(method: PaymentMethodKind, validFrom: Date): Promise<void> {
    const rates = (await this.prisma.gatewayFeeRate.findMany({
      where: { method },
      orderBy: [{ validFrom: 'desc' }],
    })) as GatewayFeeRateView[];

    const instant = validFrom.getTime();

    const dentroDeEncerrada = rates.some(
      (rate) =>
        rate.validTo !== null &&
        rate.validFrom.getTime() <= instant &&
        rate.validTo.getTime() > instant,
    );

    if (dentroDeEncerrada) {
      throw new BadRequestException(
        'Ja existe uma vigencia encerrada cobrindo essa data. Corrigir o passado exigiria reescrever um mes ja fechado.',
      );
    }

    const anteriorACorrente = rates.some(
      (rate) => rate.validTo === null && rate.validFrom.getTime() >= instant,
    );

    if (anteriorACorrente) {
      throw new BadRequestException(
        'A data de inicio precisa ser posterior ao inicio da vigencia em vigor.',
      );
    }
  }
}
