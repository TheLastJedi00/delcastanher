import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Avatar } from '../avatar/avatar';
import { Button } from '../button/button';
import { Logo } from '../logo/logo';

export interface NavLink {
  label: string;
  /** Ancora dentro da propria pagina (ex.: `#metodo`). */
  href: string;
  /**
   * Rota interna do app (ex.: `/planos`). Quando presente, o link navega pelo
   * router em vez de recarregar a pagina inteira — o `href` continua servindo
   * de fallback para as ancoras.
   */
  routerLink?: string;
}

@Component({
  selector: 'ui-nav-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Logo, Avatar, Button],
  host: {
    class: 'sticky top-0 z-40 block',
    '(window:scroll)': 'onScroll()',
  },
  template: `
    <nav [class]="navClasses()">
      <div [class]="innerClasses()">
        <!-- Esquerda: hamburger (app/admin) + logo -->
        <div class="flex min-w-0 items-center gap-3">
          @if (variant() !== 'landing') {
            <button
              type="button"
              class="rounded-lg p-1 text-slate-500 transition-colors hover:text-brand-navy md:hidden"
              aria-label="Abrir menu de navegação"
              (click)="menuToggle.emit()">
              <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          }

          <a [routerLink]="homeLink()" class="flex min-w-0 items-center gap-2 transition-opacity hover:opacity-80">
            <ui-logo [size]="variant() === 'landing' ? 'md' : 'sm'" />
            @if (label()) {
              <span class="hidden truncate text-sm font-bold text-brand-navy sm:block">{{ label() }}</span>
            }
          </a>
        </div>

        <!-- Centro: navegacao da landing -->
        @if (variant() === 'landing' && navLinks().length) {
          <div class="hidden items-center gap-8 md:flex">
            @for (item of navLinks(); track item.href) {
              @if (item.routerLink) {
                <a
                  [routerLink]="item.routerLink"
                  class="group relative text-sm font-medium text-slate-500 transition-colors hover:text-brand-teal-deep">
                  {{ item.label }}
                  <span
                    class="absolute -bottom-1 left-0 h-[2px] w-0 rounded-full bg-gradient-teal transition-all duration-300 group-hover:w-full"
                    aria-hidden="true"></span>
                </a>
              } @else {
                <a
                  [href]="item.href"
                  class="group relative text-sm font-medium text-slate-500 transition-colors hover:text-brand-teal-deep">
                  {{ item.label }}
                  <span
                    class="absolute -bottom-1 left-0 h-[2px] w-0 rounded-full bg-gradient-teal transition-all duration-300 group-hover:w-full"
                    aria-hidden="true"></span>
                </a>
              }
            }
          </div>
        }

        <!-- Direita: acoes -->
        <div class="flex items-center gap-3">
          @if (variant() === 'landing') {
            <a routerLink="/login">
              <ui-button variant="primary" size="sm">Área do Aluno</ui-button>
            </a>
          } @else {
            @if (userName()) {
              <span class="hidden text-sm font-medium text-slate-500 sm:block">{{ userName() }}</span>
            }
            <ui-avatar [initials]="userInitials()" size="sm" />
            @if (variant() === 'admin') {
              <a routerLink="/login" (click)="logout.emit()">
                <ui-button variant="ghost" size="sm">Sair</ui-button>
              </a>
            }
          }
        </div>
      </div>
    </nav>
  `,
})
export class NavHeader {
  readonly variant = input<'landing' | 'app' | 'admin'>('landing');
  readonly label = input('');
  readonly homeLink = input('/');
  readonly userName = input('');
  readonly userInitials = input('');
  readonly navLinks = input<NavLink[]>([]);

  readonly menuToggle = output<void>();
  readonly logout = output<void>();

  private readonly scrolled = signal(false);

  protected onScroll() {
    this.scrolled.set(window.scrollY > 8);
  }

  protected readonly navClasses = computed(() => {
    // Landing comeca transparente e ganha o vidro ao rolar; app/admin ja nascem em vidro.
    const glass = this.variant() !== 'landing' || this.scrolled();
    return [
      'w-full transition-all duration-300',
      glass ? 'glass' : 'bg-transparent border-b border-transparent',
    ].join(' ');
  });

  protected readonly innerClasses = computed(() =>
    [
      'flex items-center justify-between gap-4',
      this.variant() === 'landing' ? 'mx-auto max-w-6xl px-4 py-4' : 'h-[65px] px-4 md:px-6',
    ].join(' ')
  );
}
