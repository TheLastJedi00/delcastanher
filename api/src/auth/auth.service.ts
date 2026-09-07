import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import { AuthSession, AuthUser, Role } from './auth.types';

const IDENTITY_TOOLKIT = 'https://identitytoolkit.googleapis.com/v1';

const ROLES: readonly Role[] = ['aluno', 'admin'];

/** Codigos da REST API do Firebase Auth mapeados para excecoes HTTP amigaveis. */
const ERROR_FACTORIES: Record<string, () => HttpException> = {
  EMAIL_NOT_FOUND: () => new UnauthorizedException('E-mail ou senha invalidos.'),
  INVALID_PASSWORD: () => new UnauthorizedException('E-mail ou senha invalidos.'),
  INVALID_LOGIN_CREDENTIALS: () => new UnauthorizedException('E-mail ou senha invalidos.'),
  INVALID_EMAIL: () => new BadRequestException('E-mail invalido.'),
  USER_DISABLED: () => new UnauthorizedException('Conta desativada.'),
  TOO_MANY_ATTEMPTS_TRY_LATER: () =>
    new HttpException(
      'Muitas tentativas seguidas. Aguarde alguns minutos e tente novamente.',
      HttpStatus.TOO_MANY_REQUESTS,
    ),
};

interface SignInResponse {
  localId: string;
  email: string;
  idToken: string;
  refreshToken: string;
  expiresIn: string;
}

/**
 * Concentra a autenticacao contra o Firebase: a validacao de credenciais usa a
 * REST API (o Admin SDK nao valida senha) e a confirmacao do token resultante
 * usa o Admin SDK, que tambem e a fonte do perfil (custom claim `role`).
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(protected readonly firebase: FirebaseService) {}

  async login(email: string, password: string): Promise<AuthSession> {
    const signIn = await this.identityToolkit<SignInResponse>('accounts:signInWithPassword', {
      email: this.normalizeEmail(email),
      password,
      returnSecureToken: true,
    });

    // Reconfirma o token pelo Admin SDK: e dele que vem as custom claims de perfil.
    const user = await this.verify(signIn.idToken);

    return {
      idToken: signIn.idToken,
      refreshToken: signIn.refreshToken,
      expiresIn: Number(signIn.expiresIn),
      user,
    };
  }

  async verify(idToken: string): Promise<AuthUser> {
    if (!idToken?.trim()) {
      throw new BadRequestException('idToken e obrigatorio.');
    }

    try {
      const claims = await this.firebase.auth.verifyIdToken(idToken, true);

      return {
        uid: claims.uid,
        email: claims.email ?? '',
        name: (claims.name as string | undefined) ?? null,
        role: this.toRole(claims.role),
      };
    } catch {
      throw new UnauthorizedException('Sessao invalida ou expirada. Entre novamente.');
    }
  }

  /** Chamada generica a Identity Toolkit, com traducao dos erros do Firebase. */
  protected async identityToolkit<T>(endpoint: string, body: Record<string, unknown>): Promise<T> {
    const url = `${IDENTITY_TOOLKIT}/${endpoint}?key=${this.firebase.webApiKey}`;

    let response: Response;

    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (error) {
      this.logger.error(`Falha ao contatar o Firebase (${endpoint}).`, error as Error);
      throw new ServiceUnavailableException(
        'Nao foi possivel contatar o servico de autenticacao. Tente novamente.',
      );
    }

    const payload = (await response.json()) as T & { error?: { message?: string } };

    if (!response.ok) {
      throw this.translate(payload.error?.message);
    }

    return payload;
  }

  private translate(rawMessage?: string): HttpException {
    // O Firebase devolve variacoes como "TOO_MANY_ATTEMPTS_TRY_LATER : ...".
    const code = (rawMessage ?? '').split(':')[0].trim();
    const factory = ERROR_FACTORIES[code];

    if (factory) {
      return factory();
    }

    this.logger.warn(`Erro nao mapeado do Firebase Auth: ${rawMessage ?? 'desconhecido'}`);

    return new UnauthorizedException('Nao foi possivel autenticar. Tente novamente.');
  }

  protected normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private toRole(value: unknown): Role {
    return ROLES.includes(value as Role) ? (value as Role) : 'aluno';
  }
}
