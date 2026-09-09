import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Badge } from '../badge/badge';
import { Button } from '../button/button';
import { PlaceholderText } from '../placeholder-text/placeholder-text';

export interface PlanCardBenefit {
  label: string;
  included: boolean;
}

@Component({
  selector: 'ui-plan-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Badge, Button, PlaceholderText],
  host: { class: 'block h-full' },
  template: `
    <article [class]="cardClasses()">
      @if (featured()) {
        <span class="absolute inset-x-0 top-0 h-1 bg-gradient-brand" aria-hidden="true"></span>
      }

      <header class="mb-6">
        <div class="mb-3 flex min-h-[1.75rem] items-start justify-between gap-3">
          <h3 class="text-xl font-extrabold tracking-tight text-brand-navy">{{ name() }}</h3>
          @if (badge()) {
            <ui-badge [variant]="comingSoon() ? 'navy' : 'teal'" [label]="badge()" />
          }
        </div>

        @if (audience()) {
          <p class="text-xs font-bold uppercase tracking-[0.12em] text-brand-teal-deep">{{ audience() }}</p>
        }
        @if (description()) {
          <p class="mt-3 text-sm leading-relaxed text-slate-600">{{ description() }}</p>
        }
      </header>

      <div class="mb-6 border-y border-brand-navy/8 py-5">
        <p class="text-3xl font-extrabold tracking-tight text-brand-navy">
          <ui-placeholder-text [value]="price()" />
        </p>
        @if (priceNote()) {
          <p class="mt-2 text-sm text-slate-500">
            <ui-placeholder-text [value]="priceNote()" />
          </p>
        }
      </div>

      @if (highlights().length) {
        <ul class="mb-6 space-y-2">
          @for (highlight of highlights(); track highlight) {
            <li class="flex items-start gap-2 text-sm font-semibold text-brand-navy">
              <span class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gradient-teal" aria-hidden="true"></span>
              <ui-placeholder-text [value]="highlight" />
            </li>
          }
        </ul>
      }

      <ul class="mb-8 flex-1 space-y-3">
        @for (benefit of benefits(); track benefit.label) {
          <li
            class="flex items-start gap-2.5 text-sm leading-relaxed"
            [class.text-slate-600]="benefit.included"
            [class.text-slate-400]="!benefit.included">
            @if (benefit.included) {
              <svg class="mt-0.5 h-4 w-4 shrink-0 text-brand-teal-deep" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
              </svg>
              <span>{{ benefit.label }}</span>
            } @else {
              <svg class="mt-0.5 h-4 w-4 shrink-0 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M6 18L18 6M6 6l12 12" />
              </svg>
              <span class="line-through decoration-slate-300">{{ benefit.label }}</span>
            }
          </li>
        }
      </ul>

      <footer class="mt-auto">
        @if (comingSoon()) {
          <ui-button variant="outline" [fullWidth]="true" [disabled]="true">{{ ctaLabel() }}</ui-button>
        } @else if (ctaRouterLink()) {
          <a [routerLink]="ctaRouterLink()" class="block">
            <ui-button [variant]="featured() ? 'primary' : 'outline'" [fullWidth]="true">{{ ctaLabel() }}</ui-button>
          </a>
        } @else {
          <a [href]="ctaHref()" class="block">
            <ui-button [variant]="featured() ? 'primary' : 'outline'" [fullWidth]="true">{{ ctaLabel() }}</ui-button>
          </a>
        }
      </footer>
    </article>
  `,
})
export class PlanCard {
  readonly name = input('');
  readonly audience = input('');
  readonly description = input('');
  /** Aceita placeholder (`[PREÇO]`) — o template dá o tratamento de pendente. */
  readonly price = input('');
  readonly priceNote = input('');
  readonly highlights = input<string[]>([]);
  readonly benefits = input<PlanCardBenefit[]>([]);
  readonly ctaLabel = input('Quero este plano');
  readonly ctaRouterLink = input('');
  readonly ctaHref = input('');
  readonly badge = input('');
  /** Card em destaque na grid. */
  readonly featured = input(false);
  /** Produto ainda nao lancado: visual atenuado e CTA desabilitado. */
  readonly comingSoon = input(false);

  protected readonly cardClasses = computed(() =>
    [
      'relative flex h-full flex-col overflow-hidden rounded-2xl p-6 transition-all duration-300 md:p-8',
      this.featured()
        ? 'glass border-2 border-brand-teal/30 shadow-glass-lg md:-translate-y-2'
        : 'bg-white shadow-card border border-brand-navy/8',
      this.comingSoon()
        ? 'opacity-70 saturate-50'
        : 'hover:-translate-y-1 hover:shadow-card-hover',
    ].join(' ')
  );
}
