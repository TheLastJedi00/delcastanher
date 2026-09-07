import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'Informe um e-mail valido.' })
  email!: string;

  @IsString({ message: 'Informe a senha.' })
  @MinLength(6, { message: 'A senha precisa ter ao menos 6 caracteres.' })
  @MaxLength(128)
  password!: string;
}
