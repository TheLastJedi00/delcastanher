import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Chaves de icone suportadas pela sidebar. */
export type SidebarIcon =
  | 'home' | 'user' | 'book' | 'download' | 'article'
  | 'logout' | 'grid' | 'play' | 'mail' | 'document';

const PATHS: Record<SidebarIcon, string> = {
  home: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
  user: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
  book: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
  download: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4',
  article: 'M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z',
  logout: 'M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1',
  grid: 'M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z',
  play: 'M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664zM21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  mail: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
  document: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
};

@Component({
  selector: 'ui-sidebar-link',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <span [class]="classes()" [attr.title]="expanded() ? null : label()">
      @if (active()) {
        <span class="absolute inset-y-1 left-0 w-[3px] rounded-r-full bg-gradient-teal" aria-hidden="true"></span>
      }
      <svg class="h-6 w-6 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" [attr.d]="path()" />
      </svg>
      @if (expanded()) {
        <span class="animate-fade-in whitespace-nowrap overflow-hidden">{{ label() }}</span>
      }
    </span>
  `,
})
export class SidebarLink {
  readonly icon = input<SidebarIcon>('home');
  readonly label = input('');
  readonly active = input(false);
  readonly expanded = input(true);
  readonly variant = input<'dark' | 'light'>('dark');
  readonly danger = input(false);

  protected readonly path = computed(() => PATHS[this.icon()]);

  protected readonly classes = computed(() => {
    const dark = this.variant() === 'dark';
    return [
      'relative flex items-center gap-4 rounded-xl p-2.5 text-sm font-medium transition-all duration-200',
      this.expanded() ? '' : 'justify-center',
      this.danger()
        ? dark
          ? 'text-red-300 hover:bg-red-500/20 hover:text-red-200'
          : 'text-state-danger hover:bg-state-danger/10'
        : dark
          ? this.active()
            ? 'bg-white/10 text-white'
            : 'text-white/80 hover:bg-white/10 hover:text-white'
          : this.active()
            ? 'bg-brand-teal/5 text-brand-teal'
            : 'text-brand-steel hover:bg-brand-teal/5 hover:text-brand-teal',
    ]
      .filter(Boolean)
      .join(' ');
  });
}
