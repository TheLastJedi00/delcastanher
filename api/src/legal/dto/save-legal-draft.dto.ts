import { IsString, MaxLength } from 'class-validator';

/**
 * Rascunho de um documento legal (Spec 022). So o texto: o autor vem do token,
 * e com o `forbidNonWhitelisted` mandar `updatedByEmail` e 400.
 *
 * Vazio e aceito como rascunho — apagar tudo para recomecar e um estado de
 * edicao legitimo —, e e a publicacao que recusa texto vazio.
 */
export class SaveLegalDraftDto {
  @IsString({ message: 'Envie o texto do documento.' })
  // A Politica de Privacidade inteira tem uns 20 mil caracteres; o teto e uma
  // folga larga, e existe so para uma colagem acidental nao virar uma linha de
  // megabytes no banco.
  @MaxLength(200_000, { message: 'O texto deve ter no máximo 200 mil caracteres.' })
  content!: string;
}
