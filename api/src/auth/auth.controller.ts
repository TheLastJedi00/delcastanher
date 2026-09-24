import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Request, Response } from 'express';
import { REFRESH_COOKIE, clearRefreshCookieOptions, refreshCookieOptions } from '../config/auth-cookie.config';
import { AuthService } from './auth.service';
import { AccountRequestResult, AuthSession } from './auth.types';
import { AccountDto } from './dto/account.dto';
import { LoginDto } from './dto/login.dto';
import { TrustedOriginGuard } from './trusted-origin.guard';

@Controller('auth')
export class AuthController {
  /**
   * Lido no construtor, que roda no bootstrap: uma duracao invalida no painel
   * derruba a subida, e nao o primeiro login.
   */
  private readonly cookieOptions: CookieOptions;

  constructor(
    private readonly authService: AuthService,
    config: ConfigService,
  ) {
    this.cookieOptions = refreshCookieOptions(config);
  }

  /**
   * Valida as credenciais no Firebase e devolve a sessao do usuario. O refresh
   * token vai so no cookie HttpOnly, nunca no corpo (Spec 017, decisao 13).
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response): Promise<AuthSession> {
    const issued = await this.authService.login(dto.email, dto.password);

    res.cookie(REFRESH_COOKIE, issued.refreshToken, this.cookieOptions);

    return issued.session;
  }

  /**
   * Troca o cookie por um idToken novo e regrava o cookie, renovando o prazo.
   * Token recusado apaga o cookie; Firebase fora do ar o mantem (decisao 14).
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @UseGuards(TrustedOriginGuard)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<AuthSession> {
    const cookies = req.cookies as Record<string, string | undefined> | undefined;

    try {
      const issued = await this.authService.refresh(cookies?.[REFRESH_COOKIE]);

      res.cookie(REFRESH_COOKIE, issued.refreshToken, this.cookieOptions);

      return issued.session;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        res.clearCookie(REFRESH_COOKIE, clearRefreshCookieOptions());
      }

      throw error;
    }
  }

  /**
   * Apaga o cookie, que o JavaScript do front nao alcanca. Nao revoga o
   * refresh token no Firebase: isso encerraria todos os dispositivos (decisao 17).
   */
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(TrustedOriginGuard)
  logout(@Res({ passthrough: true }) res: Response): void {
    res.clearCookie(REFRESH_COOKIE, clearRefreshCookieOptions());
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
}
