import { Body, Controller, Get, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AdminFinanceService } from './admin-finance.service';
import type { FinanceOrderListResult, FinanceSummary } from './admin-finance.types';
import { FinanceSummaryDto, ListFinanceOrdersDto } from './dto/finance-query.dto';
import { CreateGatewayFeeDto } from './dto/gateway-fee.dto';
import { CurrentFeeRates, GatewayFeeRateView, GatewayFeesService } from './gateway-fees.service';

/** Historico de vigencias mais o que vale hoje, que e o que a tela abre. */
export interface GatewayFeesResult {
  current: CurrentFeeRates;
  history: GatewayFeeRateView[];
}

/**
 * Painel financeiro (Spec 016).
 *
 * Os dois guards valem para a **classe**, e nao por metodo: aqui nenhum
 * endpoint e para aluno, e deixar a protecao no metodo faria da proxima rota um
 * furo por esquecimento (Spec 010, decisao 13). Quem autoriza e o claim do
 * token, e nunca a coluna `role`, que e espelho de leitura (Spec 013,
 * decisao 3).
 *
 * Esta classe **le**, e so escreve taxa (decisao 20): nao ha rota de estornar,
 * cancelar, reenviar cobranca ou conceder desconto. Estorno e contestacao
 * seguem no painel do Mercado Pago, e a plataforma reage a eles.
 */
@Controller('admin/finance')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles('admin')
export class AdminFinanceController {
  constructor(
    private readonly finance: AdminFinanceService,
    private readonly fees: GatewayFeesService,
  ) {}

  /**
   * O painel inteiro de um periodo: indicadores, comparacao com o anterior,
   * quebras por metodo e por modulo, serie temporal e o recorte de engajamento.
   *
   * Sem `from` e `to` o recorte cai nos ultimos 30 dias — a mesma janela do
   * `ACTIVITY_WINDOW_DAYS` da Spec 013, para que as duas abas do painel nao
   * tenham dois "recente" diferentes.
   */
  @Get('summary')
  summary(@Query() query: FinanceSummaryDto): Promise<FinanceSummary> {
    return this.finance.summary(query);
  }

  /**
   * A lista inteira do filtro corrente como anexo datado.
   *
   * Declarada **antes** de qualquer rota com parametro desta classe: o Nest
   * casa na ordem de declaracao, e "export" seria lido como o id de um pedido
   * no dia em que `orders/:id` existir.
   */
  @Get('orders/export')
  async exportOrders(
    @Query() query: ListFinanceOrdersDto,
    @Res() response: Response,
  ): Promise<void> {
    const csv = await this.finance.exportOrdersCsv(query);
    const date = new Date().toISOString().slice(0, 10);

    response
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="pedidos-${date}.csv"`)
      .send(csv);
  }

  /**
   * Uma pagina da lista de pedidos. Busca, filtro, ordenacao e paginacao sao do
   * servidor (Spec 013, decisao 7).
   */
  @Get('orders')
  listOrders(@Query() query: ListFinanceOrdersDto): Promise<FinanceOrderListResult> {
    return this.finance.listOrders(query);
  }

  /** Vigencias de taxa, da mais recente para a mais antiga, com autor e data. */
  @Get('fees')
  async listFees(): Promise<GatewayFeesResult> {
    const [current, history] = await Promise.all([this.fees.current(), this.fees.history()]);

    return { current, history };
  }

  /**
   * Cadastra uma vigencia e encerra a anterior do mesmo metodo.
   *
   * O autor vem do `@CurrentUser()`, e nunca do corpo: autoria que o cliente
   * declara nao e autoria (decisao 7). Nao existe contrapartida de edicao nem
   * de remocao — a tabela e append-only, e corrigir uma taxa e cadastrar outra.
   */
  @Post('fees')
  createFee(
    @CurrentUser() actor: AuthUser,
    @Body() dto: CreateGatewayFeeDto,
  ): Promise<GatewayFeeRateView> {
    return this.fees.create(actor, dto);
  }
}
