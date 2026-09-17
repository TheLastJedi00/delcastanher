import { ConfigService } from '@nestjs/config';
import { optionalEnv, requiredEnv } from './media.config';

/**
 * Credenciais do Mercado Pago (Spec 014, decisoes 16 e 24).
 *
 * O access token e o segredo do webhook **nunca** saem daqui: quem fala com o
 * gateway e o backend, como as chaves do Mux (Spec 010, decisao 7). A
 * `public_key` e a unica que chega ao navegador, e mesmo ela sai por
 * `GET /store/payment-config` em vez de virar variavel de build do front —
 * assim alternar sandbox e producao e um deploy so, e nao dois coordenados.
 */

/** Credencial de servidor. */
export function mercadoPagoAccessToken(config: ConfigService): string {
  return requiredEnv(config, 'MP_ACCESS_TOKEN');
}

/** Chave publica entregue ao navegador para tokenizar o cartao. */
export function mercadoPagoPublicKey(config: ConfigService): string {
  return requiredEnv(config, 'MP_PUBLIC_KEY');
}

/** Segredo da assinatura do webhook (decisao 12). */
export function mercadoPagoWebhookSecret(config: ConfigService): string {
  return requiredEnv(config, 'MP_WEBHOOK_SECRET');
}

/**
 * Se o pagamento esta configurado. Falso desliga a loja com uma mensagem
 * honesta em vez de estourar 500 no meio do checkout — o que interessa em
 * desenvolvimento, onde nem toda maquina tem credencial.
 */
export function paymentsEnabled(config: ConfigService): boolean {
  return !!optionalEnv(config, 'MP_ACCESS_TOKEN') && !!optionalEnv(config, 'MP_PUBLIC_KEY');
}

/**
 * Se a credencial em uso e de teste.
 *
 * Nao e adivinhacao: as credenciais de teste do Mercado Pago sao emitidas com
 * os prefixos `TEST-` e `APP_USR-` conforme o produto, e o unico jeito honesto
 * de saber em qual ambiente estamos e perguntar ao ambiente. `MP_SANDBOX`
 * responde isso de forma explicita, e o front usa a resposta para exibir o
 * aviso de ambiente de teste — porque uma loja que cobra de mentira precisa
 * dizer isso na tela.
 */
export function mercadoPagoSandbox(config: ConfigService): boolean {
  return (optionalEnv(config, 'MP_SANDBOX') ?? 'true').toLowerCase() !== 'false';
}

/**
 * O que aparece na fatura do cartao do comprador. Curto e reconhecivel: uma
 * cobranca que o titular nao reconhece vira contestacao (checklist, item 16).
 */
export function statementDescriptor(config: ConfigService): string {
  return optionalEnv(config, 'MP_STATEMENT_DESCRIPTOR') ?? 'DELCASTANHER';
}
