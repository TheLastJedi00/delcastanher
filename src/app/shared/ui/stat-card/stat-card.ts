import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { GlassCard } from '../glass-card/glass-card';

@Component({
  selector: 'ui-stat-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GlassCard],
  host: { class: 'block h-full' },
  template: `
    <ui-glass-card padding="md">
      <div class="flex items-start justify-between gap-4">
        <div class="min-w-0">
          <p class="text-xs font-bold uppercase tracking-widest text-brand-steel mb-2">{{ label() }}</p>
          <p class="text-3xl font-extrabold tracking-tight text-brand-navy tabular-nums">{{ value() }}</p>

          @if (trend()) {
            <p
              class="mt-2 inline-flex items-center gap-1 text-xs font-bold"
              [class.text-state-success]="trend() === 'up'"
              [class.text-state-danger]="trend() === 'down'">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                @if (trend() === 'up') {
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                } @else {
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
                }
              </svg>
              {{ trendValue() }}
            </p>
          }
        </div>

        <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-teal/10 text-brand-teal">
          <ng-content />
        </span>
      </div>
    </ui-glass-card>
  `,
})
export class StatCard {
  readonly label = input('');
  readonly value = input('');
  readonly trend = input<'up' | 'down' | undefined>(undefined);
  readonly trendValue = input('');
}
