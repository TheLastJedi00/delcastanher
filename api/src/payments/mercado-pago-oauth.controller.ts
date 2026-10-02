import { Controller, Get, Headers, Query, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { assertCronSecret } from '../common/cron-auth';
import { MercadoPagoConnectionService } from './mercado-pago-connection.service';
import { MercadoPagoLinkService } from './mercado-pago-link.service';

/**
 * Retorno do OAuth do Mercado Pago (Spec 020, decisao 5).
 *
 * Rota **publica**, fora do `FirebaseAuthGuard`, como o webhook: quem volta do
 * Mercado Pago e o dono da conta vendedora, que nao tem sessao aqui. O que
 * autentica o retorno e o `state`, de uso unico — o servico decide, e daqui
 * sai so o redirecionamento para a pagina de resultado do front.
 */
@Controller('mercadopago/oauth')
export class MercadoPagoOAuthController {
  constructor(private readonly links: MercadoPagoLinkService) {}

  @Get('callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const target = await this.links.complete({ code, state, error });

    response.redirect(302, target);
  }
}

/**
 * Rotina diaria da conexao (Spec 020, decisao 8), chamada pelo Vercel Cron.
 *
 * `GET`, e nao `POST`: e o metodo com que o Vercel Cron chama, levando
 * `Authorization: Bearer <CRON_SECRET>`. Sem o segredo, 401.
 */
@Controller('internal/mercadopago')
export class InternalMercadoPagoController {
  constructor(
    private readonly connections: MercadoPagoConnectionService,
    private readonly links: MercadoPagoLinkService,
    private readonly config: ConfigService,
  ) {}

  @Get('refresh')
  async refresh(
    @Headers('authorization') authorization: string | undefined,
  ): Promise<{ checked: number; purgedStates: number }> {
    assertCronSecret(this.config, authorization);

    const { checked } = await this.connections.refreshDue();
    const purgedStates = await this.links.purgeStates();

    return { checked, purgedStates };
  }
}
