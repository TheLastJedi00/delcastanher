import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { corsOrigins } from '../config/cors.config';

/**
 * Protege as rotas que agem sobre o cookie do refresh token (Spec 017,
 * decisao 16).
 *
 * O `SameSite=Strict` ja impede o navegador de mandar o cookie a partir de
 * outro site, e o CORS impede outra origem de ler a resposta. Mas o CORS nao
 * impede o `POST` de acontecer: sem esta conferencia, uma pagina qualquer
 * ainda dispararia a rotacao do cookie. A lista e a mesma do CORS, para que
 * exista uma so definicao de "front confiavel".
 */
@Injectable()
export class TrustedOriginGuard implements CanActivate {
  private readonly trusted: ReadonlySet<string>;

  constructor(config: ConfigService) {
    this.trusted = new Set(corsOrigins(config));
  }

  canActivate(context: ExecutionContext): boolean {
    const origin = context.switchToHttp().getRequest<Request>().headers.origin;

    if (!origin || !this.trusted.has(origin)) {
      throw new ForbiddenException('Origem nao autorizada.');
    }

    return true;
  }
}
