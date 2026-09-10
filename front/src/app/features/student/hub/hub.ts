import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProgressService } from '../../../core/services/progress.service';
import { UserService } from '../../../core/services/user.service';
import { AnimateOnScroll } from '../../../shared/directives/animate-on-scroll';
import { Button } from '../../../shared/ui/button/button';
import { GlassCard } from '../../../shared/ui/glass-card/glass-card';
import { PageContainer } from '../../../shared/ui/page-container/page-container';
import { ProgressBar } from '../../../shared/ui/progress-bar/progress-bar';
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
  imports: [
    RouterLink,
    PageContainer,
    SectionHeader,
    GlassCard,
    AnimateOnScroll,
    ProgressBar,
    Button,
  ],
  template: `
    <ui-page-container maxWidth="xl">
      <div class="mb-10">
        <ui-section-header
          [overline]="greeting()"
          title="Hub de Aprendizado"
          subtitle="O que você deseja fazer hoje?" />
      </div>

      <!--
        Meu curso -> Meu progresso -> Proxima aula. Este bloco e a razao de ser
        da Spec 008: o aluno abre o AVA e volta para o estudo em um clique, sem
        procurar onde parou.
      -->
      <section class="mb-10" aria-label="Retomar o curso">
        <ui-glass-card padding="lg">
          @if (loading()) {
            <p class="text-sm text-slate-500">Carregando seu progresso…</p>
          } @else if (error()) {
            <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p class="text-sm text-slate-600">{{ error() }}</p>
              <ui-button variant="outline" (click)="reload()">Tentar novamente</ui-button>
            </div>
          } @else {
            <div class="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div class="min-w-0 flex-1">
                <p class="mb-1 text-xs font-bold uppercase tracking-widest text-brand-teal-deep">
                  Meu curso
                </p>
                <h2 class="text-xl font-bold tracking-tight text-brand-navy md:text-2xl">
                  {{ courseTitle() }}
                </h2>

                <div class="mt-4 max-w-xl">
                  <ui-progress-bar
                    [value]="percentage()"
                    variant="gradient"
                    size="md"
                    [showLabel]="true"
                    label="Progresso no curso" />
                  <p class="mt-2 text-sm text-slate-500">{{ progressLabel() }}</p>
                </div>
              </div>

              <div class="shrink-0 lg:max-w-xs lg:text-right">
                <p class="mb-1 text-xs font-bold uppercase tracking-widest text-slate-500">
                  {{ nextLabel() }}
                </p>
                <p class="mb-4 text-base font-semibold text-brand-navy">{{ nextTitle() }}</p>
                <a [routerLink]="resumeLink()" class="inline-block">
                  <ui-button variant="primary">{{ resumeCta() }}</ui-button>
                </a>
              </div>
            </div>
          }
        </ui-glass-card>
      </section>

      <div class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        @for (card of cards(); track card.link; let i = $index) {
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
  private readonly users = inject(UserService);
  private readonly progressService = inject(ProgressService);

  /** Saudacao com o nome vindo do banco, preenchido no onboarding. */
  readonly greeting = computed(() => `Bem-vindo(a), ${this.users.displayName()}`);

  protected readonly loading = signal(true);
  protected readonly error = signal('');

  protected readonly percentage = this.progressService.percentage;
  protected readonly nextModule = this.progressService.nextModule;
  protected readonly courseCompleted = this.progressService.courseCompleted;

  protected readonly courseTitle = computed(
    () => this.progressService.course()?.title ?? 'Imersão RH Estratégico',
  );

  protected readonly progressLabel = computed(
    () =>
      `${this.progressService.completedCount()} de ${this.progressService.totalCount()} módulos concluídos`,
  );

  /** Com a trilha concluida o destaque deixa de ser "estude" e passa a ser "retire". */
  protected readonly nextLabel = computed(() =>
    this.courseCompleted() ? 'Curso concluído' : 'Próxima aula',
  );

  protected readonly nextTitle = computed(
    () => this.nextModule()?.title ?? 'Seu certificado está disponível',
  );

  protected readonly resumeCta = computed(() =>
    this.courseCompleted()
      ? 'Emitir certificado'
      : this.percentage() === 0
        ? 'Começar o curso'
        : 'Retomar curso',
  );

  /**
   * Deep-link do modulo em aberto. Sem progresso carregado cai na trilha
   * generica, que resolve o modulo por conta propria.
   */
  protected readonly resumeLink = computed(() => {
    if (this.courseCompleted()) {
      return '/ava/certificado';
    }

    const next = this.nextModule();

    return next ? `/ava/trilha/${next.id}` : '/ava/trilha';
  });

  /** O card de certificado so aparece depois da conclusao da trilha. */
  protected readonly cards = computed<HubCard[]>(() =>
    this.courseCompleted() ? [...BASE_CARDS, CERTIFICATE_CARD] : BASE_CARDS,
  );

  constructor() {
    this.reload();
  }

  protected reload(): void {
    this.loading.set(true);
    this.error.set('');

    this.progressService.load().subscribe({
      next: () => this.loading.set(false),
      error: (message: string) => {
        this.error.set(message);
        this.loading.set(false);
      },
    });
  }
}

const BASE_CARDS: HubCard[] = [
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

const CERTIFICATE_CARD: HubCard = {
  title: 'Meu Certificado',
  description: 'Visualize, imprima e compartilhe seu diploma.',
  link: '/ava/certificado',
  icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-.34-.014-.677-.042-1.01z',
};
