import { InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Credenciais de Storage e de CDN, lidas em um unico lugar.
 *
 * Nenhuma delas entra no `environment.ts` do front: o padrao da Spec 009
 * (decisao 5) vale para `gtmId`/`ga4Id`, que sao publicos por natureza — uma
 * chave secreta compilada no bundle estaria visivel para qualquer visitante
 * (decisao 7).
 */

/** Nomes aceitos para cada credencial, na ordem de precedencia. */
const ALIASES: Record<string, readonly string[]> = {
  // A integracao Mux do marketplace da Vercel injeta as variaveis com o
  // prefixo `MUX_VIDEO_`. Aceitar os dois nomes evita duplicar segredo a mao
  // no painel so para casar com a nomenclatura da spec.
  MUX_TOKEN_ID: ['MUX_TOKEN_ID', 'MUX_VIDEO_MUX_TOKEN_ID'],
  MUX_TOKEN_SECRET: ['MUX_TOKEN_SECRET', 'MUX_VIDEO_MUX_TOKEN_SECRET'],
  MUX_SIGNING_KEY_ID: ['MUX_SIGNING_KEY_ID', 'MUX_VIDEO_MUX_SIGNING_KEY_ID'],
  MUX_SIGNING_PRIVATE_KEY: ['MUX_SIGNING_PRIVATE_KEY', 'MUX_VIDEO_MUX_SIGNING_PRIVATE_KEY'],
  MUX_WEBHOOK_SECRET: ['MUX_WEBHOOK_SECRET', 'MUX_VIDEO_MUX_WEBHOOK_SECRET'],
};

/** Valor de uma variavel, aceitando os apelidos conhecidos. Vazio vira nulo. */
export function optionalEnv(config: ConfigService, name: string): string | null {
  for (const candidate of ALIASES[name] ?? [name]) {
    const value = config.get<string>(candidate)?.trim();

    if (value) {
      return value;
    }
  }

  return null;
}

/**
 * Variavel obrigatoria. Falta de credencial vira 500 com o nome da variavel:
 * um "nao foi possivel enviar" generico faria o admin procurar o erro no
 * arquivo em vez de no painel de variaveis.
 */
export function requiredEnv(config: ConfigService, name: string): string {
  const value = optionalEnv(config, name);

  if (!value) {
    throw new InternalServerErrorException(`${name} nao configurada.`);
  }

  return value;
}

/**
 * Bucket do Firebase Storage pelo nome, sem o prefixo `gs://` — o Admin SDK
 * nao o aceita, e a variavel copiada do console do Firebase costuma vir com
 * ele (decisao 7).
 */
export function storageBucket(config: ConfigService): string {
  return requiredEnv(config, 'FIREBASE_STORAGE_BUCKET').replace(/^gs:\/\//, '').replace(/\/+$/, '');
}

/** Par de credenciais da API do Mux (Basic auth). */
export function muxCredentials(config: ConfigService): { tokenId: string; tokenSecret: string } {
  return {
    tokenId: requiredEnv(config, 'MUX_TOKEN_ID'),
    tokenSecret: requiredEnv(config, 'MUX_TOKEN_SECRET'),
  };
}

/**
 * Chave de assinatura do playback. O Mux entrega a privada em base64; aceitar
 * tambem o PEM cru evita que colar a chave "do jeito que aparece" quebre em
 * producao sem mensagem util.
 */
export function muxSigningKey(config: ConfigService): { keyId: string; privateKey: string } {
  const raw = requiredEnv(config, 'MUX_SIGNING_PRIVATE_KEY');
  const privateKey = raw.includes('-----BEGIN')
    ? raw.replace(/\n/g, '\n')
    : Buffer.from(raw, 'base64').toString('utf8');

  return { keyId: requiredEnv(config, 'MUX_SIGNING_KEY_ID'), privateKey };
}

/** Segredo do webhook do Mux, usado na verificacao da assinatura. */
export function muxWebhookSecret(config: ConfigService): string {
  return requiredEnv(config, 'MUX_WEBHOOK_SECRET');
}
