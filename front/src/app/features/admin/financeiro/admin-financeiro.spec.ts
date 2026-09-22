import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { AdminFinanceService, FinanceSummary } from '../../../core/services/admin-finance.service';
import { AdminFinanceiro } from './admin-financeiro';

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
    pendingOrders: 0,
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
  byMethod: [{ method: 'PIX', grossCents: 39800, paidOrders: 2, feeCents: 394 }],
  byModule: [{ moduleId: 'mod-1', title: 'Fundamentos', grossCents: 39800, quantity: 2 }],
  courtesy: [{ moduleId: 'mod-1', title: 'Fundamentos', courtesyCount: 2, legacyCount: 1 }],
  series: [
    { bucket: '2026-09-09', grossCents: 0, refundedCents: 0, paidOrders: 0 },
    { bucket: '2026-09-10', grossCents: 39800, refundedCents: 0, paidOrders: 2 },
  ],
  engagement: { buyers: 2, studied: 1, neverOpened: 1, rate: 50 },
  empty: false,
};

const PEDIDOS = { items: [], total: 0, page: 1, pageSize: 20 };

describe('AdminFinanceiro', () => {
  let fixture: ComponentFixture<AdminFinanceiro>;
  let http: HttpTestingController;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });

    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  afterEach(() => {
    TestBed.inject(AdminFinanceService).clear();
  });

  /** Sobe a aba e responde as duas consultas que ela dispara ao abrir. */
  function render(summary: Partial<FinanceSummary> = {}) {
    fixture = TestBed.createComponent(AdminFinanceiro);
    fixture.detectChanges();

    http
      .match(req => req.url === `${environment.apiUrl}/admin/finance/summary`)
      .forEach(req => req.flush({ ...RESUMO, ...summary }));
    http
      .match(req => req.url === `${environment.apiUrl}/admin/finance/orders`)
      .forEach(req => req.flush(PEDIDOS));

    fixture.detectChanges();
  }

  /** Decisao 11 da Spec 013: o recorte vira link compartilhavel. */
  it('reflete o recorte na URL', () => {
    const navigate = spyOn(router, 'navigate').and.resolveTo(true);

    render();

    fixture.componentInstance.setGranularity('month');
    fixture.detectChanges();

    http
      .match(req => req.url === `${environment.apiUrl}/admin/finance/summary`)
      .forEach(req => req.flush(RESUMO));
    http
      .match(req => req.url === `${environment.apiUrl}/admin/finance/orders`)
      .forEach(req => req.flush(PEDIDOS));

    const params = navigate.calls.mostRecent().args[1]?.queryParams as Record<string, unknown>;

    expect(params['granularidade']).toBe('month');
    expect(params['de']).toBeTruthy();
    expect(params['ate']).toBeTruthy();
  });

  /**
   * Decisao 5: um liquido inflado e crivel e a pior forma de errar um numero de
   * dinheiro. Sem taxa cadastrada a tela mostra um estado, e nunca um valor.
   */
  it('renderiza o liquido nao apurado como estado, e nao como numero', () => {
    render({
      totals: {
        ...RESUMO.totals,
        feeCents: null,
        netCents: null,
        uncoveredOrders: 3,
        uncoveredFrom: '2026-09-01T03:00:00.000Z',
        uncoveredTo: '2026-10-01T03:00:00.000Z',
      },
    });

    const aviso = fixture.debugElement.query(By.css('[data-testid="liquido-nao-apurado"]'));

    expect(aviso).not.toBeNull();
    expect(aviso.nativeElement.textContent).toContain('3');
    expect(aviso.nativeElement.textContent).toContain('fora de qualquer vigência');

    const cards = fixture.debugElement.queryAll(By.css('ui-stat-card'));
    const liquido = cards.find(card =>
      (card.nativeElement as HTMLElement).textContent?.includes('líquido'),
    );

    expect(liquido!.nativeElement.textContent).toContain('Não apurado');
    expect(liquido!.nativeElement.textContent).not.toContain('R$');
  });

  it('oferece o atalho para cadastrar a taxa do periodo descoberto', () => {
    render({
      totals: { ...RESUMO.totals, feeCents: null, netCents: null, uncoveredOrders: 1 },
    });

    const atalho = fixture.debugElement
      .query(By.css('[data-testid="liquido-nao-apurado"]'))
      .query(By.css('ui-button'));

    expect(atalho.nativeElement.textContent).toContain('Cadastrar a taxa');
  });

  /**
   * Decisao 15: um zero afirma que houve zero venda em um periodo em que se
   * vendeu; a ausencia de pedido afirma outra coisa.
   */
  it('mostra o estado vazio, e nao cards zerados, quando nao houve pedido', () => {
    render({
      empty: true,
      totals: { ...RESUMO.totals, grossCents: 0, paidOrders: 0, buyers: 0, attempts: 0 },
      series: [],
    });

    const vazio = fixture.debugElement.query(By.css('[data-testid="estado-vazio"]'));

    expect(vazio).not.toBeNull();
    expect(vazio.nativeElement.textContent).toContain('Nenhum pedido neste intervalo');
    expect(fixture.debugElement.queryAll(By.css('ui-stat-card')).length).toBe(0);
    expect(fixture.debugElement.query(By.css('ui-time-series-chart'))).toBeNull();
  });

  /**
   * Decisao 1: contar acesso como venda somaria as cortesias do suporte ao
   * faturamento, e o numero cresceria toda vez que um administrador resolvesse
   * um chamado.
   */
  it('exibe a cortesia como contador, sem nenhum valor monetario', () => {
    render();

    const cortesias = fixture.debugElement.query(By.css('[data-testid="cortesias"]'));

    expect(cortesias.nativeElement.textContent).toContain('2 cortesias');
    expect(cortesias.nativeElement.textContent).not.toContain('R$');
  });

  it('separa quem comprou e estudou de quem comprou e nao abriu', () => {
    render();

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(texto).toContain('compraram e estudaram');
    expect(texto).toContain('compraram e não abriram');
  });

  /** Decisao 7: a tabela e append-only. Corrigir uma taxa e cadastrar outra. */
  it('abre a tela de taxas sem nenhuma acao de editar ou apagar', () => {
    render();

    fixture.componentInstance.openFees();
    fixture.detectChanges();

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
    fixture.detectChanges();

    const historico = fixture.debugElement.query(By.css('[data-testid="historico-taxas"]'));

    expect(historico.nativeElement.textContent).toContain('admin@delcastanher.com');
    expect(historico.nativeElement.textContent).toContain('0,99%');

    const acoes = fixture.debugElement
      .queryAll(By.css('ui-button, button'))
      .map(el => (el.nativeElement as HTMLElement).textContent?.toLowerCase() ?? '');

    expect(acoes.some(texto => texto.includes('editar'))).toBeFalse();
    expect(acoes.some(texto => texto.includes('apagar') || texto.includes('excluir'))).toBeFalse();
  });

  // Decisao 2: nenhum float chega a API — 4,99% vira 499 pontos-base.
  it('converte o percentual digitado em pontos-base no cadastro', () => {
    render();

    fixture.componentInstance.openFees();
    fixture.detectChanges();
    http
      .expectOne(`${environment.apiUrl}/admin/finance/fees`)
      .flush({ current: { PIX: null, CREDIT_CARD: null }, history: [] });

    fixture.componentInstance.feeForm.setValue({
      method: 'CREDIT_CARD',
      percent: '4,99',
      fixed: '0,40',
      validFrom: '2026-09-01',
      note: 'reajuste anunciado',
    });
    fixture.componentInstance.submitFee();

    const request = http.expectOne(
      req => req.url === `${environment.apiUrl}/admin/finance/fees` && req.method === 'POST',
    );

    expect(request.request.body.percentBasisPoints).toBe(499);
    expect(request.request.body.fixedCents).toBe(40);

    request.flush({});
    http.match(() => true).forEach(req => req.flush({ current: {}, history: [] }));
  });

  /** Decisao 19: sem base de comparacao a seta fica de fora. */
  it('nao mostra seta de tendencia quando o periodo anterior nao teve pedido', () => {
    render({ previous: null });

    expect(fixture.componentInstance.trend()).toBeUndefined();
  });

  it('mostra a seta e a legenda quando ha periodo anterior', () => {
    render({
      previous: {
        period: { from: '2026-08-02T03:00:00.000Z', to: '2026-09-01T03:00:00.000Z' },
        grossCents: 19900,
        paidOrders: 1,
        changePercent: 100,
      },
    });

    expect(fixture.componentInstance.trend()).toBe('up');
    expect(fixture.componentInstance.previousLabel()).toContain('vs.');
  });
});
