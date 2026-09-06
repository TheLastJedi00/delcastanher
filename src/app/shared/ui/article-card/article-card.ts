import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Badge } from '../badge/badge';

@Component({
  selector: 'ui-article-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Badge],
  host: { class: 'block' },
  template: `
    <a
      [href]="link()"
      class="group flex flex-col gap-6 rounded-2xl border border-brand-navy/8 bg-white p-6 shadow-card transition-all duration-300 hover:shadow-card-hover hover:-translate-y-1 md:flex-row">
      @if (imageUrl()) {
        <img
          [src]="imageUrl()" [alt]="title()"
          class="h-40 w-full shrink-0 rounded-xl object-cover md:h-32 md:w-48" />
      }
      <span class="min-w-0">
        <span class="mb-2 block text-lg font-bold leading-snug text-brand-navy transition-colors group-hover:text-brand-teal md:text-xl">
          {{ title() }}
        </span>
        <span class="mb-4 block text-sm leading-relaxed text-slate-600">{{ summary() }}</span>
        <ui-badge variant="teal" [label]="'Leitura: ' + readTime()" />
      </span>
    </a>
  `,
})
export class ArticleCard {
  readonly title = input('');
  readonly summary = input('');
  readonly imageUrl = input('');
  readonly readTime = input('');
  readonly link = input('#');
}
