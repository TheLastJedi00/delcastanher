import { Body, Controller, HttpCode, Headers, Post, Query, UnauthorizedException } from '@nestjs/common';
import { MercadoPagoService } from './mercado-pago.service';
import { OrdersService } from './orders.service';

/** Notificacao do Mercado Pago, no que esta API consome. */
interface MercadoPagoNotification {
  type?: string;
  action?: string;
  data?: { id?: string };
}

/**
 * Webhook do Mercado Pago (Spec 014, decisao 12).
 *
 * Rota **publica**, explicitamente fora do `FirebaseAuthGuard`: o Mercado Pago
 * nao tem sessao nesta plataforma — mesma situacao de `POST /webhooks/mux`
 * (Spec 010, decisao 5). O que separa um evento legitimo de um POST qualquer da
 * internet e a assinatura HMAC do header `x-signature`.
 *
 * Validada a origem, a notificacao e tratada como **um aviso de que algo
 * mudou**: o estado vem de `GET /v1/orders/:id`, consultado com o nosso access
 * token. O corpo do POST so informa qual id consultar — acreditar nele seria
 * aceitar que um terceiro declarasse um pedido como pago.
 */
@Controller('webhooks')
export class MercadoPagoWebhookController {
  constructor(
    private readonly gateway: MercadoPagoService,
    private readonly orders: OrdersService,
  ) {}

  @Post('mercadopago')
  @HttpCode(200)
  async receive(
    @Headers('x-signature') signature: string,
    @Headers('x-request-id') requestId: string,
    @Query('data.id') dataIdFromQuery: string,
    @Body() body: MercadoPagoNotification,
  ): Promise<{ received: true }> {
    const dataId = dataIdFromQuery || body?.data?.id;

    if (!this.gateway.verifyWebhookSignature({ signature, requestId, dataId })) {
      throw new UnauthorizedException('Assinatura do webhook invalida.');
    }

    // 200 mesmo para o que nao interessa: recusar faria o Mercado Pago
    // reentregar para sempre um evento que nunca vai ser tratado.
    if (body?.type === 'order' && dataId) {
      await this.orders.applyFromGateway(dataId);
    }

    return { received: true };
  }
}
