import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AccountRequestResult, AuthSession, AuthUser } from './auth.types';
import { AccountDto } from './dto/account.dto';
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

  /**
   * Cria a conta (se ainda nao existir) e envia o e-mail com o link de
   * definicao de senha, que devolve o usuario ao login pela actionUrl.
   */
  @Post('account')
  @HttpCode(HttpStatus.ACCEPTED)
  requestAccount(@Body() dto: AccountDto): Promise<AccountRequestResult> {
    return this.authService.requestAccount(dto.email);
  }

  /** Reenvia o link de definicao de senha para uma conta ja existente. */
  @Post('password-reset')
  @HttpCode(HttpStatus.ACCEPTED)
  requestPasswordReset(@Body() dto: AccountDto): Promise<AccountRequestResult> {
    return this.authService.requestPasswordReset(dto.email);
  }

  /** Revalida um idToken ja emitido (usado na retomada de sessao pelo front). */
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  verify(@Body() dto: VerifyDto): Promise<AuthUser> {
    return this.authService.verify(dto.idToken);
  }
}
