/**
 * Environment de desenvolvimento.
 *
 * Ao contrario de `environment.ts`, este arquivo **nao** e gerado no build: ele
 * e editado a mao e nunca le variavel da Vercel. O `ng build` de producao o
 * substitui pelo gerado (`fileReplacements` acontece apenas no `development`).
 */
export const environment = {
  production: false,
  apiUrl: 'http://localhost:3000',
  /**
   * Origem usada em canonical e og:url durante o desenvolvimento. Aponta para
   * o dominio real de proposito: canonical com `localhost` mascararia um erro
   * que so apareceria em producao.
   */
  siteOrigin: 'https://delcastanher.vercel.app',
  /**
   * Vazio por regra (Spec 009, decisao 5): o `AnalyticsService` loga cada
   * evento no console em vez de carregar o container, o que permite validar
   * toda a instrumentacao sem sujar uma propriedade real com trafego de teste.
   */
  gtmId: '',
  ga4Id: '',
};
