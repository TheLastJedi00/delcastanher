import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { AuthUser } from './auth.types';

/** Requisicao ja autenticada: o guard garante o `user` antes do handler. */
export interface AuthenticatedRequest extends Request {
  user: AuthUser;
}

const BEARER = /^Bearer (.+)$/i;

/**
 * Protege as rotas que dependem de um usuario logado. A validacao do idToken
 * e a mesma do `POST /auth/verify` (`AuthService.verify`), para que exista uma
 * unica definicao de "sessao valida" na API, e o usuario resolvido fica na
 * requisicao para os controllers consumirem via `@CurrentUser()`.
 */
@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = BEARER.exec(request.headers.authorization ?? '')?.[1]?.trim();

    if (!token) {
      throw new UnauthorizedException('Informe o token de acesso no header Authorization.');
    }

    request.user = await this.auth.verify(token);

    return true;
  }
}
