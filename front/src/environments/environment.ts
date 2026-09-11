export const environment = {
  production: true,
  /**
   * URL base da API.
   * TODO: apontar para o dominio do backend quando ele for publicado; hoje o
   * `api/` so roda localmente e o front na Vercel nao tem esse destino.
   */
  apiUrl: 'https://delcastanher-api-gamma.vercel.app',
  /**
   * Container do Google Tag Manager (Spec 009, decisao 5).
   *
   * Nao e segredo: este arquivo e compilado dentro do bundle e um ID de GTM e
   * publico por natureza. A precaucao aqui e de comportamento, nao de sigilo —
   * **vazio significa no-op**: nenhum script de terceiro e injetado e nenhum
   * evento sai, so um log em desenvolvimento. Preencher esta string e o unico
   * passo para ligar a medicao, e ela so entra em acao apos o consentimento.
   */
  gtmId: '',
  /** Mesma regra do `gtmId`, para uso direto de GA4 sem container. */
  ga4Id: '',
};
