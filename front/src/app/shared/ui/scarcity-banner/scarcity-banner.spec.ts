import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ScarcityBanner } from './scarcity-banner';

describe('ScarcityBanner', () => {
  let fixture: ComponentFixture<ScarcityBanner>;

  const el = () => fixture.nativeElement as HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ScarcityBanner] }).compileComponents();

    fixture = TestBed.createComponent(ScarcityBanner);
    fixture.componentRef.setInput('deadline', '[TURMA ENCERRA EM]');
    fixture.componentRef.setInput('seats', '[VAGAS RESTANTES]');
    fixture.detectChanges();
  });

  it('exibe prazo e vagas com os rótulos de urgência', () => {
    const text = el().textContent ?? '';
    expect(text).toContain('Últimas vagas da turma');
    expect(text).toContain('Inscrições até');
    expect(text).toContain('[TURMA ENCERRA EM]');
    expect(text).toContain('Vagas restantes:');
    expect(text).toContain('[VAGAS RESTANTES]');
  });

  it('dá tratamento de pendente aos dois placeholders', () => {
    expect(el().querySelectorAll('ui-placeholder-text .border-dashed').length).toBe(2);
  });

  it('não renderiza a linha de vagas quando o dado não é informado', () => {
    fixture.componentRef.setInput('seats', '');
    fixture.detectChanges();

    expect(el().textContent).not.toContain('Vagas restantes:');
  });

  it('anuncia a faixa como status para leitores de tela', () => {
    expect(el().querySelector('[role="status"]')).not.toBeNull();
  });

  it('não usa timer: nenhum elemento de contagem regressiva é renderizado', () => {
    expect(el().querySelector('time')).toBeNull();
  });

  it('fixa a faixa no topo quando sticky é true', () => {
    expect(el().querySelector('[role="status"]')!.className).not.toContain('sticky');

    fixture.componentRef.setInput('sticky', true);
    fixture.detectChanges();

    expect(el().querySelector('[role="status"]')!.className).toContain('sticky');
  });
});
