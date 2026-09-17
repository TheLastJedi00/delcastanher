import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { createHmac } from 'node:crypto';
import { MercadoPagoService } from './mercado-pago.service';
import { toOrderStatus } from './payments.types';

const ACCESS_TOKEN = 'APP_USR-token-de-teste';
const WEBHOOK_SECRET = 'segredo-do-webhook';

const CONFIG: Record<string, string> = {
  MP_ACCESS_TOKEN: ACCESS_TOKEN,
  MP_PUBLIC_KEY: 'APP_USR-public',
  MP_WEBHOOK_SECRET: WEBHOOK_SECRET,
  MP_STATEMENT_DESCRIPTOR: 'DELCASTANHER',
  MP_SANDBOX: 'true',
};

const PAYER = {
  email: 'aluno@delcastanher.com',
  firstName: 'Ana',
  lastName: 'Souza',
  document: '19119119100',
};

const ITEMS = [
  { moduleId: 'mod-1', title: 'Fundamentos de RH', priceCents: 19900 },
  { moduleId: 'mod-2', title: 'Pratica de RH', priceCents: 19900 },
];

/** Resposta de uma order de PIX, no formato da Orders API. */
const PIX_RESPONSE = {
  id: 'ORD01HRYFWNYRE1MR1E60MW3X0T2P',
  status: 'action_required',
  status_detail: 'waiting_transfer',
  transactions: {
    payments: [
      {
        id: 'PAY01HRYFXQ53Q3JPEC48MYWMR0TE',
        status: 'action_required',
        status_detail: 'waiting_transfer',
        payment_method: {
          id: 'pix',
          type: 'bank_transfer',
          ticket_url: 'https://www.mercadopago.com.br/sandbox/payments/1/ticket',
          qr_code: '00020126580014br.gov.bcb.pix...',
          qr_code_base64: 'iVBORw0KGgoAAAANSUhEUg...',
        },
      },
    ],
  },
};

/** Resposta de uma order de cartao aprovada. */
const CARD_RESPONSE = {
  id: 'ORD01JC1KVZ0WJY8Y4WA7MZAD5S2T',
  status: 'processed',
  status_detail: 'accredited',
  transactions: {
    payments: [
      {
        id: 'PAY01JC1KVZ0WJY8Y4WA7MZG3A8F2',
        status: 'processed',
        status_detail: 'accredited',
        payment_method: { id: 'master', type: 'credit_card', installments: 3 },
      },
    ],
  },
};

async function build(response: unknown = PIX_RESPONSE, ok = true) {
  const fetchMock = jest.fn().mockResolvedValue({
    ok,
    status: ok ? 201 : 400,
    json: async () => response,
    text: async () => JSON.stringify(response),
  });

  global.fetch = fetchMock as unknown as typeof fetch;

  const moduleRef = await Test.createTestingModule({
    providers: [
      MercadoPagoService,
      { provide: ConfigService, useValue: { get: (key: string) => CONFIG[key] } },
    ],
  }).compile();

  return { service: moduleRef.get(MercadoPagoService), fetchMock };
}

/** Corpo enviado na ultima chamada, ja desserializado. */
function bodyOf(fetchMock: jest.Mock) {
  return JSON.parse(fetchMock.mock.calls[0][1].body as string);
}

function headersOf(fetchMock: jest.Mock): Record<string, string> {
  return fetchMock.mock.calls[0][1].headers as Record<string, string>;
}

describe('MercadoPagoService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('createOrder — PIX', () => {
    it('cria a order em modo automatico no endpoint da Orders API', async () => {
      const { service, fetchMock } = await build();

      await service.createOrder({
        orderId: 'ord-1',
        amountCents: 39800,
        method: 'PIX',
        payer: PAYER,
        items: ITEMS,
      });

      expect(fetchMock.mock.calls[0][0]).toBe('https://api.mercadopago.com/v1/orders');
      expect(bodyOf(fetchMock)).toMatchObject({
        type: 'online',
        processing_mode: 'automatic',
        external_reference: 'ord-1',
        total_amount: '398.00',
      });
    });

    // Decisao 10: 30 minutos e o minimo aceito pelo Mercado Pago. O padrao dele
    // seria 24 horas, que deixaria a loja cheia de pendencia eterna.
    it('envia o meio pix com validade de 30 minutos', async () => {
      const { service, fetchMock } = await build();

      await service.createOrder({
        orderId: 'ord-1',
        amountCents: 19900,
        method: 'PIX',
        payer: PAYER,
        items: [ITEMS[0]],
      });

      const payment = bodyOf(fetchMock).transactions.payments[0];

      expect(payment.payment_method).toMatchObject({ id: 'pix', type: 'bank_transfer' });
      expect(payment.expiration_time).toBe('PT30M');
    });

    it('devolve o QR Code e o codigo copia e cola para a tela cobrar', async () => {
      const { service } = await build();

      const order = await service.createOrder({
        orderId: 'ord-1',
        amountCents: 19900,
        method: 'PIX',
        payer: PAYER,
        items: [ITEMS[0]],
      });

      expect(order.pix).toEqual({
        qrCode: '00020126580014br.gov.bcb.pix...',
        qrCodeBase64: 'iVBORw0KGgoAAAANSUhEUg...',
        ticketUrl: 'https://www.mercadopago.com.br/sandbox/payments/1/ticket',
      });
      expect(order.id).toBe('ORD01HRYFWNYRE1MR1E60MW3X0T2P');
      expect(order.paymentId).toBe('PAY01HRYFXQ53Q3JPEC48MYWMR0TE');
    });
  });

  describe('createOrder — cartao', () => {
    it('envia token, bandeira, parcelas e descritor de fatura', async () => {
      const { service, fetchMock } = await build(CARD_RESPONSE);

      await service.createOrder({
        orderId: 'ord-2',
        amountCents: 39800,
        method: 'CREDIT_CARD',
        payer: PAYER,
        items: ITEMS,
        card: { token: 'tok-123', paymentMethodId: 'master', installments: 3 },
      });

      const payment = bodyOf(fetchMock).transactions.payments[0];

      expect(payment.payment_method).toEqual({
        id: 'master',
        type: 'credit_card',
        token: 'tok-123',
        installments: 3,
        statement_descriptor: 'DELCASTANHER',
      });
      // PIX tem validade; cartao processa na hora e nao pode herdar expiracao.
      expect(payment.expiration_time).toBeUndefined();
    });

    // Checklist de qualidade, item 10: o device id sobe como header na Orders
    // API, e nao como campo de corpo — a diferenca custa uma tarde a quem segue
    // exemplo da API de Pagamentos.
    it('envia o device id no header X-meli-session-id', async () => {
      const { service, fetchMock } = await build(CARD_RESPONSE);

      await service.createOrder({
        orderId: 'ord-2',
        amountCents: 19900,
        method: 'CREDIT_CARD',
        payer: PAYER,
        items: [ITEMS[0]],
        card: { token: 'tok-123', paymentMethodId: 'master', installments: 1 },
        deviceId: 'dev-abc',
      });

      expect(headersOf(fetchMock)['X-meli-session-id']).toBe('dev-abc');
    });

    it('nao inventa header de device id quando o navegador nao mandou um', async () => {
      const { service, fetchMock } = await build(CARD_RESPONSE);

      await service.createOrder({
        orderId: 'ord-2',
        amountCents: 19900,
        method: 'CREDIT_CARD',
        payer: PAYER,
        items: [ITEMS[0]],
        card: { token: 'tok-123', paymentMethodId: 'master', installments: 1 },
      });

      expect(headersOf(fetchMock)['X-meli-session-id']).toBeUndefined();
    });
  });

  describe('campos do checklist de qualidade', () => {
    it('manda o pagador completo, com CPF', async () => {
      const { service, fetchMock } = await build();

      await service.createOrder({
        orderId: 'ord-1',
        amountCents: 19900,
        method: 'PIX',
        payer: PAYER,
        items: [ITEMS[0]],
      });

      expect(bodyOf(fetchMock).payer).toEqual({
        email: 'aluno@delcastanher.com',
        first_name: 'Ana',
        last_name: 'Souza',
        identification: { type: 'CPF', number: '19119119100' },
      });
    });

    it('manda um item por modulo, com descricao e o id interno para conciliar', async () => {
      const { service, fetchMock } = await build();

      await service.createOrder({
        orderId: 'ord-1',
        amountCents: 39800,
        method: 'PIX',
        payer: PAYER,
        items: ITEMS,
      });

      expect(bodyOf(fetchMock).items).toHaveLength(2);
      expect(bodyOf(fetchMock).items[0]).toMatchObject({
        title: 'Fundamentos de RH',
        quantity: 1,
        unit_price: '199.00',
        external_code: 'mod-1',
      });
      expect(bodyOf(fetchMock).items[0].description).toBeTruthy();
    });

    // Decisao 13: retentativa de rede nao pode virar cobranca dobrada.
    it('usa o id do pedido como chave de idempotencia', async () => {
      const { service, fetchMock } = await build();

      await service.createOrder({
        orderId: 'ord-1',
        amountCents: 19900,
        method: 'PIX',
        payer: PAYER,
        items: [ITEMS[0]],
      });

      expect(headersOf(fetchMock)['X-Idempotency-Key']).toBe('ord-1');
      expect(headersOf(fetchMock)['Authorization']).toBe(`Bearer ${ACCESS_TOKEN}`);
    });
  });

  describe('getOrder', () => {
    it('consulta a order pelo id e traduz o desfecho', async () => {
      const { service, fetchMock } = await build(CARD_RESPONSE);

      const order = await service.getOrder('ORD01JC1KVZ0WJY8Y4WA7MZAD5S2T');

      expect(fetchMock.mock.calls[0][0]).toBe(
        'https://api.mercadopago.com/v1/orders/ORD01JC1KVZ0WJY8Y4WA7MZAD5S2T',
      );
      expect(order.status).toBe('processed');
      expect(order.statusDetail).toBe('accredited');
    });

    it('propaga a falha do gateway em vez de fingir pendencia', async () => {
      const { service } = await build({ message: 'nao encontrada' }, false);

      await expect(service.getOrder('ORD-inexistente')).rejects.toBeDefined();
    });
  });

  /**
   * Decisao 12: o webhook e rota publica; o que separa uma notificacao do
   * Mercado Pago de um POST qualquer da internet e esta assinatura.
   */
  describe('verifyWebhookSignature', () => {
    function signatureFor(dataId: string, requestId: string, ts: string, secret = WEBHOOK_SECRET) {
      const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;

      return `ts=${ts},v1=${createHmac('sha256', secret).update(manifest).digest('hex')}`;
    }

    const NOW_SECONDS = Math.floor(Date.now() / 1000).toString();

    it('aceita a assinatura valida', async () => {
      const { service } = await build();

      expect(
        service.verifyWebhookSignature({
          signature: signatureFor('ORD-1', 'req-1', NOW_SECONDS),
          requestId: 'req-1',
          dataId: 'ORD-1',
        }),
      ).toBe(true);
    });

    it('recusa assinatura feita com outro segredo', async () => {
      const { service } = await build();

      expect(
        service.verifyWebhookSignature({
          signature: signatureFor('ORD-1', 'req-1', NOW_SECONDS, 'segredo-errado'),
          requestId: 'req-1',
          dataId: 'ORD-1',
        }),
      ).toBe(false);
    });

    // Sem amarrar o id, uma assinatura valida de uma order poderia ser
    // reaproveitada para dizer que outra foi paga.
    it('recusa assinatura valida de outra order', async () => {
      const { service } = await build();

      expect(
        service.verifyWebhookSignature({
          signature: signatureFor('ORD-1', 'req-1', NOW_SECONDS),
          requestId: 'req-1',
          dataId: 'ORD-2',
        }),
      ).toBe(false);
    });

    it('recusa header ausente ou malformado', async () => {
      const { service } = await build();

      expect(
        service.verifyWebhookSignature({ signature: '', requestId: 'req-1', dataId: 'ORD-1' }),
      ).toBe(false);
      expect(
        service.verifyWebhookSignature({
          signature: 'v1=sem-timestamp',
          requestId: 'req-1',
          dataId: 'ORD-1',
        }),
      ).toBe(false);
    });

    // Sem janela, uma notificacao capturada hoje valeria para sempre.
    it('recusa timestamp fora da janela de tolerancia', async () => {
      const { service } = await build();
      const old = (Math.floor(Date.now() / 1000) - 60 * 60).toString();

      expect(
        service.verifyWebhookSignature({
          signature: signatureFor('ORD-1', 'req-1', old),
          requestId: 'req-1',
          dataId: 'ORD-1',
        }),
      ).toBe(false);
    });
  });
});

/**
 * Task 3.5: a traducao de status. Ela e a fronteira entre o vocabulario do
 * Mercado Pago e o desta plataforma, e mora em um lugar so (decisao 7).
 */
describe('toOrderStatus', () => {
  it.each([
    ['created', 'PENDING'],
    ['processing', 'PENDING'],
    ['action_required', 'PENDING'],
    ['processed', 'PAID'],
    ['failed', 'REJECTED'],
    ['canceled', 'CANCELLED'],
    ['expired', 'EXPIRED'],
    ['refunded', 'REFUNDED'],
    ['charged_back', 'REFUNDED'],
  ])('traduz %s para %s', (mpStatus, expected) => {
    expect(toOrderStatus(mpStatus)).toBe(expected);
  });

  // O conjunto de status do gateway pode crescer sem aviso. Cair em PAID por
  // omissao liberaria conteudo de graca; cair em PENDING apenas adia.
  it('trata status desconhecido como pendente, e nunca como pago', () => {
    expect(toOrderStatus('status_que_ainda_nao_existe')).toBe('PENDING');
    expect(toOrderStatus(null)).toBe('PENDING');
  });
});
