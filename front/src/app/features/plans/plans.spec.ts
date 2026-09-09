import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { PLAN_BENEFITS, PLANS } from '../../core/mocks/plans.mock';
import { Plans } from './plans';

describe('Plans', () => {
  let fixture: ComponentFixture<Plans>;

  const el = () => fixture.nativeElement as HTMLElement;
  const cards = () => Array.from(el().querySelectorAll('ui-plan-card')) as HTMLElement[];
  const cardOf = (name: string) => cards().find(card => card.textContent?.includes(name))!;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Plans],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(Plans);
    fixture.detectChanges();
  });

  it('renderiza os cinco pacotes do mock', () => {
    expect(cards().length).toBe(5);

    for (const plan of PLANS) {
      expect(el().textContent)
        .withContext(`plano ${plan.name}`)
        .toContain(plan.name);
    }
  });

  it('lista os quatro pacotes previstos na spec além do produto de entrada', () => {
    for (const name of ['Curso Individual', 'Trilhas', 'Formação Completa', 'Empresas']) {
      expect(cardOf(name)).withContext(`card ${name}`).toBeTruthy();
    }
  });

  it('usa a mesma lista de benefícios, na mesma ordem, em todos os cards', () => {
    for (const card of cards()) {
      const labels = Array.from(card.querySelectorAll('ul')[card.querySelectorAll('ul').length - 1].children).map(
        item => item.textContent?.trim()
      );

      expect(labels.length).toBe(PLAN_BENEFITS.length);
      PLAN_BENEFITS.forEach((benefit, index) => {
        expect(labels[index]).withContext(`benefício ${index}`).toContain(benefit);
      });
    }
  });

  it('Mini Curso aparece em breve, com CTA desabilitado e sem link', () => {
    const miniCurso = cardOf('Mini Curso');

    expect(miniCurso.textContent).toContain('Em breve');
    expect(miniCurso.querySelector('a')).toBeNull();

    const cta = miniCurso.querySelector('button') as HTMLButtonElement;
    expect(cta.disabled).toBeTrue();
    expect(cta.getAttribute('aria-disabled')).toBe('true');
  });

  it('Curso Individual leva para a página do curso', () => {
    const link = cardOf('Curso Individual').querySelector('a') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/cursos/imersao-rh');
  });

  it('destaca apenas o pacote marcado como featured no mock', () => {
    const featured = cards().filter(card =>
      card.querySelector('article')!.className.includes('border-brand-teal/30')
    );

    expect(featured.length).toBe(PLANS.filter(plan => plan.featured).length);
    expect(featured[0].textContent).toContain('Trilhas');
  });

  it('dá tratamento de pendente aos preços em placeholder', () => {
    expect(el().querySelectorAll('ui-placeholder-text .border-dashed').length).toBeGreaterThan(0);
  });

  it('separa o pacote Trilhas da trilha da área do aluno', () => {
    expect(el().querySelector('#planos')!.textContent).toContain('trilha de aprendizado');
  });

  it('fecha a página com o rodapé', () => {
    expect(el().querySelector('ui-footer')).not.toBeNull();
  });
});
