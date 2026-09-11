/**
 * Escreve `src/environments/environment.ts` a partir das variaveis de ambiente
 * do build (Vercel) antes de o `ng build` rodar.
 *
 * Por que isto existe: o Angular compila o environment dentro do bundle, entao
 * uma variavel configurada na Vercel nao chega sozinha ao codigo. Sem este
 * passo, criar `GTM_ID` no painel nao teria efeito nenhum em producao — o
 * valor lido continuaria sendo o que esta versionado no repositorio.
 *
 * Nada aqui e segredo: ID de GTM/GA4 e dominio publico sao visiveis no HTML
 * de qualquer visitante. O ganho e operacional — ligar a medicao passa a ser
 * editar um campo no painel e redeployar, em vez de abrir um PR.
 *
 * Sem as variaveis definidas (build local), os defaults abaixo reproduzem
 * exatamente o arquivo versionado: rodar o build nao suja o git.
 */
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const TARGET = join(import.meta.dirname, '..', 'src', 'environments', 'environment.ts');

const env = {
  apiUrl: process.env.API_URL ?? 'https://delcastanher-api-gamma.vercel.app',
  siteOrigin: process.env.SITE_ORIGIN ?? 'https://delcastanher.vercel.app',
  gtmId: process.env.GTM_ID ?? '',
  ga4Id: process.env.GA4_ID ?? '',
};

const file = `// ARQUIVO GERADO NO BUILD por scripts/apply-env.mjs — nao edite a mao.
// Os valores vem das variaveis de ambiente do projeto na Vercel (API_URL,
// SITE_ORIGIN, GTM_ID, GA4_ID); os defaults do script valem no build local.
export const environment = {
  production: true,
  /** URL base da API. */
  apiUrl: ${JSON.stringify(env.apiUrl)},
  /**
   * Dominio canonico da vitrine. Alimenta canonical, og:url e o sitemap — o
   * prerender roda no Node, onde nao existe \`location\` para deduzir o host.
   */
  siteOrigin: ${JSON.stringify(env.siteOrigin)},
  /**
   * Container do Google Tag Manager (Spec 009, decisao 5).
   *
   * Nao e segredo: um ID de GTM e publico por natureza. A precaucao aqui e de
   * comportamento — **vazio significa no-op**: nenhum script de terceiro e
   * injetado e nenhum evento sai. Preencher a variavel na Vercel e o unico
   * passo para ligar a medicao, e ela so entra em acao apos o consentimento.
   */
  gtmId: ${JSON.stringify(env.gtmId)},
  /** Mesma regra do \`gtmId\`, para uso direto de GA4 sem container. */
  ga4Id: ${JSON.stringify(env.ga4Id)},
};
`;

await writeFile(TARGET, file, 'utf8');

const configured = Object.entries(env)
  .filter(([key]) => key === 'gtmId' || key === 'ga4Id')
  .map(([key, value]) => `${key}=${value === '' ? '(vazio — medicao desligada)' : value}`)
  .join(', ');

console.log(`environment.ts gerado: siteOrigin=${env.siteOrigin}, ${configured}`);
