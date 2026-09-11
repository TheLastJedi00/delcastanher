import { BadRequestException, Body, Controller, Headers, HttpCode, Post, Req, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { MuxService } from '../mux/mux.service';
import type { MuxWebhookEvent } from './content.types';
import { VideoService } from './video.service';

/** Requisicao com o corpo cru preservado (`rawBody: true` no `main.ts`). */
interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

/**
 * Webhook do Mux. Rota **publica**, explicitamente fora do `FirebaseAuthGuard`:
 * o Mux nao tem sessao na plataforma. O que separa um evento legitimo de um
 * POST qualquer da internet e a assinatura HMAC do corpo cru (decisao 5) — por
 * isso o `main.ts` sobe com `rawBody: true`: o JSON reserializado por
 * `JSON.stringify` nao reproduz byte a byte o que foi assinado.
 */
@Controller('webhooks')
export class MuxWebhookController {
  constructor(
    private readonly video: VideoService,
    private readonly mux: MuxService,
  ) {}

  @Post('mux')
  @HttpCode(200)
  async receive(
    @Req() request: RawBodyRequest,
    @Headers('mux-signature') signature: string,
    @Body() body: MuxWebhookEvent,
  ): Promise<{ received: true }> {
    const raw = request.rawBody?.toString('utf8');

    if (!raw) {
      throw new BadRequestException('Corpo da requisicao ausente.');
    }

    if (!this.mux.verifyWebhookSignature(raw, signature)) {
      throw new UnauthorizedException('Assinatura do webhook invalida.');
    }

    await this.video.applyWebhookEvent(body);

    // 200 mesmo para evento que nao interessa: recusar faria o Mux reentregar
    // indefinidamente um evento que nunca vai ser tratado.
    return { received: true };
  }
}
