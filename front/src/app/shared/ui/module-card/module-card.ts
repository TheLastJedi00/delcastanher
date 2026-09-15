import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { formatDuration, lessonCountLabel } from '../../../core/services/content.service';

/** Aula como o card do modulo precisa conhece-la. */
export interface ModuleCardLesson {
  id: string;
  order: number;
  title: string;
  completed: boolean;
  durationSeconds: number | null;
}

@Component({
  selector: 'ui-module-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="relative border-b border-brand-navy/8">
      @if (active()) {
        <span class="absolute inset-y-0 left-0 w-1 bg-gradient-teal" aria-hidden="true"></span>
      }

      <button type="button" [class]="classes()" (click)="selected.emit()" [attr.aria-current]="active() ? 'step' : null">
        <span class="mt-0.5 shrink-0">
          @if (completed()) {
            <span class="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-teal text-white">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
              </svg>
            </span>
          } @else {
            <span class="block h-5 w-5 rounded-full border-2 border-brand-navy/20"></span>
          }
        </span>

        <span class="min-w-0">
          <span class="block text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500 mb-1">
            Módulo {{ moduleNumber() }}
          </span>
          <span class="block text-sm font-bold" [class.text-brand-teal-deep]="active()" [class.text-brand-navy]="!active()">
            {{ title() }}
          </span>
          <!--
            Contador de aulas: desde a Spec 012 um módulo é um container, e
            "concluído" quer dizer todas as aulas concluídas. O número vem
            pronto do servidor para nenhuma tela refazer a conta (decisão 6).
          -->
          @if (totalLessons() > 0) {
            <span class="mt-1 block text-[11px] text-slate-500">
              {{ completedLessons() }} de {{ lessonsLabel(totalLessons()) }}
            </span>
          } @else {
            <span class="mt-1 block text-[11px] text-slate-400">Sem aulas publicadas</span>
          }
        </span>
      </button>

      <!--
        Aulas do módulo em foco, em lista linear. Não é uma terceira navegação:
        é o mesmo dado da trilha horizontal no formato de que o leitor de tela e
        o drawer do mobile precisam (Spec 012, decisão 8).
      -->
      @if (active() && lessons().length > 0) {
        <ul class="pb-2">
          @for (lesson of lessons(); track lesson.id) {
            <li>
              <button
                type="button"
                [class]="lessonClasses(lesson)"
                [attr.aria-current]="lesson.id === activeLessonId() ? 'true' : null"
                (click)="lessonSelected.emit(lesson.id)">
                <span [class]="lessonBadgeClasses(lesson)" aria-hidden="true">
                  @if (lesson.completed) {
                    <svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
                    </svg>
                  } @else {
                    {{ lesson.order }}
                  }
                </span>
                <span class="min-w-0 flex-1 truncate text-left">{{ lesson.title }}</span>
                @if (duration(lesson)) {
                  <span class="shrink-0 text-[11px] text-slate-400">{{ duration(lesson) }}</span>
                }
              </button>
            </li>
          }
        </ul>
      }
    </div>
  `,
})
export class ModuleCard {
  readonly moduleNumber = input(1);
  readonly title = input('');
  readonly completed = input(false);
  readonly active = input(false);

  readonly completedLessons = input(0);
  readonly totalLessons = input(0);

  /** Aulas do modulo; a lista so e exibida quando o modulo esta em foco. */
  readonly lessons = input<readonly ModuleCardLesson[]>([]);
  readonly activeLessonId = input<string | null>(null);

  readonly selected = output<void>();
  readonly lessonSelected = output<string>();

  protected readonly classes = computed(() =>
    [
      'relative flex w-full items-start gap-3 p-4 text-left',
      'transition-all duration-200 hover:bg-brand-teal/5 hover:shadow-glow-teal',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-teal',
      this.active() ? 'bg-brand-teal/5' : '',
    ]
      .filter(Boolean)
      .join(' ')
  );

  protected lessonsLabel(total: number): string {
    return lessonCountLabel(total);
  }

  protected duration(lesson: ModuleCardLesson): string {
    return formatDuration(lesson.durationSeconds);
  }

  protected lessonClasses(lesson: ModuleCardLesson): string {
    return [
      'flex w-full items-center gap-2 py-2 pl-12 pr-4 text-left text-xs transition-colors',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-teal',
      lesson.id === this.activeLessonId()
        ? 'bg-brand-teal/10 font-bold text-brand-teal-deep'
        : 'text-slate-600 hover:bg-brand-teal/5',
    ].join(' ');
  }

  protected lessonBadgeClasses(lesson: ModuleCardLesson): string {
    return [
      'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
      lesson.completed
        ? 'bg-gradient-teal text-white'
        : lesson.id === this.activeLessonId()
          ? 'bg-brand-teal text-white'
          : 'bg-brand-navy/8 text-brand-navy',
    ].join(' ');
  }
}
