import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Accordion, AccordionItem } from './accordion';

describe('Accordion', () => {
  let fixture: ComponentFixture<Accordion>;

  const items: AccordionItem[] = [
    { title: 'Primeiro', content: 'Conteúdo do primeiro', marker: '01', bullets: ['Tópico A'] },
    { title: 'Segundo', content: 'Conteúdo do segundo', marker: '02' },
    { title: 'Terceiro', content: 'Conteúdo do terceiro', subtitle: 'Resumo' },
  ];

  const headers = () =>
    Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];

  const panels = () =>
    Array.from(fixture.nativeElement.querySelectorAll('[role="region"]')) as HTMLElement[];

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Accordion] }).compileComponents();

    fixture = TestBed.createComponent(Accordion);
    fixture.componentRef.setInput('items', items);
    fixture.detectChanges();
  });

  it('renderiza um cabeçalho por item', () => {
    expect(headers().length).toBe(3);
    expect(headers()[0].textContent).toContain('Primeiro');
  });

  it('começa com todos os painéis fechados', () => {
    expect(panels().every(panel => panel.hidden)).toBeTrue();
    expect(headers().every(header => header.getAttribute('aria-expanded') === 'false')).toBeTrue();
  });

  it('abre o item informado em initialOpen', () => {
    fixture.componentRef.setInput('initialOpen', 1);
    fixture.detectChanges();

    expect(panels()[1].hidden).toBeFalse();
    expect(headers()[1].getAttribute('aria-expanded')).toBe('true');
  });

  it('abre e fecha ao clicar no cabeçalho', () => {
    headers()[0].click();
    fixture.detectChanges();
    expect(panels()[0].hidden).toBeFalse();

    headers()[0].click();
    fixture.detectChanges();
    expect(panels()[0].hidden).toBeTrue();
  });

  it('mantém apenas um painel aberto no modo single', () => {
    headers()[0].click();
    fixture.detectChanges();
    headers()[2].click();
    fixture.detectChanges();

    expect(panels()[0].hidden).toBeTrue();
    expect(panels()[2].hidden).toBeFalse();
  });

  it('permite múltiplos painéis abertos quando single é false', () => {
    fixture.componentRef.setInput('single', false);
    fixture.detectChanges();

    headers()[0].click();
    fixture.detectChanges();
    headers()[1].click();
    fixture.detectChanges();

    expect(panels()[0].hidden).toBeFalse();
    expect(panels()[1].hidden).toBeFalse();
  });

  it('liga cabeçalho e painel por aria-controls/aria-labelledby', () => {
    const header = headers()[0];
    const panel = panels()[0];

    expect(header.getAttribute('aria-controls')).toBe(panel.id);
    expect(panel.getAttribute('aria-labelledby')).toBe(header.id);
  });

  it('exibe os bullets do item aberto', () => {
    headers()[0].click();
    fixture.detectChanges();

    expect(panels()[0].textContent).toContain('Tópico A');
  });
});
