import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CONSENT_POLICY_VERSION, ConsentRecord, ConsentService } from './consent.service';

const STORAGE_KEY = 'delcastanher.consent';

function store(record: Partial<ConsentRecord>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
}

function create(): ConsentService {
  // O servico le o localStorage na construcao, entao cada cenario precisa de
  // uma instancia nova depois de preparar o armazenamento.
  TestBed.resetTestingModule();

  const service = TestBed.inject(ConsentService);

  // `bannerVisible` so liga depois da hidratacao (o prerender nao conhece o
  // localStorage de quem visita): o tick roda os callbacks de afterNextRender.
  TestBed.inject(ApplicationRef).tick();

  return service;
}

describe('ConsentService', () => {
  beforeEach(() => localStorage.removeItem(STORAGE_KEY));
  afterAll(() => localStorage.removeItem(STORAGE_KEY));

  it('comeca sem decisao e com o banner visivel na primeira visita', () => {
    const service = create();

    expect(service.hasDecision()).toBeFalse();
    expect(service.choice()).toBeNull();
    expect(service.analyticsAllowed()).toBeFalse();
    expect(service.bannerVisible()).toBeTrue();
  });

  it('nao libera analytics enquanto nao houver aceite', () => {
    const service = create();

    service.reject();

    expect(service.analyticsAllowed()).toBeFalse();
    expect(service.choice()).toBe('rejected');
    expect(service.bannerVisible()).toBeFalse();
  });

  it('persiste o aceite com data e versao da politica', () => {
    const service = create();

    service.accept();

    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as ConsentRecord;

    expect(saved.choice).toBe('accepted');
    expect(saved.policyVersion).toBe(CONSENT_POLICY_VERSION);
    // A prova de consentimento exige quando: a data precisa ser um ISO valido.
    expect(Number.isNaN(Date.parse(saved.decidedAt))).toBeFalse();
    expect(service.analyticsAllowed()).toBeTrue();
  });

  it('recupera o aceite gravado em uma visita anterior', () => {
    store({
      choice: 'accepted',
      decidedAt: new Date().toISOString(),
      policyVersion: CONSENT_POLICY_VERSION,
    });

    const service = create();

    expect(service.analyticsAllowed()).toBeTrue();
    expect(service.bannerVisible()).toBeFalse();
  });

  it('ignora consentimento dado sob versao anterior da politica', () => {
    store({
      choice: 'accepted',
      decidedAt: new Date().toISOString(),
      policyVersion: '1900-01-01',
    });

    const service = create();

    expect(service.hasDecision()).toBeFalse();
    expect(service.analyticsAllowed()).toBeFalse();
    expect(service.bannerVisible()).toBeTrue();
  });

  it('ignora registro corrompido sem derrubar a aplicacao', () => {
    localStorage.setItem(STORAGE_KEY, 'isso nao e json');

    const service = create();

    expect(service.hasDecision()).toBeFalse();
    expect(service.bannerVisible()).toBeTrue();
  });

  it('reabre o banner sem apagar a escolha vigente', () => {
    const service = create();

    service.accept();
    service.reopen();

    expect(service.bannerVisible()).toBeTrue();
    // Enquanto o titular nao decide de novo, o aceite anterior continua valendo.
    expect(service.analyticsAllowed()).toBeTrue();
  });

  it('revoga um aceite anterior e registra a nova escolha', () => {
    const service = create();

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
});
