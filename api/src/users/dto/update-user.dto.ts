import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

/** Remove espacos das pontas; strings vazias viram `undefined`. */
const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || undefined : value;

/**
 * Payload do `PATCH /users/me`. Os tres campos obrigatorios sao exatamente os
 * exigidos pelo onboarding — a mesma tela que edita o perfil depois, por isso
 * um unico DTO atende os dois fluxos.
 */
export class UpdateUserDto {
  @Transform(trim)
  @IsString()
  @MaxLength(120, { message: 'O nome deve ter no maximo 120 caracteres.' })
  @IsNotEmpty({ message: 'Informe seu nome completo.' })
  name!: string;

  @Transform(trim)
  @IsString()
  @MaxLength(600, { message: 'A bio deve ter no maximo 600 caracteres.' })
  @IsNotEmpty({ message: 'Escreva uma bio.' })
  bio!: string;

  @Transform(trim)
  @IsString()
  @MaxLength(30, { message: 'O telefone deve ter no maximo 30 caracteres.' })
  @IsNotEmpty({ message: 'Informe um telefone.' })
  phone!: string;

  @Transform(trim)
  @IsOptional()
  @IsUrl({ require_protocol: false }, { message: 'Informe uma URL valida do LinkedIn.' })
  @MaxLength(200, { message: 'O link deve ter no maximo 200 caracteres.' })
  linkedin?: string;
}
