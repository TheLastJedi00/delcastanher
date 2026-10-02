import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Token do link de descadastro (Spec 023, decisao B5): `base64url(userId)` +
 * `.` + `base64url(HMAC-SHA256(userId))`.
 *
 * Sem validade e sem login, de proposito: o link de um e-mail de meses atras
 * precisa continuar descadastrando, e exigir entrar na conta para parar de
 * receber e-mail e o padrao que a LGPD e os provedores de e-mail recusam.
 * Deterministico: o mesmo aluno tem sempre o mesmo link.
 */
export function signUnsubscribeToken(userId: string, secret: string): string {
  const id = Buffer.from(userId, 'utf8').toString('base64url');

  return `${id}.${signature(userId, secret)}`;
}

/** O `userId` do token, ou nulo se ele foi adulterado ou nao tem o formato. */
export function verifyUnsubscribeToken(token: string, secret: string): string | null {
  if (typeof token !== 'string') {
    return null;
  }

  const parts = token.split('.');

  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return null;
  }

  const userId = Buffer.from(parts[0], 'base64url').toString('utf8');

  if (!userId) {
    return null;
  }

  const expected = Buffer.from(signature(userId, secret), 'utf8');
  const received = Buffer.from(parts[1], 'utf8');

  // Comparacao em tempo constante; tamanhos diferentes ja sao divergencia.
  return expected.length === received.length && timingSafeEqual(expected, received)
    ? userId
    : null;
}

function signature(userId: string, secret: string): string {
  return createHmac('sha256', secret).update(`unsubscribe:${userId}`).digest('base64url');
}
