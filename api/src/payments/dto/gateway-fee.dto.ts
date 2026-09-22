import { Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** Meios cobrados pela plataforma. A taxa e por metodo, e nao por parcela. */
export const FEE_METHODS = ['PIX', 'CREDIT_CARD'] as const;
export type FeeMethod = (typeof FEE_METHODS)[number];

/**
 * Cadastro de uma vigencia de taxa (Spec 016, decisoes 3, 4 e 7).
 *
 * Valor fora do conjunto e **recusado**, e nao trocado em silencio pelo
 * default, no mesmo criterio do `ListAdminUsersDto`: uma tela que manda um
 * metodo inexistente esta com defeito, e responder 200 com outro metodo
 * esconderia o defeito — aqui, dentro de um numero de dinheiro.
 *
 * `createdById` e `createdByEmail` **nao** estao aqui de proposito: a autoria
 * sai do token, e autoria que o cliente declara nao e autoria.
 */
export class CreateGatewayFeeDto {
  @IsIn(FEE_METHODS, { message: 'O metodo precisa ser PIX ou CREDIT_CARD.' })
  method!: FeeMethod;

  /**
   * Percentual em pontos-base: `499` e 4,99%. O teto e 10000 (100%) porque um
   * percentual maior que o proprio valor nao descreve taxa nenhuma — descreve
   * um erro de digitacao com duas casas a mais.
   */
  @Type(() => Number)
  @IsInt({ message: 'O percentual precisa ser um numero inteiro em pontos-base.' })
  @Min(0, { message: 'O percentual nao pode ser negativo.' })
  @Max(10000, { message: 'O percentual nao pode passar de 100% (10000 pontos-base).' })
  percentBasisPoints!: number;

  /** Parcela fixa por transacao, em centavos. Zero quando nao ha. */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'A parcela fixa precisa ser um numero inteiro de centavos.' })
  @Min(0, { message: 'A parcela fixa nao pode ser negativa.' })
  fixedCents: number = 0;

  /** Inicio da vigencia, inclusivo. */
  @IsISO8601({}, { message: 'A data de inicio precisa estar no formato ISO 8601.' })
  validFrom!: string;

  /** Por que mudou — "reajuste anunciado em 10/09", "correcao de digitacao". */
  @IsOptional()
  @IsString({ message: 'A observacao precisa ser texto.' })
  @MaxLength(240, { message: 'Observacao muito longa.' })
  note?: string;
}
