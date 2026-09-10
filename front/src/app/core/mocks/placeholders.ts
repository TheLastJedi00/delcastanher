/**
 * Placeholders comerciais da Spec 006.
 *
 * Nada aqui pode virar dado inventado: preco, prazo de garantia, numero de vagas
 * e link de checkout so saem do placeholder quando o time comercial definir o
 * valor real. O template renderiza esses textos com tratamento visual proprio
 * (ver `isPlaceholder`), entao o visitante enxerga "a definir" e nao um erro.
 */
export const PLACEHOLDER = {
  price: '[PREÇO]',
  installments: '[Nx DE R$ ...]',
  priceFrom: '[PREÇO CHEIO]',
  course: '[CURSO A SER CADASTRADO]',
  checkout: '[LINK DE CHECKOUT]',
  deadline: '[TURMA ENCERRA EM]',
  seats: '[VAGAS RESTANTES]',
  guaranteePeriod: '[PRAZO DE GARANTIA]',
  videoTestimonial: '[DEPOIMENTO EM VÍDEO]',
  startDate: '[DATA DE INÍCIO]',
  workload: '[CARGA HORÁRIA]',
  // A assinatura digitalizada da coordenacao ainda nao foi enviada. Ela e a
  // rubrica de uma pessoa real: nao ha como desenhar uma "provisoria".
  signature: '[ASSINATURA DA COORDENAÇÃO]',
} as const;

/** Marcador reconhecido pelo template: qualquer texto no formato `[ALGO]`. */
const PLACEHOLDER_PATTERN = /^\[.+\]$/;

export function isPlaceholder(value: string | null | undefined): boolean {
  return !!value && PLACEHOLDER_PATTERN.test(value.trim());
}
