import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from './auth.types';
import { AuthenticatedRequest } from './firebase-auth.guard';
import { ROLES_KEY } from './roles.decorator';

/**
 * Autorizacao por papel. Roda **depois** do `FirebaseAuthGuard`, que e quem
 * resolve a sessao: aqui so se decide se o papel ja conhecido basta para a
 * rota. Sem sessao a resposta e 401, e nao 403, porque a diferenca entre
 * "entre de novo" e "sua conta nao pode isso" importa para quem recebe.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required?.length) {
      return true;
    }

    const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;

    if (!user) {
      throw new UnauthorizedException('Informe o token de acesso no header Authorization.');
    }

    if (!required.includes(user.role)) {
      throw new ForbiddenException('Esta area e restrita a administradores.');
    }

    return true;
  }
}
