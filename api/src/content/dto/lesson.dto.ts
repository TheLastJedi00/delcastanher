import { ArrayMinSize, IsArray, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** Criacao de uma aula. A ordem nao vem do cliente: ela nasce no fim da lista. */
export class CreateLessonDto {
  @IsString({ message: 'Informe o titulo da aula.' })
  @MinLength(3, { message: 'O titulo da aula precisa ter ao menos 3 caracteres.' })
  @MaxLength(160, { message: 'Titulo de aula muito longo.' })
  title!: string;

  @IsString({ message: 'Informe o resumo da aula.' })
  @MinLength(3, { message: 'O resumo da aula precisa ter ao menos 3 caracteres.' })
  @MaxLength(500, { message: 'Resumo de aula muito longo.' })
  summary!: string;
}

/**
 * Edicao de uma aula. Os dois campos sao opcionais para que renomear nao
 * obrigue a reenviar o resumo — campo ausente e campo nao tocado.
 */
export class UpdateLessonDto {
  @IsOptional()
  @IsString({ message: 'Informe o titulo da aula.' })
  @MinLength(3, { message: 'O titulo da aula precisa ter ao menos 3 caracteres.' })
  @MaxLength(160, { message: 'Titulo de aula muito longo.' })
  title?: string;

  @IsOptional()
  @IsString({ message: 'Informe o resumo da aula.' })
  @MinLength(3, { message: 'O resumo da aula precisa ter ao menos 3 caracteres.' })
  @MaxLength(500, { message: 'Resumo de aula muito longo.' })
  summary?: string;
}

/**
 * Reordenacao: a **lista completa** de ids na ordem desejada (decisao 17).
 * Mandar um par "id, nova posicao" faria a tela reordenar item por item, e
 * cada passo intermediario bateria no indice unico de ordem.
 */
export class ReorderDto {
  @IsArray({ message: 'Envie a lista de ids na ordem desejada.' })
  @ArrayMinSize(1, { message: 'Envie a lista de ids na ordem desejada.' })
  @IsString({ each: true, message: 'Cada id precisa ser texto.' })
  ids!: string[];
}
