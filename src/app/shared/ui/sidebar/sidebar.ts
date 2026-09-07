import { ChangeDetectionStrategy, Component, computed, input, model, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { Logo } from '../logo/logo';
import { SidebarIcon, SidebarLink } from '../sidebar-link/sidebar-link';

export interface SidebarNavItem {
  /** Identificador usado quando o item controla uma aba em vez de uma rota. */
  id?: string;
  icon: SidebarIcon;
  label: string;
  /** Rota de destino. Quando ausente, o item se comporta como aba. */
  link?: string;
  /** Marca o routerLinkActive como exato (usado no item raiz). */
  exact?: boolean;
}

@Component({
  selector: 'ui-sidebar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, Logo, SidebarLink],
  template: `
    <!-- Overlay do drawer mobile -->
    <div
      class="fixed inset-0 z-40 bg-brand-navy/50 backdrop-blur-sm transition-opacity duration-300 md:hidden"
      [class.opacity-0]="!expanded()"
      [class.pointer-events-none]="!expanded()"
      [class.opacity-100]="expanded()"
      (click)="expanded.set(false)"
      aria-hidden="true"></div>

    <aside [class]="asideClasses()">
      <!-- Cabecalho: logo + toggle -->
      <div
        class="flex h-[65px] shrink-0 items-center gap-2 px-3"
        [class.justify-between]="expanded()"
        [class.justify-center]="!expanded()"
        [class.border-white/10]="variant() === 'dark'"
        [class.border-brand-navy/8]="variant() === 'light'"
        [class.border-b]="true">
        @if (expanded()) {
          <a [routerLink]="homeLink()" class="flex min-w-0 items-center gap-2">
            <ui-logo size="sm" [variant]="variant() === 'dark' ? 'light' : 'default'" />
            <span class="truncate text-sm font-bold" [class.text-white]="variant() === 'dark'" [class.text-brand-navy]="variant() === 'light'">
              {{ title() }}
            </span>
          </a>
        }
        <button
          type="button"
          (click)="expanded.set(!expanded())"
          [attr.aria-label]="expanded() ? 'Recolher menu' : 'Expandir menu'"
          [attr.aria-expanded]="expanded()"
          [class]="toggleClasses()">
          <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>

      <!-- Navegacao -->
      <nav class="flex flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden p-2">
        @for (item of links(); track item.label) {
          @if (item.link) {
            <a
              [routerLink]="item.link"
              routerLinkActive
              #rla="routerLinkActive"
              [routerLinkActiveOptions]="{ exact: !!item.exact }"
              (click)="closeOnMobile()">
              <ui-sidebar-link
                [icon]="item.icon"
                [label]="item.label"
                [expanded]="expanded()"
                [variant]="variant()"
                [active]="rla.isActive" />
            </a>
          } @else {
            <button type="button" (click)="onSelect(item)" class="text-left">
              <ui-sidebar-link
                [icon]="item.icon"
                [label]="item.label"
                [expanded]="expanded()"
                [variant]="variant()"
                [active]="activeId() === item.id" />
            </button>
          }
        }
      </nav>

      <!-- Sair -->
      <div class="shrink-0 border-t p-2" [class.border-white/10]="variant() === 'dark'" [class.border-brand-navy/8]="variant() === 'light'">
        <a routerLink="/login" (click)="closeOnMobile()">
          <ui-sidebar-link icon="logout" label="Sair" [expanded]="expanded()" [variant]="variant()" [danger]="true" />
        </a>
      </div>
    </aside>
  `,
})
export class Sidebar {
  readonly variant = input<'dark' | 'light'>('dark');
  readonly links = input<SidebarNavItem[]>([]);
  readonly title = input('Menu');
  readonly homeLink = input('/');
  readonly activeId = input('');
  readonly expanded = model(false);

  readonly select = output<string>();

  protected readonly asideClasses = computed(() =>
    [
      'fixed inset-y-0 left-0 z-50 flex h-full flex-col shadow-glass-lg transition-all duration-300 md:relative md:translate-x-0',
      this.variant() === 'dark' ? 'glass-dark bg-gradient-navy' : 'glass bg-white',
      this.expanded() ? 'w-64 translate-x-0' : 'w-16 -translate-x-full md:translate-x-0',
    ].join(' ')
  );

  protected readonly toggleClasses = computed(() =>
    [
      'rounded-lg p-1.5 transition-colors',
      this.variant() === 'dark' ? 'text-white hover:bg-white/10' : 'text-brand-navy hover:bg-brand-teal/5',
    ].join(' ')
  );

  protected onSelect(item: SidebarNavItem) {
    this.select.emit(item.id ?? item.label);
    this.closeOnMobile();
  }

  protected closeOnMobile() {
    if (window.innerWidth < 768) {
      this.expanded.set(false);
    }
  }
}
