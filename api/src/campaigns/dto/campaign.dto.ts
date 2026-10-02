import { Transform } from 'class-transformer';
import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || undefined : value;

/**
 * Campanha do painel (Spec 023, decisoes B2 e B3). O segmento e so o **nome**:
 * nunca uma lista de e-mails nem um filtro livre. O corpo e texto simples.
 */
export class CampaignDraftDto {
  @IsIn(['ALL_ACTIVE', 'INACTIVE_7D', 'COMPLETED'], { message: 'Segmento invalido.' })
  segment!: 'ALL_ACTIVE' | 'INACTIVE_7D' | 'COMPLETED';

  @Transform(trim)
  @IsString({ message: 'Informe o assunto.' })
  @IsNotEmpty({ message: 'Informe o assunto.' })
  @MaxLength(150, { message: 'O assunto deve ter no maximo 150 caracteres.' })
  subject!: string;

  @Transform(trim)
  @IsString({ message: 'Escreva o corpo do e-mail.' })
  @IsNotEmpty({ message: 'Escreva o corpo do e-mail.' })
  @MaxLength(10000, { message: 'O corpo deve ter no maximo 10.000 caracteres.' })
  body!: string;
}
