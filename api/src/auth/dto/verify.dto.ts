import { IsNotEmpty, IsString } from 'class-validator';

export class VerifyDto {
  @IsString()
  @IsNotEmpty({ message: 'idToken e obrigatorio.' })
  idToken!: string;
}
