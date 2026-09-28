import { IsInt, Min, ValidateIf } from 'class-validator';

/**
 * Edicao de um lote pelo painel (Spec 019, decisao 13): **so** preco e vagas.
 *
 * Nome e ordem ficam de fora de proposito — reordenar lote que ja vendeu
 * reescreveria a historia do que foi vendido. Com o `forbidNonWhitelisted` do
 * `main.ts`, mandar `name` ou `order` e 400, e nao um campo ignorado em
 * silencio.
 */
export class UpdateBundleTierDto {
  /** Centavos. Ausente = nao muda; nulo, zero ou negativo = recusado. */
  @ValidateIf((_dto: UpdateBundleTierDto, value: unknown) => value !== undefined)
  @IsInt({ message: 'Informe o preço em centavos.' })
  @Min(1, { message: 'O preço do lote precisa ser maior que zero.' })
  priceCents?: number;

  /**
   * Vagas do lote. Ausente = nao muda; **nulo = sem limite**, aceito so no
   * ultimo lote — a regra de ordem e do servico, que conhece os lotes.
   */
  @ValidateIf((_dto: UpdateBundleTierDto, value: unknown) => value !== undefined && value !== null)
  @IsInt({ message: 'Informe as vagas como número inteiro.' })
  @Min(0, { message: 'As vagas não podem ser negativas.' })
  capacity?: number | null;
}
