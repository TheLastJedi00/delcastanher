/**
 * Regra do YouTube da plataforma (Spec 018, decisao 3; Spec 023, decisao C3).
 *
 * Nenhuma URL vinda de fora vira `ResourceUrl`: so o id, e so se casar com o
 * formato de 11 caracteres. O embed e sempre o `youtube-nocookie.com`, que nao
 * grava cookie antes de o video tocar.
 */
export const YOUTUBE_ID = /^[\w-]{11}$/;

export function isYoutubeId(id: string | null | undefined): id is string {
  return !!id && YOUTUBE_ID.test(id);
}

/**
 * URL do player. `related: false` acrescenta `rel=0`, que limita as sugestoes
 * do fim do video ao mesmo canal — o YouTube nao deixa desligar de vez.
 */
export function youtubeEmbedUrl(id: string, options: { related?: boolean } = {}): string {
  const related = options.related ?? true;

  return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1${related ? '' : '&rel=0'}`;
}
