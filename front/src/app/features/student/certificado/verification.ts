/** Endereco que o terceiro digita para conferir o diploma. */
export const VERIFICATION_PATH = '/certificado/verificar';

/** Endereco da verificacao com o host, como sai impresso no diploma. */
export function verificationUrl(): string {
  return typeof location === 'undefined' ? VERIFICATION_PATH : `${location.host}${VERIFICATION_PATH}`;
}
