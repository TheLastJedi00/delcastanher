import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { CertificatesService } from './certificates.service';
import type { CertificateVerification, StudentCertificate } from './certificates.types';

/**
 * Certificado do aluno e verificacao publica.
 *
 * O guard e aplicado por rota, e nao na classe inteira como em `users` e
 * `progress`: a verificacao precisa atender um recrutador que nao tem conta, e
 * deixar isso explicito por metodo evita que a excecao passe despercebida.
 */
@Controller('certificates')
export class CertificatesController {
  constructor(private readonly certificates: CertificatesService) {}

  /** Certificado do proprio aluno, ou `null` se ainda nao foi emitido. */
  @Get('me')
  @UseGuards(FirebaseAuthGuard)
  me(@CurrentUser() user: AuthUser): Promise<StudentCertificate | null> {
    return this.certificates.findForUser(user);
  }

  /** Emite o diploma do curso concluido. Chamar de novo devolve o mesmo. */
  @Post('me')
  @UseGuards(FirebaseAuthGuard)
  issue(@CurrentUser() user: AuthUser): Promise<StudentCertificate> {
    return this.certificates.issueForUser(user);
  }

  /**
   * Rota publica do portal de validacao: sem guard, de proposito. Devolve
   * apenas o que o diploma ja mostra — nunca contato do aluno.
   */
  @Get('verify/:code')
  verify(@Param('code') code: string): Promise<CertificateVerification> {
    return this.certificates.verify(code);
  }
}
