import { Body, Controller, HttpCode, HttpException, HttpStatus, Post, UseGuards } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { ClientLogDto } from './dto/client-log.dto';
import { PaymentLogService } from './payment-log.service';

/** Eventos do navegador aceitos por aluno a cada `WINDOW_MS`. */
const MAX_EVENTS = 20;
const WINDOW_MS = 10 * 60 * 1000;

/**
 * Erros do navegador no caminho do cartao (Spec 028, decisao 9).
 *
 * Carregar o SDK, montar os Secure Fields, achar a bandeira e gerar o token
 * acontecem so no navegador, e uma falha ali nunca chegaria a API. Esta rota
 * os guarda em `payment_logs`, ligados a tentativa. Exige sessao, como a
 * compra, e tem limite por aluno para nao virar um deposito.
 */
@Controller('payments/client-logs')
@UseGuards(FirebaseAuthGuard)
export class PaymentClientLogsController {
  constructor(private readonly paymentLog: PaymentLogService) {}

  @Post()
  @HttpCode(204)
  async record(@CurrentUser() user: AuthUser, @Body() dto: ClientLogDto): Promise<void> {
    const recent = await this.paymentLog.countFrontSince(user.uid, new Date(Date.now() - WINDOW_MS));

    if (recent >= MAX_EVENTS) {
      throw new HttpException('Eventos demais. Tente de novo em alguns minutos.', HttpStatus.TOO_MANY_REQUESTS);
    }

    await this.paymentLog.record({
      attemptId: dto.attemptId ?? null,
      userId: user.uid,
      source: 'FRONT',
      stage: dto.stage,
      level: dto.level,
      message: dto.message,
      detail: dto.detail ?? null,
    });
  }
}
