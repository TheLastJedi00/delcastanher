import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthUser } from './auth.types';
import { AuthenticatedRequest, FirebaseAuthGuard } from './firebase-auth.guard';

const USER: AuthUser = {
  uid: 'uid-123',
  email: 'aluno@delcastanher.com',
  name: 'Aluno Teste',
  role: 'aluno',
};

function contextFor(request: Partial<AuthenticatedRequest>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function buildGuard(verify: jest.Mock) {
  return new FirebaseAuthGuard({ verify } as unknown as AuthService);
}

describe('FirebaseAuthGuard', () => {
  it('rejeita a requisicao sem header Authorization', async () => {
    const verify = jest.fn();

    await expect(buildGuard(verify).canActivate(contextFor({ headers: {} }))).rejects.toThrow(
      UnauthorizedException,
    );
    expect(verify).not.toHaveBeenCalled();
  });

  it('rejeita um header que nao seja do tipo Bearer', async () => {
    const verify = jest.fn();
    const context = contextFor({ headers: { authorization: 'Basic abc' } });

    await expect(buildGuard(verify).canActivate(context)).rejects.toThrow(UnauthorizedException);
    expect(verify).not.toHaveBeenCalled();
  });

  it('propaga a recusa do AuthService quando o token e invalido', async () => {
    const verify = jest.fn().mockRejectedValue(new UnauthorizedException('Sessao invalida.'));
    const context = contextFor({ headers: { authorization: 'Bearer token-invalido' } });

    await expect(buildGuard(verify).canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('libera a rota e anexa o usuario a requisicao quando o token e valido', async () => {
    const verify = jest.fn().mockResolvedValue(USER);
    const request = { headers: { authorization: 'Bearer token-valido' } } as AuthenticatedRequest;

    await expect(buildGuard(verify).canActivate(contextFor(request))).resolves.toBe(true);

    expect(verify).toHaveBeenCalledWith('token-valido');
    expect(request.user).toEqual(USER);
  });
});
