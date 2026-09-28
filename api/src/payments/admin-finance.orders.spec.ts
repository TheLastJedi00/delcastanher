import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { AdminFinanceService } from './admin-finance.service';
import { ListFinanceOrdersDto } from './dto/finance-query.dto';
import { GatewayFeesService } from './gateway-fees.service';

/** Pedido como a consulta da listagem o devolve, com comprador e itens. */
const PEDIDO = {
  id: 'ord-1',
  status: 'PAID',
  amountCents: 39800,
  method: 'CREDIT_CARD',
  installments: 3,
  mpOrderId: 'ORD-123',
  mpPaymentId: 'PAY-456',
  mpStatusDetail: 'accredited',
  createdAt: new Date('2026-09-10T12:00:00Z'),
  paidAt: new Date('2026-09-10T12:05:00Z'),
  refundedAt: null,
  user: { name: 'Ana Souza', email: 'ana@empresa.com' },
  items: [
    { titleSnapshot: 'Fundamentos' },
    { titleSnapshot: 'Pratica' },
  ],
};

function build(rows: unknown[] = [PEDIDO], total = 1) {
  const prisma = {
    order: {
      findMany: jest.fn().mockResolvedValue(rows),
      count: jest.fn().mockResolvedValue(total),
    },
  };

  return Test.createTestingModule({
    providers: [
      AdminFinanceService,
      { provide: PrismaService, useValue: prisma },
      { provide: GatewayFeesService, useValue: { ratesUntil: jest.fn().mockResolvedValue([]) } },
    ],
  })
    .compile()
    .then((moduleRef) => ({ service: moduleRef.get(AdminFinanceService), prisma }));
}

function query(patch: Partial<ListFinanceOrdersDto> = {}): ListFinanceOrdersDto {
  return Object.assign(new ListFinanceOrdersDto(), {
    page: 1,
    pageSize: 20,
    sort: 'data',
    direction: 'desc',
    from: '2026-09-01T03:00:00.000Z',
    to: '2026-10-01T03:00:00.000Z',
    ...patch,
  });
}

describe('AdminFinanceService — lista de pedidos', () => {
  /**
   * Spec 013, decisao 7: busca, filtro, ordenacao e paginacao sao do servidor.
   * Um `filter` sobre um array ja baixado significaria trazer o historico
   * financeiro inteiro para uma tela que mostra vinte linhas.
   */
  describe('paginacao, ordenacao e filtros (Task 4.1)', () => {
    it('pagina no servidor', async () => {
      const { service, prisma } = await build();

      await service.listOrders(query({ page: 3, pageSize: 10 }));

      expect(prisma.order.findMany.mock.calls[0][0]).toMatchObject({ skip: 20, take: 10 });
    });

    it('ordena pela coluna pedida, no banco', async () => {
      const { service, prisma } = await build();

      await service.listOrders(query({ sort: 'valor', direction: 'asc' }));

      expect(prisma.order.findMany.mock.calls[0][0].orderBy).toEqual({ amountCents: 'asc' });
    });

    it('filtra por periodo, situacao e metodo', async () => {
      const { service, prisma } = await build();

      await service.listOrders(query({ status: 'REFUNDED', method: 'PIX' }));

      const { where } = prisma.order.findMany.mock.calls[0][0];

      expect(where.status).toBe('REFUNDED');
      expect(where.method).toBe('PIX');
      expect(where.createdAt.gte).toEqual(new Date('2026-09-01T03:00:00.000Z'));
      expect(where.createdAt.lt).toEqual(new Date('2026-10-01T03:00:00.000Z'));
    });

    /**
     * E-mail do comprador, `mpOrderId` e `mpPaymentId`: sao esses tres que o
     * suporte tem em maos quando alguem liga.
     */
    it('busca por e-mail do comprador, mpOrderId e mpPaymentId', async () => {
      const { service, prisma } = await build();

      await service.listOrders(query({ search: 'PAY-456' }));

      const campos = prisma.order.findMany.mock.calls[0][0].where.OR.map(
        (clause: Record<string, unknown>) => Object.keys(clause)[0],
      );

      expect(campos).toEqual(['user', 'mpOrderId', 'mpPaymentId']);
    });

    it('usa a mesma clausula na contagem e na pagina', async () => {
      const { service, prisma } = await build();

      await service.listOrders(query({ status: 'PAID' }));

      expect(prisma.order.count.mock.calls[0][0].where).toEqual(
        prisma.order.findMany.mock.calls[0][0].where,
      );
    });

    it('devolve o total, a pagina e o tamanho da pagina', async () => {
      const { service } = await build([PEDIDO], 137);

      const result = await service.listOrders(query({ page: 2 }));

      expect(result).toMatchObject({ total: 137, page: 2, pageSize: 20 });
    });
  });

  describe('conteudo da linha (Task 4.2)', () => {
    it('traz situacao, valor em centavos, metodo, parcelas e modulos', async () => {
      const { service } = await build();

      const [item] = (await service.listOrders(query())).items;

      expect(item).toMatchObject({
        id: 'ord-1',
        status: 'PAID',
        amountCents: 39800,
        method: 'CREDIT_CARD',
        installments: 3,
        modules: ['Fundamentos', 'Pratica'],
      });
    });

    it('traz os ids do Mercado Pago, que e o que o suporte procura la', async () => {
      const { service } = await build();

      const [item] = (await service.listOrders(query())).items;

      expect(item.mpOrderId).toBe('ORD-123');
      expect(item.mpPaymentId).toBe('PAY-456');
    });

    it('traz o comprador pelo nome e pelo e-mail', async () => {
      const { service } = await build();

      const [item] = (await service.listOrders(query())).items;

      expect(item.buyerName).toBe('Ana Souza');
      expect(item.buyerEmail).toBe('ana@empresa.com');
    });

    /**
     * Decisao 17: numero, validade e CVV nunca chegaram a API (Spec 014,
     * decisao 8), e o CPF do pagador trafega para o gateway sem ser
     * persistido. O painel nao abre excecao — e nem teria de onde tirar o
     * dado.
     */
    it('nao traz nenhum dado de cartao nem CPF', async () => {
      const { service, prisma } = await build();

      const [item] = (await service.listOrders(query())).items;
      const campos = Object.keys(item).join(' ').toLowerCase();
      const selecionados = JSON.stringify(prisma.order.findMany.mock.calls[0][0].select ?? {});

      for (const proibido of ['card', 'cartao', 'cvv', 'document', 'cpf', 'token']) {
        expect(campos).not.toContain(proibido);
        expect(selecionados.toLowerCase()).not.toContain(proibido);
      }
    });

    it('devolve valor em centavos inteiros, e nunca formatado', async () => {
      const { service } = await build();

      const [item] = (await service.listOrders(query())).items;

      expect(item.amountCents).toBe(39800);
      expect(typeof item.amountCents).toBe('number');
    });
  });

  describe('exportacao em CSV (Task 4.4)', () => {
    it('repete o filtro corrente e sai sem paginacao', async () => {
      const { service, prisma } = await build();

      await service.exportOrdersCsv(query({ status: 'PAID', page: 3, pageSize: 10 }));

      const call = prisma.order.findMany.mock.calls[0][0];

      expect(call.where.status).toBe('PAID');
      expect(call.skip).toBeUndefined();
      expect(call.take).toBeUndefined();
    });

    /**
     * Ponto e virgula, e nao virgula: o Excel em pt-BR usa o separador de
     * lista do sistema, e com virgula a planilha inteira cai em uma coluna so.
     */
    it('usa ponto e virgula como separador', async () => {
      const { service } = await build();

      const csv = await service.exportOrdersCsv(query());

      expect(csv.split('\n')[0]).toContain(';');
      expect(csv.split('\n')[0].split(';').length).toBeGreaterThan(5);
    });

    it('cita o campo que contem o separador', async () => {
      const { service } = await build([
        { ...PEDIDO, items: [{ titleSnapshot: 'Modulo 1; parte 2' }] },
      ]);

      const csv = await service.exportOrdersCsv(query());

      expect(csv).toContain('"Modulo 1; parte 2"');
    });

    it('duplica as aspas do campo que ja as contem', async () => {
      const { service } = await build([
        { ...PEDIDO, user: { name: 'Ana "Aninha" Souza', email: 'ana@empresa.com' } },
      ]);

      const csv = await service.exportOrdersCsv(query());

      expect(csv).toContain('"Ana ""Aninha"" Souza"');
    });

    it('abre com o BOM de UTF-8, para o Excel nao quebrar o acento', async () => {
      const { service } = await build();

      const csv = await service.exportOrdersCsv(query());

      expect(csv.charCodeAt(0)).toBe(0xfeff);
    });

    // A planilha e o unico lugar onde um valor sai escrito, porque planilha e
    // para ser lida (decisao 2).
    it('escreve o valor com virgula decimal, e so ali', async () => {
      const { service } = await build();

      const csv = await service.exportOrdersCsv(query());

      expect(csv).toContain('398,00');
    });

    it('nao traz nenhuma coluna que a listagem nao traz', async () => {
      const { service } = await build();

      const [cabecalho] = (await service.exportOrdersCsv(query())).replace('﻿', '').split('\n');
      const colunas = cabecalho.toLowerCase();

      for (const proibido of ['cartao', 'cvv', 'cpf', 'documento']) {
        expect(colunas).not.toContain(proibido);
      }
    });
  });
});

/** Spec 019, decisao 14: pedido de pacote mostra pacote e lote. */
describe('AdminFinanceService — pedido de pacote', () => {
  const PACOTE = {
    ...PEDIDO,
    id: 'ord-b',
    amountCents: 59000,
    bundleTitleSnapshot: 'Pacote de Lançamento — Imersão RH Estratégico',
    tierNameSnapshot: 'Lote Fundador',
    items: Array.from({ length: 12 }, (_, index) => ({ titleSnapshot: `Módulo ${index + 1}` })),
  };

  it('a linha traz pacote e lote, e o pedido avulso traz nulo', async () => {
    const { service } = await build([PACOTE, PEDIDO], 2);

    const [pacote, avulso] = (await service.listOrders(query())).items;

    expect(pacote.bundle).toEqual({
      title: 'Pacote de Lançamento — Imersão RH Estratégico',
      tierName: 'Lote Fundador',
    });
    expect(avulso.bundle).toBeNull();
  });

  it('o valor continua sendo o do pedido inteiro, em centavos', async () => {
    const { service } = await build([PACOTE]);

    const [pacote] = (await service.listOrders(query())).items;

    expect(pacote.amountCents).toBe(59000);
  });

  it('o CSV ganha as colunas Pacote e Lote, preenchidas so no pedido de pacote', async () => {
    const { service } = await build([PACOTE, PEDIDO], 2);

    const [cabecalho, pacote, avulso] = (await service.exportOrdersCsv(query()))
      .replace('﻿', '')
      .split('\n');
    const colunas = cabecalho.split(';');
    const pacoteCol = colunas.indexOf('Pacote');
    const loteCol = colunas.indexOf('Lote');

    expect(pacoteCol).toBeGreaterThan(-1);
    expect(loteCol).toBeGreaterThan(-1);
    expect(pacote.split(';')[pacoteCol]).toBe('Pacote de Lançamento — Imersão RH Estratégico');
    expect(pacote.split(';')[loteCol]).toBe('Lote Fundador');
    expect(avulso.split(';')[pacoteCol]).toBe('');
  });
});
