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
          <!--
            Módulo trancado (Spec 014, decisão 17): o cadeado é consequência do
            portão, e não a proteção. Quem recusa vídeo, material e progresso é
            o servidor — aqui a tarefa é dizer ao aluno por que não abre e o
            que fazer a respeito.
          -->
          @if (locked()) {
            <span class="flex h-5 w-5 items-center justify-center rounded-full bg-brand-navy/10 text-brand-navy">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </span>
          } @else if (completed()) {
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
          @if (locked()) {
            <span class="mt-1 block text-[11px] text-slate-500">
              {{ priceLabel() }} · {{ lessonsLabel(totalLessons()) }}
            </span>
          } @else if (totalLessons() > 0) {
            <span class="mt-1 block text-[11px] text-slate-500">
              {{ completedLessons() }} de {{ lessonsLabel(totalLessons()) }}
            </span>
          } @else {
            <span class="mt-1 block text-[11px] text-slate-400">Sem aulas publicadas</span>
          }

          <!--
            Validade à vista (decisão 5): saber que o acesso vence em 12 dias é
            o tipo de coisa que ninguém deveria descobrir ao tentar abrir a
            aula.
          -->
          @if (expiringSoon()) {
            <span class="mt-1 block text-[11px] font-semibold text-state-warning">
              Seu acesso vence em {{ daysLeft() }} {{ daysLeft() === 1 ? 'dia' : 'dias' }}
            </span>
          }
        </span>
      </button>

      @if (locked()) {
        <div class="px-4 pb-3">
          <button
            type="button"
            class="w-full rounded-lg bg-gradient-brand px-3 py-2 text-xs font-bold text-white"
            (click)="buy.emit()">
            Comprar este módulo
          </button>
        </div>
      }

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

  /** Sem acesso ativo: o card vende em vez de navegar (Spec 014, decisao 17). */
  readonly locked = input(false);
  /** Preco em centavos; nulo e o modulo "em breve" (decisao 1). */
  readonly priceCents = input<number | null>(null);
  /** Fim do acesso, para o aviso de vencimento proximo (decisao 5). */
  readonly expiresAt = input<string | null>(null);

  /** Pedido de compra: quem leva para a loja e a tela, e nao o card. */
  readonly buy = output<void>();

  protected readonly priceLabel = computed(() => {
    const cents = this.priceCents();

    return cents === null
      ? 'Em breve'
      : (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  });

  /** Dias que faltam para o acesso vencer; nulo quando nao ha acesso. */
  protected readonly daysLeft = computed(() => {
    const iso = this.expiresAt();

    if (!iso) {
      return 0;
    }

    return Math.ceil((Date.parse(iso) - Date.now()) / (24 * 60 * 60 * 1000));
  });

  /** Aviso a partir de 30 dias — tempo de sobra para renovar sem susto. */
  protected readonly expiringSoon = computed(() => {
    const days = this.daysLeft();

    return !this.locked() && days > 0 && days <= 30;
  });

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
