import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
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
  constructor(private readonly fees: GatewayFeesService) {}

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
