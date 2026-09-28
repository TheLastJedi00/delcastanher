import { ApplicationRef } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { ConsentRecord, ConsentService } from './consent.service';

const STORAGE_KEY = 'delcastanher.consent';
const VERSION_URL = `${environment.apiUrl}/legal/policy-version`;
const VIGENTE = '2026-09-13';

function store(record: Partial<ConsentRecord>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
}

function create(): { service: ConsentService; backend: HttpTestingController } {
  // O servico le o localStorage na construcao, entao cada cenario precisa de
  // uma instancia nova depois de preparar o armazenamento.
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });

  const service = TestBed.inject(ConsentService);

  // `bannerVisible` so liga depois da hidratacao (o prerender nao conhece o
  // localStorage de quem visita): o tick roda os callbacks de afterNextRender.
  TestBed.inject(ApplicationRef).tick();

  return { service, backend: TestBed.inject(HttpTestingController) };
}

/** Responde a versao vigente a quem perguntou, se alguem perguntou. */
function answer(backend: HttpTestingController, version: string | null = VIGENTE): void {
  backend.match(VERSION_URL).forEach(request => request.flush({ version, published: [] }));
}

/** Cria e responde a versao vigente, que e o caso comum. */
function createWithVersion(version: string | null = VIGENTE): ConsentService {
  const { service, backend } = create();

  answer(backend, version);

  return service;
}

describe('ConsentService', () => {
  beforeEach(() => localStorage.removeItem(STORAGE_KEY));
  afterAll(() => localStorage.removeItem(STORAGE_KEY));

  it('comeca sem decisao e com o banner visivel na primeira visita', () => {
    const service = createWithVersion();

    expect(service.hasDecision()).toBeFalse();
    expect(service.choice()).toBeNull();
    expect(service.analyticsAllowed()).toBeFalse();
    expect(service.bannerVisible()).toBeTrue();
  });

  it('nao libera analytics enquanto nao houver aceite', () => {
    const service = createWithVersion();

    service.reject();

    expect(service.analyticsAllowed()).toBeFalse();
    expect(service.choice()).toBe('rejected');
    expect(service.bannerVisible()).toBeFalse();
  });

  it('persiste o aceite com data e a versao da politica vinda da API', () => {
    const { service, backend } = create();

    service.accept();
    answer(backend, '2026-09-28.2');

    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as ConsentRecord;

    expect(saved.choice).toBe('accepted');
    expect(saved.policyVersion).toBe('2026-09-28.2');
    // A prova de consentimento exige quando: a data precisa ser um ISO valido.
    expect(Number.isNaN(Date.parse(saved.decidedAt))).toBeFalse();
    expect(service.analyticsAllowed()).toBeTrue();
  });

  it('recupera o aceite gravado em uma visita anterior', () => {
    store({ choice: 'accepted', decidedAt: new Date().toISOString(), policyVersion: VIGENTE });

    const service = createWithVersion();

    expect(service.analyticsAllowed()).toBeTrue();
    expect(service.bannerVisible()).toBeFalse();
  });

  it('ignora registro corrompido sem derrubar a aplicacao', () => {
    localStorage.setItem(STORAGE_KEY, 'isso nao e json');

    const service = createWithVersion();

    expect(service.hasDecision()).toBeFalse();
    expect(service.bannerVisible()).toBeTrue();
  });

  it('reabre o banner sem apagar a escolha vigente', () => {
    const service = createWithVersion();

    service.accept();
    service.reopen();

    expect(service.bannerVisible()).toBeTrue();
    // Enquanto o titular nao decide de novo, o aceite anterior continua valendo.
    expect(service.analyticsAllowed()).toBeTrue();
  });

  it('revoga um aceite anterior e registra a nova escolha', () => {
    const service = createWithVersion();

    service.accept();
    const firstDecision = service.current()!.decidedAt;

    service.reopen();
    service.reject();

    expect(service.analyticsAllowed()).toBeFalse();
    expect(service.bannerVisible()).toBeFalse();
    expect(service.current()!.choice).toBe('rejected');
    expect(Date.parse(service.current()!.decidedAt)).toBeGreaterThanOrEqual(
      Date.parse(firstDecision)
    );
  });

  /** Spec 022, decisao 8: a versao vem da API, sem piscar o banner. */
  describe('versao da politica vinda da API', () => {
    it('pergunta a versao sem mandar token, direto na rede, a quem ja decidiu', () => {
      store({ choice: 'accepted', decidedAt: new Date().toISOString(), policyVersion: VIGENTE });

      const { backend } = create();

      const request = backend.expectOne(VERSION_URL);

      expect(request.request.headers.has('Authorization')).toBeFalse();
      request.flush({ version: VIGENTE, published: [] });
    });

    it('nao pergunta a versao a quem nunca decidiu, que ve o banner de qualquer jeito', () => {
      const { service, backend } = create();

      backend.expectNone(VERSION_URL);
      expect(service.bannerVisible()).toBeTrue();
    });

    it('nao mostra o banner a quem ja decidiu enquanto a versao nao chega', () => {
      store({ choice: 'accepted', decidedAt: new Date().toISOString(), policyVersion: VIGENTE });

      const { service, backend } = create();

      expect(service.bannerVisible()).toBeFalse();
      expect(service.analyticsAllowed()).toBeTrue();

      backend.expectOne(VERSION_URL).flush({ version: VIGENTE, published: [] });

      expect(service.bannerVisible()).toBeFalse();
    });

    it('reabre o banner quando a versao da API difere da gravada', () => {
      store({ choice: 'accepted', decidedAt: new Date().toISOString(), policyVersion: VIGENTE });

      const { service, backend } = create();

      backend.expectOne(VERSION_URL).flush({ version: '2026-09-28', published: [] });

      expect(service.hasDecision()).toBeFalse();
      expect(service.analyticsAllowed()).toBeFalse();
      expect(service.bannerVisible()).toBeTrue();
    });

    it('mantem o registro gravado se a API falhar', () => {
      store({ choice: 'rejected', decidedAt: new Date().toISOString(), policyVersion: VIGENTE });

      const { service, backend } = create();

      backend.expectOne(VERSION_URL).flush(null, { status: 503, statusText: 'Unavailable' });

      expect(service.choice()).toBe('rejected');
      expect(service.bannerVisible()).toBeFalse();
    });

    it('com a API fora, grava a escolha sem versao, e ela vale nesta visita', () => {
      const { service, backend } = create();

      service.accept();
      backend.expectOne(VERSION_URL).flush(null, { status: 503, statusText: 'Unavailable' });

      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as ConsentRecord;

      expect(saved.policyVersion).toBeNull();
      expect(service.analyticsAllowed()).toBeTrue();
      expect(service.bannerVisible()).toBeFalse();
    });

    it('a escolha sem versao volta a ser perguntada quando a versao chega', () => {
      store({ choice: 'accepted', decidedAt: new Date().toISOString(), policyVersion: null });

      const { service, backend } = create();

      answer(backend, VIGENTE);

      // Aceite antigo, de versao desconhecida, nao vira aceite desta versao.
      expect(service.hasDecision()).toBeFalse();
      expect(service.bannerVisible()).toBeTrue();
    });
  });
});
