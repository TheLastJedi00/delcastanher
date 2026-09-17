import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * Preco do modulo, em centavos (Spec 014, decisao 1).
 *
 * `null` e aceito e significa **"volta a ser a definir"**: o modulo sai da
 * venda e volta a aparecer como "em breve". E o mesmo vocabulario de
 * `Course.workloadHours` — nulo e "nao sei", e nao "zero".
 */
export class UpdateModulePriceDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'O preco precisa ser um numero inteiro de centavos.' })
  @Min(1, { message: 'O preco precisa ser maior que zero.' })
  // Teto de sanidade: R$ 1.000.000,00. Um zero a mais digitado por engano
  // cobraria de verdade.
  @Max(100_000_000, { message: 'Preco acima do limite permitido.' })
  priceCents!: number | null;
}

/** Cortesia: qual modulo liberar para o aluno (decisao 20). */
export class GrantAccessDto {
  @IsString({ message: 'Informe o modulo.' })
  @IsNotEmpty({ message: 'Informe o modulo.' })
  moduleId!: string;
}
