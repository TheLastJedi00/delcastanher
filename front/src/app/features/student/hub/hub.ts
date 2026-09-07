import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AnimateOnScroll } from '../../../shared/directives/animate-on-scroll';
import { GlassCard } from '../../../shared/ui/glass-card/glass-card';
import { PageContainer } from '../../../shared/ui/page-container/page-container';
import { SectionHeader } from '../../../shared/ui/section-header/section-header';

interface HubCard {
  title: string;
  description: string;
  link: string;
  icon: string;
}

@Component({
  selector: 'app-hub',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, PageContainer, SectionHeader, GlassCard, AnimateOnScroll],
  template: `
    <ui-page-container maxWidth="xl">
      <div class="mb-10">
        <ui-section-header
          overline="Bem-vindo(a), Lidiane"
          title="Hub de Aprendizado"
          subtitle="O que você deseja fazer hoje?" />
      </div>

      <div class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        @for (card of cards; track card.link; let i = $index) {
          <a [routerLink]="card.link" class="block h-full" animateOnScroll="animate-fade-in-up" [animateDelay]="i * 100">
            <ui-glass-card padding="lg">
              <div class="flex h-full flex-col items-center text-center">
                <span class="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-brand text-white shadow-glow-teal">
                  <svg class="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" [attr.d]="card.icon" />
                  </svg>
                </span>
                <h2 class="mb-2 text-lg font-semibold text-brand-navy">{{ card.title }}</h2>
                <p class="text-sm leading-relaxed text-slate-500">{{ card.description }}</p>
              </div>
            </ui-glass-card>
          </a>
        }
      </div>
    </ui-page-container>
  `,
})
export class Hub {
  readonly cards: HubCard[] = [
    {
      title: 'Meu Perfil',
      description: 'Atualize seus dados pessoais e preferências.',
      link: '/ava/perfil',
      icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
    },
    {
      title: 'Trilha de Estudos',
      description: 'Continue de onde parou. Acesso aos 12 módulos.',
      link: '/ava/trilha',
      icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
    },
    {
      title: 'Materiais de Apoio',
      description: 'Baixe planilhas, PDFs e ferramentas práticas.',
      link: '/ava/materiais',
      icon: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4',
    },
    {
      title: 'Artigos',
      description: 'Leituras complementares sobre gestão e RH.',
      link: '/ava/artigos',
      icon: 'M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z',
    },
  ];
}
