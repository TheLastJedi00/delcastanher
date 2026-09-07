import { Transform } from 'class-transformer';
import { IsEmail } from 'class-validator';

export class AccountDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'Informe um e-mail valido.' })
  email!: string;
}
