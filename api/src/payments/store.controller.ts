import { Controller, Get, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import {
  mercadoPagoPublicKey,
  mercadoPagoSandbox,
  paymentsEnabled,
} from '../config/payments.config';
import { MAX_INSTALLMENTS } from './dto/create-order.dto';
import { StoreModuleItem, StoreService } from './store.service';

/** Configuracao que o navegador precisa para tokenizar o cartao. */
export interface PaymentConfigView {
  /** Chave publica do Mercado Pago. Publica por natureza (decisao 16). */
  publicKey: string | null;
  /** Verdadeiro em ambiente de teste: a tela avisa que a cobranca e simulada. */
  sandbox: boolean;
  /** Falso quando a loja esta sem credencial configurada. */
  enabled: boolean;
  /** Teto de parcelas da plataforma (decisao 9). */
  maxInstallments: number;
}

/**
 * Loja de modulos (Spec 014). Exige sessao e onboarding — comprar e um ato de
 * quem ja tem conta (decisao 21).
 */
@Controller('store')
@UseGuards(FirebaseAuthGuard)
export class StoreController {
  constructor(
    private readonly store: StoreService,
    private readonly config: ConfigService,
  ) {}

  /** Catalogo com preco e o que este aluno ja tem. */
  @Get('catalog')
  catalog(@CurrentUser() user: AuthUser): Promise<StoreModuleItem[]> {
    return this.store.catalog(user);
  }

  /**
   * Chave publica e ambiente.
   *
   * Poderia ser variavel de build do `front/`, mas entao alternar sandbox e
   * producao exigiria dois deploys coordenados. Vindo daqui, o ambiente e
   * decidido em um lugar so (decisao 16). O access token **nunca** sai por
   * aqui.
   */
  @Get('payment-config')
  paymentConfig(): PaymentConfigView {
    const enabled = paymentsEnabled(this.config);

    return {
      publicKey: enabled ? mercadoPagoPublicKey(this.config) : null,
      sandbox: mercadoPagoSandbox(this.config),
      enabled,
      maxInstallments: MAX_INSTALLMENTS,
    };
  }
}
