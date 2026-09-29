import { IsInt, Max, Min, ValidateIf } from 'class-validator';

/**
 * Edicao do curso pelo painel (Spec 022, decisao 12): **so** a carga horaria.
 * Com o `forbidNonWhitelisted`, mandar `title` e 400.
 */
export class UpdateCourseDto {
  /**
   * Horas inteiras, de 1 a 999. **Nulo volta para "a definir"**; ausente e
   * recusado, porque o corpo nao tem outro campo a mudar.
   */
  @ValidateIf((_dto: UpdateCourseDto, value: unknown) => value !== null)
  @IsInt({ message: 'Informe a carga horária em horas inteiras.' })
  @Min(1, { message: 'A carga horária precisa ser de pelo menos 1 hora.' })
  @Max(999, { message: 'A carga horária precisa ser de no máximo 999 horas.' })
  workloadHours!: number | null;
}
