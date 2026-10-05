import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';

/**
 * Criacao de um modulo. Nao recebe curso: a plataforma tem um curso unico
 * (Spec 008, decisao 5), e o `LessonsService` o resolve pelo slug do seed.
 */
export class CreateModuleDto {
  @IsString({ message: 'Informe o titulo do modulo.' })
  @MinLength(3, { message: 'O titulo do modulo precisa ter ao menos 3 caracteres.' })
  @MaxLength(160, { message: 'Titulo de modulo muito longo.' })
  title!: string;

  @IsString({ message: 'Informe o resumo do modulo.' })
  @MinLength(3, { message: 'O resumo do modulo precisa ter ao menos 3 caracteres.' })
  @MaxLength(500, { message: 'Resumo de modulo muito longo.' })
  summary!: string;
}

/** Edicao de um modulo; campo ausente e campo nao tocado. */
export class UpdateModuleDto {
  @IsOptional()
  @IsString({ message: 'Informe o titulo do modulo.' })
  @MinLength(3, { message: 'O titulo do modulo precisa ter ao menos 3 caracteres.' })
  @MaxLength(160, { message: 'Titulo de modulo muito longo.' })
  title?: string;

  @IsOptional()
  @IsString({ message: 'Informe o resumo do modulo.' })
  @MinLength(3, { message: 'O resumo do modulo precisa ter ao menos 3 caracteres.' })
  @MaxLength(500, { message: 'Resumo de modulo muito longo.' })
  summary?: string;
}

/**
 * Carga horaria do modulo (Spec 023, Parte D), com a mesma regra da carga do
 * curso (`UpdateCourseDto`): horas inteiras de 1 a 999, e **nulo volta para
 * "a definir"**.
 */
export class UpdateModuleWorkloadDto {
  @ValidateIf((_dto: UpdateModuleWorkloadDto, value: unknown) => value !== null)
  @IsInt({ message: 'Informe a carga horária em horas inteiras.' })
  @Min(1, { message: 'A carga horária precisa ser de pelo menos 1 hora.' })
  @Max(999, { message: 'A carga horária precisa ser de no máximo 999 horas.' })
  workloadHours!: number | null;
}
