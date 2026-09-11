import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { AnalyticsService } from '../../../core/services/analytics.service';
import {
  ContentService,
  MaterialItem,
  PlaybackGrant,
  formatFileSize,
} from '../../../core/services/content.service';
import { ProgressModuleItem, ProgressService } from '../../../core/services/progress.service';
import { BackLink } from '../../../shared/ui/back-link/back-link';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { MaterialItem as MaterialItemComponent } from '../../../shared/ui/material-item/material-item';
import { ModuleCard } from '../../../shared/ui/module-card/module-card';
import { ProgressBar } from '../../../shared/ui/progress-bar/progress-bar';
import { PlayerState, VideoPlayer } from '../../../shared/ui/video-player/video-player';

/**
 * Trilha do aluno. Ate a Spec 008 os modulos e o avanco viviam aqui em signals
 * locais — iguais para todos e perdidos a cada F5. Agora a fonte e o
 * `ProgressService`, e o modulo aberto vem da rota (`/ava/trilha/:moduleId`),
 * o que torna a posicao do aluno compartilhavel e recuperavel.
 *
 * Desde a Spec 010 o video e real: o player recebe um token assinado por
 * modulo, e o fim da reproducao marca a conclusao (decisao 10).
 */
@Component({
  selector: 'app-trilha',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BackLink,
    Badge,
    Button,
    Card,
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
  private readonly analytics = inject(AnalyticsService);

  /** Ultimo modulo ja contado, para nao repetir o evento no mesmo modulo. */
  private lastTrackedModuleId: string | null = null;

  /** Modulo cujo conteudo ja foi pedido, para nao repetir a chamada. */
  private loadedContentModuleId: string | null = null;

  /** Modulo ja concluido automaticamente nesta sessao de tela. */
  private autoCompletedModuleId: string | null = null;

  readonly modules = this.progressService.modules;
  readonly progress = this.progressService.percentage;
  readonly courseCompleted = this.progressService.courseCompleted;

  readonly loading = signal(true);
  readonly error = signal('');
  readonly saving = signal(false);

  readonly showMobileModules = signal(false);

  readonly materials = signal<MaterialItem[]>([]);
  readonly playback = signal<PlaybackGrant | null>(null);
  readonly playbackLoading = signal(false);

  /** Modulo pedido na URL; nulo em `/ava/trilha`. */
  private readonly routeModuleId = toSignal(
    this.route.paramMap.pipe(map(params => params.get('moduleId'))),
    { initialValue: null },
  );

  /**
   * Modulo em foco. Sem parametro na URL abre o modulo em aberto do aluno; com
   * um id que nao existe cai no primeiro da trilha, em vez de tela vazia.
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
   * O que o player deve mostrar. Os tres casos sao distintos de proposito: sem
   * video, em processamento e pronto — abrir o play nos dois primeiros levaria
   * o aluno a um erro que nao e dele.
   */
  readonly playerState = computed<PlayerState>(() => {
    const active = this.activeModule();

    if (!active || !active.hasVideo) {
      return 'unavailable';
    }

    if (this.playbackLoading()) {
      return 'loading';
    }

    return this.playback() ? 'ready' : 'unavailable';
  });

  constructor() {
    this.reload();

    // `lesson_started` mora aqui, e nao no `ui-video-player`: o player e
    // componente de apresentacao reutilizavel e nao sabe em que modulo esta.
    // O disparo acompanha o modulo em foco — o mesmo id nao conta duas vezes
    // quando a trilha recarrega o progresso.
    effect(() => {
      const active = this.activeModule();

      if (!active || active.id === this.lastTrackedModuleId) {
        return;
      }

      this.lastTrackedModuleId = active.id;
      this.analytics.track('lesson_started', {
        module_id: active.id,
        module_title: active.title,
      });
    });

    // Conteudo do modulo em foco: token de playback e materiais, uma vez por
    // modulo. Sem a guarda, cada recarga do progresso pediria um token novo.
    effect(() => {
      const active = this.activeModule();

      if (!active || active.id === this.loadedContentModuleId) {
        return;
      }

      this.loadedContentModuleId = active.id;
      this.loadContent(active);
    });
  }

  /** Tamanho legivel do material, no mesmo formato das outras telas. */
  sizeLabel(bytes: number): string {
    return formatFileSize(bytes);
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

  /** Navega em vez de guardar selecao local: a URL e que manda no modulo aberto. */
  setActiveModule(id: string): void {
    this.showMobileModules.set(false);
    void this.router.navigate(['/ava/trilha', id]);
  }

  toggleMobileModules(): void {
    this.showMobileModules.update(open => !open);
  }

  /** Persiste a conclusao: a API responde com o progresso ja recalculado. */
  toggleCompleted(): void {
    const active = this.activeModule();

    if (!active || this.saving()) {
      return;
    }

    this.setCompletion(active.id, !active.completed);
  }

  /**
   * Fim do video. Marca o modulo pela **mesma** porta do botao manual — a
   * Spec 008 ja definiu `PATCH /progress/me/modules/:moduleId` como o unico
   * caminho da conclusao, e um gatilho automatico nao justifica um segundo
   * (decisao 10). Nunca desmarca: assistir de novo nao desfaz a conclusao.
   */
  onVideoEnded(): void {
    const active = this.activeModule();

    if (!active || active.completed || this.autoCompletedModuleId === active.id) {
      return;
    }

    this.autoCompletedModuleId = active.id;
    this.setCompletion(active.id, true);
  }

  private setCompletion(moduleId: string, completed: boolean): void {
    this.saving.set(true);
    this.error.set('');

    this.progressService.setModuleCompletion(moduleId, completed).subscribe({
      next: () => this.saving.set(false),
      error: (message: string) => {
        this.error.set(message);
        this.saving.set(false);
      },
    });
  }

  private loadContent(module: ProgressModuleItem): void {
    this.playback.set(null);
    this.materials.set([]);

    this.content.materialsOf(module.id).subscribe({
      next: materials => this.materials.set(materials),
      // Material que nao carregou nao derruba a aula: o video e o conteudo.
      error: () => this.materials.set([]),
    });

    if (!module.hasVideo) {
      return;
    }

    this.playbackLoading.set(true);

    this.content.playback(module.id).subscribe({
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
