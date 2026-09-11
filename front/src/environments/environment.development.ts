export const environment = {
  production: false,
  apiUrl: 'http://localhost:3000',
  /**
   * Vazio em desenvolvimento por regra (Spec 009, decisao 5): o
   * `AnalyticsService` loga cada evento no console em vez de carregar o
   * container, o que permite validar toda a instrumentacao sem sujar uma
   * propriedade real com trafego de teste.
   */
  gtmId: '',
  ga4Id: '',
};
