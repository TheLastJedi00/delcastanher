import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type FileType = 'pdf' | 'xls' | 'doc';

const TYPE_STYLES: Record<FileType, string> = {
  pdf: 'bg-state-danger/10 text-state-danger',
  xls: 'bg-state-success/10 text-state-success',
  doc: 'bg-brand-navy/10 text-brand-navy',
};

@Component({
  selector: 'ui-material-item',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <a
      [href]="downloadUrl()"
      class="group flex items-center gap-4 rounded-xl border border-brand-navy/12 bg-white/60 p-4 transition-all duration-200 hover:border-brand-teal hover:shadow-card-hover hover:-translate-y-0.5">
      <span [class]="iconClasses()">{{ fileType().toUpperCase() }}</span>
      <span class="min-w-0">
        <span class="block truncate text-sm font-bold text-brand-navy transition-colors group-hover:text-brand-teal-deep">
          {{ fileName() }}
        </span>
        <span class="block text-xs text-slate-500">{{ meta() }}</span>
      </span>
      <svg
        class="ml-auto w-4 h-4 shrink-0 text-slate-500 transition-all duration-200 group-hover:text-brand-teal-deep group-hover:translate-y-0.5"
        fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
    </a>
  `,
})
export class MaterialItem {
  readonly fileName = input('');
  readonly fileType = input<FileType>('pdf');
  readonly fileSize = input('');
  readonly moduleLabel = input('');
  readonly downloadUrl = input('#');

  protected readonly iconClasses = computed(
    () =>
      `flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[11px] font-extrabold ${TYPE_STYLES[this.fileType()]}`
  );

  protected readonly meta = computed(() =>
    [this.moduleLabel(), this.fileSize()].filter(Boolean).join(' • ')
  );
}
