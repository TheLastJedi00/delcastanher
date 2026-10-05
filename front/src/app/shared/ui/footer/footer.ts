import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DEFAULT_COURSE_SLUG } from '../../../core/mocks/courses.mock';
import { LegalLinks } from '../legal-links/legal-links';
import { Logo } from '../logo/logo';

@Component({
  selector: 'ui-footer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Logo, RouterLink, LegalLinks],
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
            <!-- Spec 024, Task 2.2: perfis da Lidiane, sem os parâmetros de rastreamento do link compartilhado. -->
            <a
              href="https://www.linkedin.com/in/lidiane-delcastanher-5b2861153/"
              target="_blank"
              rel="noopener"
              class="text-sm text-white/80 transition-colors hover:text-brand-teal-light">
              LinkedIn
            </a>
            <a
              href="https://www.instagram.com/lidianedelcastanher/"
              target="_blank"
              rel="noopener"
              class="text-sm text-white/80 transition-colors hover:text-brand-teal-light">
              Instagram
            </a>
            <!-- Spec 024, Task 2.2: o mesmo número do "Falar no WhatsApp" do /planos. -->
            <a
              href="https://wa.me/5547992908953"
              target="_blank"
              rel="noopener"
              class="text-sm text-white/80 transition-colors hover:text-brand-teal-light">
              WhatsApp
            </a>
            <a href="tel:+5547992908953" class="text-sm text-white/80 transition-colors hover:text-brand-teal-light">
              (47) 99290-8953
            </a>
          </div>
          <!-- Links legais e revogacao de consentimento (Spec 009, decisao 10):
               o rodape e o unico lugar presente em toda a vitrine, entao e onde
               "rever preferencias" fica permanentemente ao alcance. -->
          <ui-legal-links tone="light" align="end" />

          <p class="text-xs text-white/50">© 2026 Delcastanher. Todos os direitos reservados.</p>
        </div>
      </div>
    </footer>
  `,
})
export class Footer {
  protected readonly defaultCourseSlug = DEFAULT_COURSE_SLUG;
}
