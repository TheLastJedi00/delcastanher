// ARQUIVO GERADO NO BUILD por scripts/apply-env.mjs — nao edite a mao.
// Os valores vem das variaveis de ambiente do projeto na Vercel (API_URL,
// SITE_ORIGIN, GTM_ID, GA4_ID); os defaults do script valem no build local.
export const environment = {
  production: true,
  /** URL base da API. */
  apiUrl: "https://delcastanher-api-gamma.vercel.app",
  /**
   * Dominio canonico da vitrine. Alimenta canonical, og:url e o sitemap — o
   * prerender roda no Node, onde nao existe `location` para deduzir o host.
   */
  siteOrigin: "https://delcastanher.vercel.app",
  /**
   * Container do Google Tag Manager (Spec 009, decisao 5).
   *
   * Nao e segredo: um ID de GTM e publico por natureza. A precaucao aqui e de
   * comportamento — **vazio significa no-op**: nenhum script de terceiro e
   * injetado e nenhum evento sai. Preencher a variavel na Vercel e o unico
   * passo para ligar a medicao, e ela so entra em acao apos o consentimento.
   */
  gtmId: "",
  /** Mesma regra do `gtmId`, para uso direto de GA4 sem container. */
  ga4Id: "",
};
