import { Controller, Delete, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ConnectionView, MercadoPagoConnectionService } from './mercado-pago-connection.service';
import { ConnectionLink, MercadoPagoLinkService } from './mercado-pago-link.service';

/**
 * Conta recebedora no painel (Spec 020, decisao 12).
 *
 * Guards na classe, como em todo controller administrativo (Spec 010, decisao
 * 13). Nenhuma resposta daqui leva token: a visao da conexao nao o carrega, e
 * o link devolve so a URL publica do Mercado Pago.
 */
@Controller('admin/mercadopago/connection')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles('admin')
export class AdminMercadoPagoController {
  constructor(
    private readonly connections: MercadoPagoConnectionService,
    private readonly links: MercadoPagoLinkService,
  ) {}

  /** Conexao deste ambiente. */
  @Get()
  view(): Promise<ConnectionView> {
    return this.connections.view();
  }

  /** Link de autorizacao, com o admin da sessao como autor. */
  @Post('link')
  createLink(@CurrentUser() user: AuthUser): Promise<ConnectionLink> {
    return this.links.createLink({ id: user.uid, email: user.email });
  }

  /** Desconecta; a loja fecha ate outra conta ser conectada (decisao 7). */
  @Delete()
  @HttpCode(200)
  async disconnect(): Promise<ConnectionView> {
    await this.connections.disconnect();

    return this.connections.view();
  }
}
