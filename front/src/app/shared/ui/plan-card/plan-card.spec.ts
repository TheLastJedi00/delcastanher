import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { PlanCard, PlanCardBenefit } from './plan-card';

describe('PlanCard', () => {
  let fixture: ComponentFixture<PlanCard>;

  const benefits: PlanCardBenefit[] = [
    { label: 'Acesso ao AVA', included: true },
    { label: 'Mentoria em grupo', included: false },
  ];

  const el = () => fixture.nativeElement as HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PlanCard],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(PlanCard);
    fixture.componentRef.setInput('name', 'Curso Individual');
    fixture.componentRef.setInput('price', 'R$ 1.200');
    fixture.componentRef.setInput('benefits', benefits);
    fixture.detectChanges();
  });

  it('renderiza título, preço e a lista completa de benefícios', () => {
    expect(el().textContent).toContain('Curso Individual');
    expect(el().textContent).toContain('R$ 1.200');
    expect(el().querySelectorAll('li').length).toBe(2);
    expect(el().textContent).toContain('Mentoria em grupo');
  });

  it('marca visualmente o benefício não incluso', () => {
    const items = el().querySelectorAll('li');
    expect(items[0].querySelector('.line-through')).toBeNull();
    expect(items[1].querySelector('.line-through')).not.toBeNull();
  });

  it('exibe preço em placeholder com tratamento de pendente', () => {
    fixture.componentRef.setInput('price', '[PREÇO]');
    fixture.detectChanges();

    const pending = el().querySelector('ui-placeholder-text .border-dashed');
    expect(pending).not.toBeNull();
    expect(pending!.textContent).toContain('[PREÇO]');
  });

  it('usa routerLink no CTA quando informado', () => {
    fixture.componentRef.setInput('ctaRouterLink', '/cursos/imersao-rh');
    fixture.componentRef.setInput('ctaLabel', 'Ver o curso');
    fixture.detectChanges();

    const link = el().querySelector('a[href]') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/cursos/imersao-rh');
    expect(link.textContent).toContain('Ver o curso');
  });

  it('no estado em-breve desabilita o CTA e não renderiza link', () => {
    fixture.componentRef.setInput('comingSoon', true);
    fixture.componentRef.setInput('ctaLabel', 'Em breve');
    fixture.detectChanges();

    const button = el().querySelector('button') as HTMLButtonElement;
    expect(button.disabled).toBeTrue();
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(el().querySelector('a')).toBeNull();
  });

  it('aplica o realce visual no estado destaque', () => {
    expect(el().querySelector('article')!.className).not.toContain('border-brand-teal/30');

    fixture.componentRef.setInput('featured', true);
    fixture.detectChanges();

    expect(el().querySelector('article')!.className).toContain('border-brand-teal/30');
  });
});
