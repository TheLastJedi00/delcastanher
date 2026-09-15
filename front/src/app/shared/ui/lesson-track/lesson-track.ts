import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  input,
  output,
  viewChildren,
} from '@angular/core';
import { formatDuration } from '../../../core/services/content.service';

/** Aula como a trilha horizontal precisa conhece-la. */
export interface LessonTrackItem {
  id: string;
  order: number;
  title: string;
  completed: boolean;
  durationSeconds: number | null;
}

/**
 * Trilha enumerada horizontal das aulas de um modulo.
 *
 * O `aside` do AVA continua sendo a navegacao **vertical** entre modulos, que
 * o aluno ja conhece; esta e a horizontal, entre as aulas de um modulo
 * (Spec 012, decisao 8). Um eixo, um componente: as duas nao disputam o mesmo
 * papel.
 *
 * Toda aula e alcancavel a qualquer momento — nao ha liberacao sequencial
 * (decisao 7). O que as pastilhas mostram e onde o aluno esta e o que ele ja
 * concluiu, nao o que ele tem permissao de abrir.
 */
@Component({
  selector: 'ui-lesson-track',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block', '(keydown)': 'onKeydown($event)' },
  template: `
    @if (lessons().length > 0) {
      <nav [attr.aria-label]="navLabel()">
        <ol class="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 lesson-track-scroller">
          @for (lesson of lessons(); track lesson.id; let index = $index) {
            <li class="shrink-0 snap-start">
              <button
                #item
                type="button"
                [class]="pillClass(lesson)"
                [attr.aria-current]="isActive(lesson) ? 'step' : null"
                [attr.aria-label]="ariaLabel(lesson)"
                [attr.tabindex]="isActive(lesson) || (!hasActive() && index === 0) ? 0 : -1"
                (click)="selected.emit(lesson.id)">
                <span [class]="badgeClass(lesson)" aria-hidden="true">
                  @if (lesson.completed) {
                    <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
                    </svg>
                  } @else {
                    {{ lesson.order }}
                  }
                </span>

                <span class="min-w-0 text-left">
                  <span class="block text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">
                    Aula {{ lesson.order }}
                  </span>
                  <span class="block max-w-[11rem] truncate text-sm font-bold">{{ lesson.title }}</span>
                  @if (duration(lesson)) {
                    <span class="block text-[11px] text-slate-500">{{ duration(lesson) }}</span>
                  }
                </span>
              </button>
            </li>
          }
        </ol>
      </nav>
    }
  `,
  styles: `
    /*
      Rolagem sem barra visivel no desktop, mas ainda rolavel por teclado,
      trackpad e toque. O \`snap-mandatory\` do template e o que faz a pastilha
      parar alinhada no mobile.
    */
    .lesson-track-scroller {
      scrollbar-width: thin;
    }
  `,
})
export class LessonTrack {
  readonly lessons = input<readonly LessonTrackItem[]>([]);

  /** Aula em foco. Vem da rota, nunca de estado local (decisao 9). */
  readonly activeId = input<string | null>(null);

  /** Numero do modulo, so para o rotulo acessivel da navegacao. */
  readonly moduleOrder = input<number | null>(null);

  readonly selected = output<string>();

  private readonly items = viewChildren<ElementRef<HTMLButtonElement>>('item');

  protected readonly navLabel = computed(() => {
    const order = this.moduleOrder();

    return order ? `Aulas do módulo ${order}` : 'Aulas do módulo';
  });

  protected readonly hasActive = computed(() =>
    this.lessons().some(lesson => lesson.id === this.activeId()),
  );

  constructor() {
    // A aula em foco pode estar fora da area visivel depois de uma navegacao
    // por deep-link ou por teclado. O `inline: 'center'` traz a pastilha para
    // o meio sem rolar a pagina inteira, e o `behavior` respeita
    // reduced-motion — a Spec 011 (decisao 6) tratou movimento como algo que
    // se desliga, nao como enfeite obrigatorio.
    effect(() => {
      const active = this.activeId();
      const buttons = this.items();

      if (!active || buttons.length === 0) {
        return;
      }

      const index = this.lessons().findIndex(lesson => lesson.id === active);
      const target = index >= 0 ? buttons[index] : undefined;

      target?.nativeElement.scrollIntoView({
        block: 'nearest',
        inline: 'center',
        behavior: this.prefersReducedMotion() ? 'auto' : 'smooth',
      });
    });
  }

  protected isActive(lesson: LessonTrackItem): boolean {
    return lesson.id === this.activeId();
  }

  protected duration(lesson: LessonTrackItem): string {
    return formatDuration(lesson.durationSeconds);
  }

  /**
   * Rotulo completo para leitor de tela: a pastilha visual troca o numero por
   * um tique quando a aula esta concluida, e sem isto a informacao "concluida"
   * nao chegaria a quem nao ve o icone.
   */
  protected ariaLabel(lesson: LessonTrackItem): string {
    const parts = [`Aula ${lesson.order}: ${lesson.title}`];

    parts.push(lesson.completed ? 'concluída' : 'em aberto');

    const time = this.duration(lesson);

    if (time) {
      parts.push(time);
    }

    return parts.join(', ');
  }

  /**
   * Seta anda entre as pastilhas, Home e End vao aos extremos. Uma trilha
   * horizontal percorrida so por Tab obrigaria a passar por todas as aulas
   * para chegar ao player.
   */
  protected onKeydown(event: KeyboardEvent): void {
    const step =
      event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;

    if (step === 0 && event.key !== 'Home' && event.key !== 'End') {
      return;
    }

    const buttons = this.items();

    if (buttons.length === 0) {
      return;
    }

    const current = buttons.findIndex(
      item => item.nativeElement === (event.target as HTMLElement),
    );

    if (current === -1) {
      return;
    }

    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? buttons.length - 1
          : Math.min(Math.max(current + step, 0), buttons.length - 1);

    if (next === current) {
      return;
    }

    event.preventDefault();
    buttons[next].nativeElement.focus();
  }

  protected pillClass(lesson: LessonTrackItem): string {
    return [
      'flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-all duration-200',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal',
      this.isActive(lesson)
        ? 'border-brand-teal bg-brand-teal/10 text-brand-teal-deep shadow-glow-teal'
        : 'border-brand-navy/10 bg-white/70 text-brand-navy hover:border-brand-teal/40 hover:bg-brand-teal/5',
    ].join(' ');
  }

  protected badgeClass(lesson: LessonTrackItem): string {
    return [
      'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold',
      lesson.completed
        ? 'bg-gradient-teal text-white'
        : this.isActive(lesson)
          ? 'bg-brand-teal text-white'
          : 'bg-brand-navy/8 text-brand-navy',
    ].join(' ');
  }

  /** `matchMedia` nao existe no prerender; ausente significa "sem preferencia". */
  private prefersReducedMotion(): boolean {
    return (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }
}
