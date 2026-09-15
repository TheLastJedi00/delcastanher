import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LessonTrack, LessonTrackItem } from './lesson-track';

const LESSONS: LessonTrackItem[] = [
  { id: 'l1', order: 1, title: 'O papel do RH', completed: true, durationSeconds: 754 },
  { id: 'l2', order: 2, title: 'Maturidade de RH', completed: false, durationSeconds: null },
  { id: 'l3', order: 3, title: 'Conexão com a estratégia', completed: false, durationSeconds: 3600 },
];

@Component({
  imports: [LessonTrack],
  template: `
    <ui-lesson-track
      [lessons]="lessons()"
      [activeId]="activeId()"
      [moduleOrder]="2"
      (selected)="chosen.set($event)" />
  `,
})
class Host {
  readonly lessons = signal<LessonTrackItem[]>(LESSONS);
  readonly activeId = signal<string | null>('l2');
  readonly chosen = signal<string | null>(null);
}

describe('ui-lesson-track', () => {
  let fixture: ComponentFixture<Host>;

  const el = () => fixture.nativeElement as HTMLElement;
  const pills = () => Array.from(el().querySelectorAll('button')) as HTMLButtonElement[];

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();

    fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
  });

  it('enumera as aulas na ordem recebida', () => {
    expect(pills().length).toBe(3);
    expect(el().textContent).toContain('Aula 1');
    expect(el().textContent).toContain('Maturidade de RH');
  });

  it('mostra a duracao vinda do Mux e omite a que ainda nao processou', () => {
    const text = el().textContent ?? '';

    expect(text).toContain('13 min');
    expect(text).toContain('1 h');
    // A aula 2 nao tem duracao: a pastilha simplesmente nao mostra tempo, em
    // vez de exibir "0 min" (decisao 18).
    expect(pills()[1].textContent).not.toContain('min');
  });

  it('marca a aula em foco com aria-current de passo', () => {
    const current = pills().filter(pill => pill.getAttribute('aria-current') === 'step');

    expect(current.length).toBe(1);
    expect(current[0].getAttribute('aria-label')).toContain('Aula 2');
  });

  it('descreve estado e duracao no rotulo acessivel', () => {
    // O visual troca o numero por um tique quando a aula esta concluida; sem
    // este rotulo a informacao nao chegaria a quem nao ve o icone.
    expect(pills()[0].getAttribute('aria-label')).toBe(
      'Aula 1: O papel do RH, concluída, 13 min',
    );
    expect(pills()[1].getAttribute('aria-label')).toBe('Aula 2: Maturidade de RH, em aberto');
  });

  it('emite o id da aula escolhida no clique', () => {
    pills()[2].click();

    expect(fixture.componentInstance.chosen()).toBe('l3');
  });

  it('nao desabilita nenhuma aula: toda aula e alcancavel', () => {
    // Nao existe liberacao sequencial (decisao 7): as aulas 2 e 3 sao
    // clicaveis mesmo com a 1 em aberto.
    expect(pills().some(pill => pill.disabled)).toBe(false);
  });

  it('so a aula em foco fica no caminho do Tab', () => {
    const tabbable = pills().filter(pill => pill.getAttribute('tabindex') === '0');

    expect(tabbable.length).toBe(1);
    expect(tabbable[0].getAttribute('aria-label')).toContain('Aula 2');
  });

  it('seta para a direita move o foco para a aula seguinte', () => {
    pills()[1].focus();
    pills()[1].dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
    );
    fixture.detectChanges();

    expect(document.activeElement).toBe(pills()[2]);
  });

  it('seta para a esquerda volta, e nao passa do primeiro', () => {
    pills()[0].focus();
    pills()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    fixture.detectChanges();

    expect(document.activeElement).toBe(pills()[0]);
  });

  it('End vai para a ultima aula e Home para a primeira', () => {
    pills()[0].focus();
    pills()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    fixture.detectChanges();

    expect(document.activeElement).toBe(pills()[2]);

    pills()[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    fixture.detectChanges();

    expect(document.activeElement).toBe(pills()[0]);
  });

  it('nomeia a navegacao com o numero do modulo', () => {
    expect(el().querySelector('nav')?.getAttribute('aria-label')).toBe('Aulas do módulo 2');
  });

  it('modulo sem aula nao renderiza navegacao vazia', () => {
    fixture.componentInstance.lessons.set([]);
    fixture.detectChanges();

    expect(el().querySelector('nav')).toBeNull();
  });
});
