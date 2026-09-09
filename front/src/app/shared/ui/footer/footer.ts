import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DEFAULT_COURSE_SLUG } from '../../../core/mocks/courses.mock';
import { Logo } from '../logo/logo';

@Component({
  selector: 'ui-footer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Logo, RouterLink],
  host: { class: 'block mt-auto' },
  template: `
    <footer class="relative overflow-hidden bg-gradient-navy px-4 py-14 text-white">
      <span class="absolute inset-x-0 top-0 h-1 bg-gradient-teal" aria-hidden="true"></span>
      <span class="blob-teal -right-20 -top-20 h-64 w-64 bg-brand-teal-light/10" aria-hidden="true"></span>

      <div class="relative mx-auto flex max-w-6xl flex-col items-center justify-between gap-8 md:flex-row md:items-start">
        <div class="flex flex-col items-center gap-3 text-center md:items-start md:text-left">
          <ui-logo size="lg" variant="light" />
          <p class="text-sm text-white/70">Serviços Administrativos e Treinamentos</p>
        </div>

        <div class="flex flex-col items-center gap-4 md:items-end">
          <div class="flex flex-wrap justify-center gap-6">
            <a
              routerLink="/planos"
              class="text-sm font-semibold text-white transition-colors hover:text-brand-teal-light">
              Planos
            </a>
            <a
              [routerLink]="'/cursos/' + defaultCourseSlug"
              class="text-sm font-semibold text-white transition-colors hover:text-brand-teal-light">
              Imersão RH Estratégico
            </a>
          </div>

          <div class="flex flex-wrap justify-center gap-6">
            <a href="#" class="text-sm text-white/80 transition-colors hover:text-brand-teal-light">LinkedIn</a>
            <a href="#" class="text-sm text-white/80 transition-colors hover:text-brand-teal-light">Instagram</a>
            <a href="tel:+5547992908953" class="text-sm text-white/80 transition-colors hover:text-brand-teal-light">
              (47) 99290-8953
            </a>
          </div>
          <p class="text-xs text-white/50">© 2026 Delcastanher. Todos os direitos reservados.</p>
        </div>
      </div>
    </footer>
  `,
})
export class Footer {
  protected readonly defaultCourseSlug = DEFAULT_COURSE_SLUG;
}
