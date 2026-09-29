/**
 * Estrutura do texto dos documentos legais (Spec 015, Spec 022).
 *
 * Mora fora da `LegalPage` de proposito: o parser e a pre-visualizacao do
 * painel usam estes tipos sem depender de componente Angular.
 */

/** Bloco do corpo: um paragrafo ou uma lista de itens. */
export type LegalBlock =
  | { readonly kind: 'paragraph'; readonly text: string }
  | { readonly kind: 'list'; readonly items: readonly string[] };

/** Paragrafo do corpo. */
export function p(text: string): LegalBlock {
  return { kind: 'paragraph', text };
}

/** Lista de itens do corpo. */
export function ul(...items: string[]): LegalBlock {
  return { kind: 'list', items };
}

export interface LegalSection {
  /**
   * Titulo da clausula — vira `<h2>`. Vazio so no texto que comeca sem titulo
   * (Spec 022, decisao 1): o que vem antes do primeiro `## ` ainda e corpo.
   */
  title: string;
  body: readonly LegalBlock[];
}
