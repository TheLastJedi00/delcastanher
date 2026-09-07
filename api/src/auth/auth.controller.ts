import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthSession, AuthUser } from './auth.types';
import { LoginDto } from './dto/login.dto';
import { VerifyDto } from './dto/verify.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /** Valida as credenciais no Firebase e devolve a sessao do usuario. */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto): Promise<AuthSession> {
    return this.authService.login(dto.email, dto.password);
  }

  /** Revalida um idToken ja emitido (usado na retomada de sessao pelo front). */
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  verify(@Body() dto: VerifyDto): Promise<AuthUser> {
    return this.authService.verify(dto.idToken);
  }
}
