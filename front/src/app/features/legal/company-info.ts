/**
 * Dados da controladora, em um lugar so (Spec 015, decisao 5).
 *
 * Razao social, CNPJ e contato aparecem em mais de uma secao da Politica de
 * Privacidade e voltam a aparecer na Politica de Cookies. Repetidos no corpo de
 * cada pagina, divergem na primeira atualizacao — e divergencia de CNPJ entre
 * duas secoes do mesmo documento e o tipo de erro que so e descoberto por quem
 * esta conferindo o documento contra a Receita.
 */
export const COMPANY = {
  legalName: 'DELCASTANHER Serviços Administrativos e Treinamentos Ltda.',
  shortName: 'DELCASTANHER',
  cnpj: '58.216.042/0001-44',
  city: 'Blumenau',
  state: 'SC',

  /**
   * Canal de atendimento ao titular (Art. 18 da LGPD) e contato geral.
   *
   * **Divida conhecida:** e um e-mail pessoal em provedor gratuito. Ele nao
   * sobrevive a troca de pessoa, nao tem caixa compartilhada e mistura
   * solicitacao de titular com correspondencia particular. Quando existir
   * `privacidade@` no dominio proprio, a troca e nesta linha — e por isso que o
   * contato mora aqui, e nao escrito no meio do texto das duas paginas.
   */
  email: 'lidiane_delcastanher@hotmail.com',
  phone: '47-992908953',
} as const;

/** Sede no formato usado no corpo do documento: "Blumenau SC". */
export const COMPANY_LOCATION = `${COMPANY.city} ${COMPANY.state}`;
