import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import { cronSecret } from '../config/payments.config';

/**
 * Confere o `Authorization: Bearer <CRON_SECRET>` que o Vercel Cron manda nas
 * rotinas `/internal/*` (Spec 020, decisao 8). Sem o segredo, 401. Comparacao
 * em tempo constante.
 */
export function assertCronSecret(config: ConfigService, authorization: string | undefined): void {
  const expected = Buffer.from(`Bearer ${cronSecret(config)}`, 'utf8');
  const received = Buffer.from(authorization ?? '', 'utf8');

  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    throw new UnauthorizedException();
  }
}
