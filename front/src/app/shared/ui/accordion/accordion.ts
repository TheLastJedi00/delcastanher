import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';

export interface AccordionItem {
  /** Titulo clicavel. */
  title: string;
  /** Corpo revelado ao abrir. */
  content: string;
  /** Linha auxiliar exibida sob o titulo (ex.: resumo do modulo). */
  subtitle?: string;
  /** Lista opcional exibida abaixo do conteudo (ex.: topicos do modulo). */
  bullets?: string[];
  /** Marcador a esquerda (ex.: numero do modulo). */
  marker?: string;
}

let nextAccordionId = 0;

@Component({
  selector: 'ui-accordion',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="divide-y divide-brand-navy/8 overflow-hidden rounded-2xl border border-brand-navy/8 bg-white shadow-card">
      @for (item of items(); track item.title; let i = $index) {
        <div>
          <h3 class="m-0">
            <button
              type="button"
              [id]="headerId(i)"
              [attr.aria-expanded]="isOpen(i)"
              [attr.aria-controls]="panelId(i)"
              class="flex w-full items-center gap-4 p-4 text-left transition-colors duration-200 hover:bg-brand-teal/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-teal md:p-5"
              (click)="toggle(i)">
              @if (item.marker) {
                <span
                  class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-extrabold transition-colors duration-200"
                  [class]="isOpen(i) ? 'bg-gradient-brand text-white' : 'bg-brand-navy/5 text-brand-navy'">
                  {{ item.marker }}
                </span>
              }

              <span class="min-w-0 flex-1">
                <span class="block text-sm font-bold text-brand-navy md:text-base">{{ item.title }}</span>
                @if (item.subtitle) {
                  <span class="mt-0.5 block text-xs leading-relaxed text-slate-500 md:text-sm">
                    {{ item.subtitle }}
                  </span>
                }
              </span>

              <svg
                class="h-5 w-5 shrink-0 text-brand-teal-deep transition-transform duration-300"
                [class.rotate-180]="isOpen(i)"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </h3>

          <div
            [id]="panelId(i)"
            role="region"
            [attr.aria-labelledby]="headerId(i)"
            [hidden]="!isOpen(i)"
            class="px-4 pb-5 md:px-5">
            <div [class]="bodyClasses()">
              @if (item.content) {
                <p class="text-sm leading-relaxed text-slate-600">{{ item.content }}</p>
              }
              @if (item.bullets?.length) {
                <ul class="mt-3 space-y-2">
                  @for (bullet of item.bullets; track bullet) {
                    <li class="flex items-start gap-2 text-sm leading-relaxed text-slate-600">
                      <span class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gradient-teal" aria-hidden="true"></span>
                      <span>{{ bullet }}</span>
                    </li>
                  }
                </ul>
              }
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class Accordion {
  readonly items = input<AccordionItem[]>([]);
  /** Indice aberto na primeira renderizacao; -1 deixa tudo fechado. */
  readonly initialOpen = input(-1);
  /** Quando false, varios itens podem ficar abertos ao mesmo tempo. */
  readonly single = input(true);

  private readonly uid = nextAccordionId++;
  /** null = ninguem interagiu ainda, entao vale o initialOpen. */
  private readonly overrideIndexes = signal<ReadonlySet<number> | null>(null);

  private readonly openIndexes = computed<ReadonlySet<number>>(() => {
    const override = this.overrideIndexes();
    if (override) {
      return override;
    }
    const initial = this.initialOpen();
    return initial >= 0 ? new Set([initial]) : new Set<number>();
  });

  /** Alinha o corpo com o titulo quando ha marcador (marker 2.25rem + gap 1rem). */
  private readonly indentBody = computed(() => this.items().some(item => !!item.marker));

  protected readonly bodyClasses = computed(() =>
    ['animate-fade-in-up', this.indentBody() ? 'md:pl-[3.25rem]' : ''].filter(Boolean).join(' ')
  );

  protected isOpen(index: number): boolean {
    return this.openIndexes().has(index);
  }

  protected toggle(index: number): void {
    const next = new Set(this.openIndexes());

    if (next.has(index)) {
      next.delete(index);
    } else {
      if (this.single()) {
        next.clear();
      }
      next.add(index);
    }

    this.overrideIndexes.set(next);
  }

  protected headerId(index: number): string {
    return `ui-accordion-${this.uid}-header-${index}`;
  }

  protected panelId(index: number): string {
    return `ui-accordion-${this.uid}-panel-${index}`;
  }
}
