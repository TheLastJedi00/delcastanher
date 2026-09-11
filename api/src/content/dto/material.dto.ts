import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

/**
 * Passo 1 do upload de um material. O tipo e o tamanho sao validados de novo
 * no `StorageService`, contra as listas do bucket — aqui e so o formato.
 */
export class MaterialUploadUrlDto {
  @IsString({ message: 'Informe o nome do arquivo.' })
  @MinLength(1, { message: 'Informe o nome do arquivo.' })
  @MaxLength(200, { message: 'Nome de arquivo muito longo.' })
  fileName!: string;

  @IsString({ message: 'Informe o tipo do arquivo.' })
  @MinLength(1, { message: 'Informe o tipo do arquivo.' })
  contentType!: string;

  @Type(() => Number)
  @IsInt({ message: 'Informe o tamanho do arquivo em bytes.' })
  @Min(1, { message: 'Informe o tamanho do arquivo em bytes.' })
  sizeBytes!: number;
}

/** Passo 3: confirmacao de que o `PUT` no bucket terminou. */
export class ConfirmMaterialDto {
  @IsString({ message: 'Informe o caminho do arquivo enviado.' })
  @MinLength(1, { message: 'Informe o caminho do arquivo enviado.' })
  storagePath!: string;

  @IsString({ message: 'Informe o nome do arquivo.' })
  @MinLength(1, { message: 'Informe o nome do arquivo.' })
  @MaxLength(200, { message: 'Nome de arquivo muito longo.' })
  fileName!: string;

  @IsString({ message: 'Informe o tipo do arquivo.' })
  @MinLength(1, { message: 'Informe o tipo do arquivo.' })
  contentType!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'A ordem precisa ser um numero inteiro.' })
  @Min(0, { message: 'A ordem precisa ser zero ou mais.' })
  order?: number;
}
