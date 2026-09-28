import { Transform } from 'class-transformer';
import { IsEmail } from 'class-validator';

/**
 * Adicionar administrador pelo painel (Spec 021). O e-mail chega normalizado
 * ao servico, como no "Criar nova conta", para que `Fulana@Empresa.com ` e
 * `fulana@empresa.com` nao virem duas contas (decisao 9).
 */
export class AddAdminDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'Informe um e-mail valido.' })
  email!: string;
}
