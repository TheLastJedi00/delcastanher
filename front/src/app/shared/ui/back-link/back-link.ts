import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'ui-back-link',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  host: { class: 'inline-flex' },
  template: `
    <a
      [routerLink]="link()"
      class="group inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-brand-teal-deep transition-colors">
      <svg
        class="w-4 h-4 transition-transform duration-200 group-hover:-translate-x-1"
        fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
      </svg>
      {{ label() }}
    </a>
  `,
})
export class BackLink {
  readonly link = input('/ava');
  readonly label = input('Voltar ao Hub');
}
