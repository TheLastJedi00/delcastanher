import { Injectable } from '@nestjs/common';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

/** Preco do modulo de teste, decidido no servidor (Spec 030, decisao 2). */
export const TEST_PAYMENT_CENTS = 100;

/** O que a pagina do link secreto mostra. */
export interface TestProduct {
  title: string;
  summary: string;
  priceCents: number;
}

/** Estado do modulo de teste, como o painel o mostra. */
export interface PaymentTestStatus {
  enabled: boolean;
  priceCents: number;
  accessKey: string | null;
  enabledAt: Date | null;
}

const SETTINGS_ID = 'default';

const TEST_PRODUCT: TestProduct = {
  title: 'Módulo de teste',
  summary:
    'Este módulo existe para testar o pagamento. Ele não libera aulas, e o valor pode ser estornado pelo Mercado Pago.',
  priceCents: TEST_PAYMENT_CENTS,
};

/**
 * Modulo de teste de pagamento (Spec 030).
 *
 * O admin liga no financeiro, e a plataforma gera a chave do link secreto
 * (`/loja/teste/<chave>`). Desligar apaga a chave, e religar gera outra: um
 * link antigo nunca volta a valer (decisao 3).
 *
 * A chave fica em texto no banco: o admin precisa copiar o link a qualquer
 * momento, e o que ela protege e uma compra de R$ 1,00 que nao libera nada.
 * Ela nunca sai em log.
 */
@Injectable()
export class PaymentTestService {
  constructor(private readonly prisma: PrismaService) {}

  async status(): Promise<PaymentTestStatus> {
    const row = await this.prisma.paymentTestSettings.findUnique({ where: { id: SETTINGS_ID } });

    return this.toStatus(row);
  }

  async setEnabled(enabled: boolean, adminUid: string): Promise<PaymentTestStatus> {
    const current = await this.prisma.paymentTestSettings.findUnique({ where: { id: SETTINGS_ID } });

    // Ligar o que ja esta ligado mantem o link que o admin ja copiou.
    if (enabled && current?.enabled && current.accessKey) {
      return this.toStatus(current);
    }

    const data = enabled
      ? {
          enabled: true,
          accessKey: randomBytes(32).toString('base64url'),
          enabledAt: new Date(),
          enabledById: adminUid,
        }
      : { enabled: false, accessKey: null };

    const row = await this.prisma.paymentTestSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, enabledAt: null, enabledById: null, ...data },
      update: data,
    });

    return this.toStatus(row);
  }

  /**
   * O produto de teste quando a chave confere e o teste esta ligado; nulo em
   * qualquer outro caso, sem dizer qual (decisao 4).
   */
  async resolve(key: string): Promise<TestProduct | null> {
    const row = await this.prisma.paymentTestSettings.findUnique({ where: { id: SETTINGS_ID } });

    if (!row?.enabled || !row.accessKey || !this.sameKey(row.accessKey, key)) {
      return null;
    }

    return { ...TEST_PRODUCT };
  }

  /** Comparacao em tempo constante; tamanhos diferentes ja sao divergencia. */
  private sameKey(expected: string, received: string): boolean {
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(received ?? '', 'utf8');

    return a.length === b.length && timingSafeEqual(a, b);
  }

  private toStatus(
    row: { enabled: boolean; accessKey: string | null; enabledAt: Date | null } | null,
  ): PaymentTestStatus {
    return {
      enabled: row?.enabled ?? false,
      priceCents: TEST_PAYMENT_CENTS,
      accessKey: row?.enabled ? row.accessKey : null,
      enabledAt: row?.enabled ? row.enabledAt : null,
    };
  }
}
