import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { AdminFinanceService, FinanceSummary } from './admin-finance.service';

const RESUMO: FinanceSummary = {
  period: { from: '2026-09-01T03:00:00.000Z', to: '2026-10-01T03:00:00.000Z' },
  granularity: 'day',
  totals: {
    grossCents: 39800,
    refundedCents: 0,
    feeCents: 394,
    netCents: 39406,
    averageTicketCents: 19900,
    paidOrders: 2,
    pendingOrders: 1,
    rejectedOrders: 0,
    refundedOrders: 0,
    uncoveredOrders: 0,
    uncoveredFrom: null,
    uncoveredTo: null,
    undatedRefunds: 0,
    undatedRefundsCents: 0,
    conversionRate: 67,
    buyers: 2,
    attempts: 3,
  },
  previous: null,
  byMethod: [],
  byModule: [],
  courtesy: [],
  series: [{ bucket: '2026-09-10', grossCents: 39800, refundedCents: 0, paidOrders: 2 }],
  engagement: { buyers: 2, studied: 1, neverOpened: 1, rate: 50 },
  empty: false,
};

describe('AdminFinanceService', () => {
  let service: AdminFinanceService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(AdminFinanceService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    service.clear();
  });

  describe('resumo', () => {
    it('monta os query params a partir do filtro corrente', () => {
      service
        .setQuery({
          from: '2026-09-01T03:00:00.000Z',
          to: '2026-10-01T03:00:00.000Z',
          granularity: 'month',
        })
        .subscribe();

      const request = http.expectOne(
        req => req.url === `${environment.apiUrl}/admin/finance/summary`,
      );

      expect(request.request.params.get('from')).toBe('2026-09-01T03:00:00.000Z');
      expect(request.request.params.get('to')).toBe('2026-10-01T03:00:00.000Z');
      expect(request.request.params.get('granularity')).toBe('month');

      request.flush(RESUMO);
    });

    it('guarda o resumo e expoe os indicadores', () => {
      service.load().subscribe();

      http
        .expectOne(req => req.url === `${environment.apiUrl}/admin/finance/summary`)
        .flush(RESUMO);

      expect(service.totals()?.grossCents).toBe(39800);
      expect(service.series().length).toBe(1);
      expect(service.empty()).toBeFalse();
    });

    /**
     * Decisao 5: nulo e "nao apurado", e nunca zero. A tela precisa de um
     * estado proprio, e nao de um numero que parece certo.
     */
    it('marca o liquido como nao apurado quando a API devolve taxa nula', () => {
      service.load().subscribe();

      http.expectOne(req => req.url === `${environment.apiUrl}/admin/finance/summary`).flush({
        ...RESUMO,
        totals: { ...RESUMO.totals, feeCents: null, netCents: null, uncoveredOrders: 3 },
      });

      expect(service.unassessedNet()).toBeTrue();
      expect(service.totals()?.netCents).toBeNull();
    });

    it('nao marca como nao apurado o liquido que veio calculado', () => {
      service.load().subscribe();

      http
        .expectOne(req => req.url === `${environment.apiUrl}/admin/finance/summary`)
        .flush(RESUMO);

      expect(service.unassessedNet()).toBeFalse();
    });

    // Decisao 15: a ausencia de pedido e uma afirmacao diferente de zero.
    it('distingue periodo vazio de periodo com numeros zerados', () => {
      service.load().subscribe();

      http.expectOne(req => req.url === `${environment.apiUrl}/admin/finance/summary`).flush({
        ...RESUMO,
        empty: true,
        totals: { ...RESUMO.totals, grossCents: 0, paidOrders: 0 },
      });

      expect(service.empty()).toBeTrue();
    });

    it('traduz o erro no padrao do servico existente', () => {
      let mensagem = '';

      service.load().subscribe({ error: (message: string) => (mensagem = message) });

      http
        .expectOne(req => req.url === `${environment.apiUrl}/admin/finance/summary`)
        .flush({ message: 'Periodo invalido.' }, { status: 400, statusText: 'Bad Request' });

      expect(mensagem).toBe('Periodo invalido.');
      expect(service.error()).toBe('Periodo invalido.');
    });

    it('traduz o 403 como area restrita', () => {
      let mensagem = '';

      service.load().subscribe({ error: (message: string) => (mensagem = message) });

      http
        .expectOne(req => req.url === `${environment.apiUrl}/admin/finance/summary`)
        .flush({}, { status: 403, statusText: 'Forbidden' });

      expect(mensagem).toBe('Esta área é restrita a administradores.');
    });
  });

  describe('lista de pedidos', () => {
    it('herda o periodo do resumo e manda so os filtros preenchidos', () => {
      service.setQuery({ from: '2026-09-01T03:00:00.000Z', to: '2026-10-01T03:00:00.000Z' }).subscribe();
      http
        .expectOne(req => req.url === `${environment.apiUrl}/admin/finance/summary`)
        .flush(RESUMO);

      service.setOrdersQuery({ search: ' PAY-1 ', status: 'PAID' }).subscribe();

      const request = http.expectOne(
        req => req.url === `${environment.apiUrl}/admin/finance/orders`,
      );

      expect(request.request.params.get('from')).toBe('2026-09-01T03:00:00.000Z');
      expect(request.request.params.get('search')).toBe('PAY-1');
      expect(request.request.params.get('status')).toBe('PAID');
      expect(request.request.params.get('method')).toBeNull();

      request.flush({ items: [], total: 0, page: 1, pageSize: 20 });
    });

    it('volta para a primeira pagina quando o filtro muda', () => {
      service.setOrdersQuery({ page: 4 }).subscribe();
      http
        .expectOne(req => req.url === `${environment.apiUrl}/admin/finance/orders`)
        .flush({ items: [], total: 0, page: 4, pageSize: 20 });

      service.setOrdersQuery({ search: 'ana' }).subscribe();

      const request = http.expectOne(
        req => req.url === `${environment.apiUrl}/admin/finance/orders`,
      );

      expect(request.request.params.get('page')).toBe('1');

      request.flush({ items: [], total: 0, page: 1, pageSize: 20 });
    });
  });

  describe('taxas do gateway', () => {
    it('carrega o historico com autor e data', () => {
      service.loadFees().subscribe();

      http.expectOne(`${environment.apiUrl}/admin/finance/fees`).flush({
        current: { PIX: null, CREDIT_CARD: null },
        history: [
          {
            id: 'fee-1',
            method: 'PIX',
            percentBasisPoints: 99,
            fixedCents: 0,
            validFrom: '2026-01-01T00:00:00.000Z',
            validTo: null,
            createdById: 'uid-admin',
            createdByEmail: 'admin@delcastanher.com',
            note: null,
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      });

      expect(service.fees()?.history[0].createdByEmail).toBe('admin@delcastanher.com');
    });

    // Decisao 7: a autoria sai do token, no servidor. O cliente nao a declara.
    it('nao manda autoria no corpo do cadastro', () => {
      service
        .createFee({
          method: 'PIX',
          percentBasisPoints: 99,
          fixedCents: 0,
          validFrom: '2026-09-01T00:00:00.000Z',
        })
        .subscribe();

      const request = http.expectOne(`${environment.apiUrl}/admin/finance/fees`);

      expect(request.request.method).toBe('POST');
      expect(Object.keys(request.request.body)).not.toContain('createdById');
      expect(Object.keys(request.request.body)).not.toContain('createdByEmail');

      request.flush({});
    });

    it('nao expoe operacao de editar nem de apagar vigencia', () => {
      const api = service as unknown as Record<string, unknown>;

      expect(api['updateFee']).toBeUndefined();
      expect(api['deleteFee']).toBeUndefined();
      expect(api['removeFee']).toBeUndefined();
    });
  });

  describe('exportacao', () => {
    it('baixa o CSV como blob, com o filtro corrente', () => {
      service.exportCsv().subscribe();

      const request = http.expectOne(
        req => req.url === `${environment.apiUrl}/admin/finance/orders/export`,
      );

      expect(request.request.responseType).toBe('blob');
      expect(request.request.params.get('from')).toBeTruthy();

      request.flush(new Blob(['Pedido;Data\n'], { type: 'text/csv' }));
    });

    it('traduz a falha da planilha em uma mensagem propria', () => {
      let mensagem = '';

      service.exportCsv().subscribe({ error: (message: string) => (mensagem = message) });

      http
        .expectOne(req => req.url === `${environment.apiUrl}/admin/finance/orders/export`)
        .flush(null, { status: 500, statusText: 'Server Error' });

      expect(mensagem).toBe('Não foi possível gerar a planilha. Tente novamente.');
    });
  });
});
