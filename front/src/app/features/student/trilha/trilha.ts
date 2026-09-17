import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { AnalyticsService } from '../../../core/services/analytics.service';
import { CertificateService, StudentCertificate } from '../../../core/services/certificate.service';
import {
  ContentService,
  MaterialItem,
  PlaybackGrant,
  formatDuration,
  formatFileSize,
  lessonCountLabel,
} from '../../../core/services/content.service';
import {
  ProgressLessonItem,
  ProgressModuleItem,
  ProgressService,
} from '../../../core/services/progress.service';
import { StoreService } from '../../../core/services/store.service';
import { BackLink } from '../../../shared/ui/back-link/back-link';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { LessonTrack } from '../../../shared/ui/lesson-track/lesson-track';
import { MaterialItem as MaterialItemComponent } from '../../../shared/ui/material-item/material-item';
import { ModuleCard } from '../../../shared/ui/module-card/module-card';
import { ProgressBar } from '../../../shared/ui/progress-bar/progress-bar';
import { PlayerState, VideoPlayer } from '../../../shared/ui/video-player/video-player';

/**
 * Trilha do aluno. Ate a Spec 008 os modulos e o avanco viviam aqui em signals
 * locais — iguais para todos e perdidos a cada F5. Agora a fonte e o
 * `ProgressService`, e a posicao vem da rota, o que a torna compartilhavel e
 * recuperavel.
 *
 * Desde a Spec 010 o video e real: o player recebe um token assinado, e o fim
 * da reproducao marca a conclusao. Desde a Spec 012 o que se assiste e uma
 * **aula** — o modulo virou container, a rota e
 * `/ava/trilha/:moduleId/:lessonId` e a navegacao entre aulas e a trilha
 * horizontal (decisoes 8 e 9).
 */
@Component({
  selector: 'app-trilha',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BackLink,
    Badge,
    Button,
    Card,
    LessonTrack,
    MaterialItemComponent,
    ModuleCard,
    ProgressBar,
    RouterLink,
    VideoPlayer,
  ],
  templateUrl: './trilha.html',
})
export class Trilha {
  private readonly progressService = inject(ProgressService);
  private readonly content = inject(ContentService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly store = inject(StoreService);
  private readonly analytics = inject(AnalyticsService);
  private readonly certificates = inject(CertificateService);

  /** Ultima aula ja contada, para nao repetir o evento na mesma aula. */
  private lastTrackedLessonId: string | null = null;

  /** Aula cujo conteudo ja foi pedido, para nao repetir a chamada. */
  private loadedContentLessonId: string | null = null;

  /** Aula ja concluida automaticamente nesta sessao de tela. */
  private autoCompletedLessonId: string | null = null;

  readonly modules = this.progressService.modules;
  readonly progress = this.progressService.percentage;
  readonly courseCompleted = this.progressService.courseCompleted;
  readonly completedCount = this.progressService.completedCount;
  readonly totalCount = this.progressService.totalCount;

  readonly loading = signal(true);
  readonly error = signal('');
  readonly saving = signal(false);

  readonly showMobileModules = signal(false);

  readonly materials = signal<MaterialItem[]>([]);
  readonly issuingCertificate = signal(false);
  readonly playback = signal<PlaybackGrant | null>(null);
  readonly playbackLoading = signal(false);

  /** Modulo pedido na URL; nulo em `/ava/trilha`. */
  private readonly routeModuleId = toSignal(
    this.route.paramMap.pipe(map(params => params.get('moduleId'))),
    { initialValue: null },
  );

  /** Aula pedida na URL; nula nas duas formas curtas da rota. */
  private readonly routeLessonId = toSignal(
    this.route.paramMap.pipe(map(params => params.get('lessonId'))),
    { initialValue: null },
  );

  /**
   * Modulo em foco. Sem parametro na URL abre o modulo da proxima aula em
   * aberto do aluno; com um id que nao existe cai no primeiro da trilha, em
   * vez de tela vazia.
   */
  readonly activeModule = computed<ProgressModuleItem | null>(() => {
    const list = this.modules();

    if (list.length === 0) {
      return null;
    }

    const wanted = this.routeModuleId();
    const found = wanted ? list.find(module => module.id === wanted) : undefined;

    return found ?? this.progressService.nextModule() ?? list[0];
  });

  /**
   * Aula em foco dentro do modulo. A URL manda; um `lessonId` que nao pertence
   * ao modulo da rota e ignorado, e nao quebra a tela (decisao 9).
   */
  readonly activeLesson = computed<ProgressLessonItem | null>(() => {
    const module = this.activeModule();

    if (!module || module.lessons.length === 0) {
      return null;
    }

    const wanted = this.routeLessonId();
    const found = wanted ? module.lessons.find(lesson => lesson.id === wanted) : undefined;

    return found ?? module.nextLesson ?? module.lessons[0];
  });

  /** Aula seguinte na sequencia da trilha, atravessando a fronteira do modulo. */
  readonly nextInTrack = computed<{ moduleId: string; lesson: ProgressLessonItem } | null>(() => {
    const module = this.activeModule();
    const lesson = this.activeLesson();

    if (!module || !lesson) {
      return null;
    }

    const index = module.lessons.findIndex(item => item.id === lesson.id);
    const withinModule = module.lessons[index + 1];

    if (withinModule) {
      return { moduleId: module.id, lesson: withinModule };
    }

    const modules = this.modules();
    const moduleIndex = modules.findIndex(item => item.id === module.id);
    const nextModule = modules.slice(moduleIndex + 1).find(item => item.lessons.length > 0);

    return nextModule ? { moduleId: nextModule.id, lesson: nextModule.lessons[0] } : null;
  });

  /**
   * O que o player deve mostrar. Os tres casos sao distintos de proposito: sem
   * video, em processamento e pronto — abrir o play nos dois primeiros levaria
   * o aluno a um erro que nao e dele.
   */
  readonly playerState = computed<PlayerState>(() => {
    const active = this.activeLesson();

    if (!active || !active.hasVideo) {
      return 'unavailable';
    }

    if (this.playbackLoading()) {
      return 'loading';
    }

    return this.playback() ? 'ready' : 'unavailable';
  });

  /**
   * Diploma deste modulo, se ja emitido. O da trilha inteira continua sendo
   * outro documento, em `/ava/certificado` (Spec 010, decisao 11).
   */
  readonly moduleCertificate = computed<StudentCertificate | null>(() => {
    const active = this.activeModule();

    if (!active) {
      return null;
    }

    return (
      this.certificates.moduleCertificates().find(item => item.moduleId === active.id) ?? null
    );
  });

  constructor() {
    this.reload();

    // Os diplomas de modulo ja emitidos: sem eles a tela ofereceria "emitir"
    // para um modulo que o aluno ja certificou.
    this.certificates.loadModuleCertificates().subscribe({ error: () => undefined });

    // `lesson_started` mora aqui, e nao no `ui-video-player`: o player e
    // componente de apresentacao reutilizavel e nao sabe em que aula esta.
    // Desde a Spec 012 o evento finalmente acompanha uma aula de verdade
    // (decisao 21) — o mesmo id nao conta duas vezes quando a trilha recarrega
    // o progresso.
    effect(() => {
      const module = this.activeModule();
      const lesson = this.activeLesson();

      if (!module || !lesson || lesson.id === this.lastTrackedLessonId) {
        return;
      }

      this.lastTrackedLessonId = lesson.id;
      this.analytics.track('lesson_started', {
        module_id: module.id,
        module_title: module.title,
        lesson_id: lesson.id,
        lesson_title: lesson.title,
      });
    });

    // Conteudo da aula em foco: token de playback e materiais, uma vez por
    // aula. Sem a guarda, cada recarga do progresso pediria um token novo.
    effect(() => {
      const active = this.activeLesson();

      if (!active || active.id === this.loadedContentLessonId) {
        return;
      }

      this.loadedContentLessonId = active.id;
      this.loadContent(active);
    });
  }

  /** Tamanho legivel do material, no mesmo formato das outras telas. */
  sizeLabel(bytes: number): string {
    return formatFileSize(bytes);
  }

  /** "1 aula" ou "N aulas": os modulos migrados tem uma aula so. */
  lessonsLabel(total: number): string {
    return lessonCountLabel(total);
  }

  /** Duracao legivel da aula, no mesmo formato da trilha horizontal. */
  durationLabel(seconds: number | null): string {
    return formatDuration(seconds);
  }

  reload(): void {
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

  /** Navega em vez de guardar selecao local: a URL e que manda na posicao. */
  setActiveModule(id: string): void {
    this.showMobileModules.set(false);
    void this.router.navigate(['/ava/trilha', id]);
  }

  /**
   * Leva para a loja com o modulo ja selecionado (Spec 014, decisao 17).
   *
   * A trilha e a melhor vitrine que a plataforma tem: o aluno esta olhando
   * exatamente o conteudo que nao abriu, e o caminho ate a compra e um clique
   * — sem obriga-lo a reencontrar o modulo em uma lista.
   */
  buyModule(moduleId: string): void {
    this.store.select(moduleId);
    void this.router.navigate(['/loja']);
  }

  /** Salta para uma aula do modulo em foco, ou de outro modulo informado. */
  setActiveLesson(lessonId: string, moduleId?: string): void {
    const module = moduleId ?? this.activeModule()?.id;

    if (!module) {
      return;
    }

    this.showMobileModules.set(false);
    void this.router.navigate(['/ava/trilha', module, lessonId]);
  }

  /** Botao "Próxima aula": quem avança e o aluno, nunca um autoplay (decisao 12). */
  goToNextLesson(): void {
    const next = this.nextInTrack();

    if (next) {
      this.setActiveLesson(next.lesson.id, next.moduleId);
    }
  }

  toggleMobileModules(): void {
    this.showMobileModules.update(open => !open);
  }

  /** Persiste a conclusao: a API responde com o progresso ja recalculado. */
  toggleCompleted(): void {
    const active = this.activeLesson();

    if (!active || this.saving()) {
      return;
    }

    this.setCompletion(active.id, !active.completed);
  }

  /**
   * Fim do video. Marca a aula pela **mesma** porta do botao manual — desde a
   * Spec 012 `PATCH /progress/me/lessons/:lessonId` e o unico caminho da
   * conclusao (decisao 5), e um gatilho automatico nao justifica um segundo.
   * Nunca desmarca: assistir de novo nao desfaz a conclusao. E nao avanca
   * sozinho para a aula seguinte (decisao 12).
   */
  onVideoEnded(): void {
    const active = this.activeLesson();

    if (!active || active.completed || this.autoCompletedLessonId === active.id) {
      return;
    }

    this.autoCompletedLessonId = active.id;
    this.setCompletion(active.id, true);
  }

  /** Emite o diploma do modulo em foco, com todas as aulas dele concluidas. */
  issueModuleCertificate(): void {
    const active = this.activeModule();

    if (!active || !active.completed || this.issuingCertificate()) {
      return;
    }

    this.issuingCertificate.set(true);
    this.error.set('');

    this.certificates.issueForModule(active.id).subscribe({
      next: () => this.issuingCertificate.set(false),
      error: (message: string) => {
        this.error.set(message);
        this.issuingCertificate.set(false);
      },
    });
  }

  private setCompletion(lessonId: string, completed: boolean): void {
    this.saving.set(true);
    this.error.set('');

    this.progressService.setLessonCompletion(lessonId, completed).subscribe({
      next: () => this.saving.set(false),
      error: (message: string) => {
        this.error.set(message);
        this.saving.set(false);
      },
    });
  }

  private loadContent(lesson: ProgressLessonItem): void {
    this.playback.set(null);
    this.materials.set([]);

    this.content.materialsOf(lesson.id).subscribe({
      next: materials => this.materials.set(materials),
      // Material que nao carregou nao derruba a aula: o video e o conteudo.
      error: () => this.materials.set([]),
    });

    if (!lesson.hasVideo) {
      return;
    }

    this.playbackLoading.set(true);

    this.content.playback(lesson.id).subscribe({
      next: grant => {
        this.playback.set(grant);
        this.playbackLoading.set(false);
      },
      error: (message: string) => {
        this.error.set(message);
        this.playbackLoading.set(false);
      },
    });
  }
}
