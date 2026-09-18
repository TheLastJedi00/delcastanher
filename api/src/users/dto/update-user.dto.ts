import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { KNOWN_POLICY_VERSIONS, PolicyVersion } from '../policy-versions';

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

  /**
   * Aceite da Politica de Privacidade (Spec 015, decisao 7).
   *
   * Opcional no DTO porque a mesma rota atende a tela "Meu Perfil", onde nao
   * ha o que aceitar de novo. Quem decide se ele era exigido e o `UsersService`,
   * que sabe se esta requisicao **conclui** o onboarding ou apenas edita um
   * perfil ja concluido — distincao que o DTO nao tem como fazer sozinho.
   */
  @IsOptional()
  @IsBoolean({ message: 'O aceite da politica precisa ser verdadeiro ou falso.' })
  policyAccepted?: boolean;

  /**
   * Versao aceita. Exigida apenas quando ha aceite: registrar "aceitou" sem
   * dizer o que foi aceito nao registra nada.
   */
  @ValidateIf((dto: UpdateUserDto) => dto.policyAccepted === true)
  @IsIn(KNOWN_POLICY_VERSIONS, {
    message: 'Versao de politica desconhecida.',
  })
  policyVersion?: PolicyVersion;
}
