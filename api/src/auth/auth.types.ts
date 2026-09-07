/** Perfis de acesso da plataforma. */
export type Role = 'aluno' | 'admin';

/** Usuario autenticado, no formato consumido pelo front. */
export interface AuthUser {
  uid: string;
  email: string;
  name: string | null;
  role: Role;
}

/** Resposta de um login bem sucedido. */
export interface AuthSession {
  idToken: string;
  refreshToken: string;
  /** Validade do idToken, em segundos. */
  expiresIn: number;
  user: AuthUser;
}
