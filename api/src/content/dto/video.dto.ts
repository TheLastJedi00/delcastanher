import { Type } from 'class-transformer';
import { IsInt, IsString, MaxLength, Min, MinLength } from 'class-validator';

/** Passo 1 do upload do video. */
export class VideoUploadUrlDto {
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

/** Passo 3: confirmacao que dispara a ingestao no Mux. */
export class ConfirmVideoDto {
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
}
