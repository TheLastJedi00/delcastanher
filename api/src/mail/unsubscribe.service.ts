import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { apiPublicUrl, frontendUrl, unsubscribeSecret } from '../config/mail.config';
import { PrismaService } from '../prisma/prisma.service';
import { signUnsubscribeToken, verifyUnsubscribeToken } from './unsubscribe-token';

/** Os dois enderecos de descadastro de um aluno (decisao B5). */
export interface UnsubscribeLinks {
  /** Pagina do front, que pede confirmacao por botao. */
  pageUrl: string;
  /** `POST` de um clique, direto na API, para o `List-Unsubscribe`. */
  oneClickUrl: string;
}

/**
 * Descadastro das campanhas (Spec 023, decisao B5).
 *
 * Vale **so para campanha**: o e-mail da nota fiscal e documento da compra e
 * sai mesmo para quem se descadastrou (decisao A8).
 */
@Injectable()
export class UnsubscribeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Links que vao no rodape e nos cabecalhos do e-mail de campanha. */
  linksFor(userId: string): UnsubscribeLinks {
    const token = signUnsubscribeToken(userId, unsubscribeSecret(this.config));

    return {
      pageUrl: `${frontendUrl(this.config)}/descadastro?token=${token}`,
      oneClickUrl: `${apiPublicUrl(this.config)}/email/unsubscribe?token=${token}`,
    };
  }

  /**
   * Grava a oposicao. Repetir nao reescreve a data: ela registra quando a
   * pessoa se opos, e um segundo clique nao e uma nova oposicao.
   */
  async unsubscribe(token: string | undefined): Promise<void> {
    const userId = token ? verifyUnsubscribeToken(token, unsubscribeSecret(this.config)) : null;

    if (!userId) {
      throw new BadRequestException('Link de descadastro invalido.');
    }

    await this.prisma.user.updateMany({
      where: { id: userId, marketingOptOutAt: null },
      data: { marketingOptOutAt: new Date() },
    });
  }
}
