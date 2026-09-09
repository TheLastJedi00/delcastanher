import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import { AuthUser } from './auth.types';
import { AuthenticatedRequest } from './firebase-auth.guard';

/** Usuario resolvido pelo `FirebaseAuthGuard`. Só use em rotas protegidas. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().user,
);
