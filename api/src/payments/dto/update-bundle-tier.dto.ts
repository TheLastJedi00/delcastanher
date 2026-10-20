import { IsInt, Min, ValidateIf } from 'class-validator';

/**
 * Edicao do lote pelo painel: **so** o preco (Spec 019, decisao 13; Spec 027,
 * decisao 4).
 *
 * Nome e ordem ficam de fora de proposito — reordenar lote que ja vendeu
 * reescreveria a historia do que foi vendido. Vagas sairam na Spec 027: o
 * pacote tem preco unico, e uma capacidade recriaria a escassez e, esgotada,
 * tiraria o pacote da loja. Com o `forbidNonWhitelisted` do `main.ts`, mandar
 * `name`, `order` ou `capacity` e 400, e nao um campo ignorado em silencio.
 */
export class UpdateBundleTierDto {
  /** Centavos. Ausente = nao muda; nulo, zero ou negativo = recusado. */
  @ValidateIf((_dto: UpdateBundleTierDto, value: unknown) => value !== undefined)
  @IsInt({ message: 'Informe o preço em centavos.' })
  @Min(1, { message: 'O preço do lote precisa ser maior que zero.' })
  priceCents?: number;
}
