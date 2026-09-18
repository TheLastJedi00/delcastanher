/**
 * Versoes da Politica de Privacidade que a API reconhece (Spec 015).
 *
 * O cliente informa qual versao o titular aceitou, e a API confere contra esta
 * lista. Aceitar a string que vier do navegador transformaria o registro em
 * nada: bastaria enviar `"2099-01-01"` — ou `"qualquer coisa"` — para a coluna
 * guardar um aceite de um documento que nunca existiu. Prova que o proprio
 * provado escreve nao e prova.
 *
 * Esta lista acompanha o `CONSENT_POLICY_VERSION` do front
 * (`front/src/app/core/services/consent.service.ts`). Ao subir a versao la, a
 * nova entra aqui — e as antigas ficam, porque um aceite gravado sob a versao
 * anterior continua sendo um fato historico verdadeiro sobre aquele titular,
 * mesmo depois de deixar de valer para a versao vigente.
 */
export const KNOWN_POLICY_VERSIONS = ['2026-09-13'] as const;

export type PolicyVersion = (typeof KNOWN_POLICY_VERSIONS)[number];

/** Versao em vigor — a que o onboarding apresenta hoje. */
export const CURRENT_POLICY_VERSION: PolicyVersion = '2026-09-13';
