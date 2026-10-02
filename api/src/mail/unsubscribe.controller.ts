import { Body, Controller, HttpCode, Post, Query } from '@nestjs/common';
import { UnsubscribeService } from './unsubscribe.service';

/**
 * Descadastro de campanhas (Spec 023, decisao B5).
 *
 * Rota **publica**, fora do `FirebaseAuthGuard`: chega aqui o aluno pela
 * pagina `/descadastro`, com o token no corpo, e o proprio Gmail no "Cancelar
 * inscricao", com o token na query e `List-Unsubscribe=One-Click` no corpo
 * (RFC 8058). O que autentica e o HMAC do token.
 *
 * So `POST`: um `GET` que descadastra seria disparado pelo antivirus que abre
 * os links do e-mail. O corpo e lido como objeto solto, e nao por DTO — com o
 * `forbidNonWhitelisted` do `main.ts`, um DTO recusaria o campo do Gmail.
 */
@Controller('email')
export class UnsubscribeController {
  constructor(private readonly unsubscribe: UnsubscribeService) {}

  @Post('unsubscribe')
  @HttpCode(200)
  async receive(
    @Query('token') tokenFromQuery: string | undefined,
    @Body() body: Record<string, unknown> | undefined,
  ): Promise<{ unsubscribed: true }> {
    const fromBody = typeof body?.token === 'string' ? body.token : undefined;

    await this.unsubscribe.unsubscribe(tokenFromQuery || fromBody);

    return { unsubscribed: true };
  }
}
