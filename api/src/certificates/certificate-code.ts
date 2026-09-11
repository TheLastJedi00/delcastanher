import { createHmac, randomInt } from 'node:crypto';
import { ConfigService } from '@nestjs/config';

/** Segredo assumido fora de producao quando a variavel nao esta definida. */
export const DEV_HASH_SECRET = 'delcastanher-dev-certificate-secret';

/**
 * Alfabeto sem 0/O/1/I: o codigo e ditado por telefone e digitado a mao por
 * quem recebeu um diploma impresso, entao caractere ambiguo aqui vira suporte
 * depois.
 */
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

const PREFIX = 'DELC';
const GROUPS = 2;
const GROUP_SIZE = 4;

/**
 * Segredo do HMAC dos certificados. Mesma politica do CORS: opcional em
 * desenvolvimento, obrigatorio em producao — cair silenciosamente em um
 * segredo publico deixaria hash de producao forjavel por qualquer um que
 * leia este arquivo.
 */
export function hashSecret(config: ConfigService): string {
  const secret = config.get<string>('CERTIFICATE_HASH_SECRET')?.trim();

  if (secret) {
    return secret;
  }

  if (config.get<string>('NODE_ENV') === 'production') {
    throw new Error(
      'CERTIFICATE_HASH_SECRET nao configurada. Defina o segredo de assinatura ' +
        'dos certificados nas variaveis de ambiente do deploy.',
    );
  }

  return DEV_HASH_SECRET;
}

/** Codigo publico do certificado, no formato `DELC-XXXX-XXXX`. */
export function generateCode(): string {
  const groups = Array.from({ length: GROUPS }, () =>
    Array.from({ length: GROUP_SIZE }, () => ALPHABET[randomInt(ALPHABET.length)]).join(''),
  );

  return [PREFIX, ...groups].join('-');
}

/**
 * Normaliza o que a pessoa digitou no portal: maiusculas, sem espacos e com os
 * hifens no lugar, aceitando tanto `delc abcd2345` quanto `DELC-ABCD-2345`.
 * Devolve nulo quando nao sobra codigo nenhum.
 */
export function normalizeCode(input: string): string | null {
  const raw = input.toUpperCase().replace(/[^0-9A-Z]/g, '');

  if (!raw) {
    return null;
  }

  const body = raw.startsWith(PREFIX) ? raw.slice(PREFIX.length) : raw;
  const groups = body.match(/.{1,4}/g) ?? [];

  return [PREFIX, ...groups].join('-');
}

/**
 * Assinatura dos dados de emissao. Nao entra nome nem titulo: esses vem das
 * relacoes e podem mudar legitimamente (o aluno corrige o proprio nome no
 * perfil) sem que o diploma deva virar invalido. O que o hash protege e a
 * emissao em si — para quem, de que curso e quando.
 */
export function certificateHash(
  secret: string,
  data: { code: string; userId: string; courseId: string; issuedAt: Date; moduleId?: string | null },
): string {
  const parts = [data.code, data.userId, data.courseId, data.issuedAt.toISOString()];

  // O modulo so entra quando existe, e sempre no fim: incluir um campo vazio
  // para o diploma de curso mudaria o hash de todos os ja emitidos na Spec
  // 008, e um diploma valido viraria "adulterado" da noite para o dia.
  if (data.moduleId) {
    parts.push(data.moduleId);
  }

  return createHmac('sha256', secret).update(parts.join('|')).digest('hex');
}
