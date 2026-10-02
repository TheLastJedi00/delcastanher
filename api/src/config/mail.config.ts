import { ConfigService } from '@nestjs/config';
import { optionalEnv, requiredEnv } from './media.config';

/**
 * E-mail pela API (Spec 023, decisao B1). A chave do Resend e o segredo do
 * descadastro **nunca** saem daqui; remetente e enderecos publicos sao
 * configuracao.
 */

/** Remetente quando `EMAIL_FROM` nao foi definido. */
export const DEFAULT_EMAIL_FROM = 'Delcastanher <contato@mail.delcastanher.srv.br>';

/** Chave da API do Resend. */
export function resendApiKey(config: ConfigService): string {
  return requiredEnv(config, 'RESEND_API_KEY');
}

/** Nome e endereco do remetente, no subdominio verificado no Resend. */
export function emailFrom(config: ConfigService): string {
  return optionalEnv(config, 'EMAIL_FROM') ?? DEFAULT_EMAIL_FROM;
}

/**
 * Segredo do HMAC do link de descadastro (decisao B5). Trocar o valor invalida
 * os links dos e-mails ja enviados.
 */
export function unsubscribeSecret(config: ConfigService): string {
  return requiredEnv(config, 'EMAIL_UNSUBSCRIBE_SECRET');
}

/** Endereco do front, para os links do corpo e do rodape. */
export function frontendUrl(config: ConfigService): string {
  return (optionalEnv(config, 'FRONTEND_URL') ?? 'http://localhost:4200').replace(/\/+$/, '');
}

/**
 * Endereco publico desta API. E para ele que aponta o `List-Unsubscribe` de um
 * clique: o `POST` do Gmail vai direto a API, sem passar pelo front.
 */
export function apiPublicUrl(config: ConfigService): string {
  return (optionalEnv(config, 'API_PUBLIC_URL') ?? 'http://localhost:3000').replace(/\/+$/, '');
}
