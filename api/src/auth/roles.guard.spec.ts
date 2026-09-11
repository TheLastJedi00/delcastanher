import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthUser, Role } from './auth.types';
import { AuthenticatedRequest } from './firebase-auth.guard';
import { ROLES_KEY, Roles } from './roles.decorator';
import { RolesGuard } from './roles.guard';

function userWith(role: Role): AuthUser {
  return { uid: 'uid-123', email: 'pessoa@delcastanher.com', name: 'Pessoa', role };
}

function contextFor(request: Partial<AuthenticatedRequest>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
  } as unknown as ExecutionContext;
}

/** Reflector que responde sempre o mesmo conjunto de papeis exigidos. */
function reflectorWith(required: Role[] | undefined): Reflector {
  return { getAllAndOverride: jest.fn().mockReturnValue(required) } as unknown as Reflector;
}

describe('@Roles()', () => {
  it('grava os papeis exigidos nos metadados do handler', () => {
    class Alvo {
      @Roles('admin')
      metodo(): void {}
    }

    expect(Reflect.getMetadata(ROLES_KEY, Alvo.prototype.metodo)).toEqual(['admin']);
  });
});

describe('RolesGuard', () => {
  it('libera a rota sem @Roles(): a exigencia de papel e opt-in', () => {
    const guard = new RolesGuard(reflectorWith(undefined));

    expect(guard.canActivate(contextFor({ user: userWith('aluno') }))).toBe(true);
  });

  it('libera o admin em uma rota @Roles("admin")', () => {
    const guard = new RolesGuard(reflectorWith(['admin']));

    expect(guard.canActivate(contextFor({ user: userWith('admin') }))).toBe(true);
  });

  it('recusa o aluno em uma rota @Roles("admin") com 403', () => {
    const guard = new RolesGuard(reflectorWith(['admin']));

    expect(() => guard.canActivate(contextFor({ user: userWith('aluno') }))).toThrow(
      ForbiddenException,
    );
  });

  it('responde 401 quando nao ha sessao resolvida na requisicao', () => {
    const guard = new RolesGuard(reflectorWith(['admin']));

    // Sem `user` o FirebaseAuthGuard nao rodou: o problema e de autenticacao,
    // nao de permissao, e confundir os dois esconde um guard mal encadeado.
    expect(() => guard.canActivate(contextFor({}))).toThrow(UnauthorizedException);
  });

  it('aceita qualquer um dos papeis listados', () => {
    const guard = new RolesGuard(reflectorWith(['admin', 'aluno']));

    expect(guard.canActivate(contextFor({ user: userWith('aluno') }))).toBe(true);
  });
});
