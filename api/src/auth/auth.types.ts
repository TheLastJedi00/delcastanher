/** Perfis de acesso da plataforma. */
export type Role = 'aluno' | 'admin';

/** Usuario autenticado, no formato consumido pelo front. */
export interface AuthUser {
  uid: string;
  email: string;
  name: string | null;
  role: Role;
}

/**
 * Corpo da resposta de login e de refresh. O refresh token nao esta aqui: ele
 * so trafega no cookie HttpOnly (Spec 017, decisao 13).
 */
export interface AuthSession {
  idToken: string;
  /** Validade do idToken, em segundos. */
  expiresIn: number;
  user: AuthUser;
}

/** Sessao emitida pelo `AuthService`, com o refresh token para o cookie. */
export interface IssuedSession {
  session: AuthSession;
  refreshToken: string;
}

/** Resposta dos fluxos que disparam e-mail (criar conta / recuperar senha). */
export interface AccountRequestResult {
  message: string;
}
