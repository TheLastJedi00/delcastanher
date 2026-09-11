import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { ProgressModuleItem, ProgressService } from '../../../core/services/progress.service';
import { BackLink } from '../../../shared/ui/back-link/back-link';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { MaterialItem, FileType } from '../../../shared/ui/material-item/material-item';
import { ModuleCard } from '../../../shared/ui/module-card/module-card';
import { ProgressBar } from '../../../shared/ui/progress-bar/progress-bar';
import { VideoPlayer } from '../../../shared/ui/video-player/video-player';

interface Material {
  fileName: string;
  fileType: FileType;
  fileSize: string;
}

/**
 * Trilha do aluno. Ate a Spec 008 os modulos e o avanco viviam aqui em signals
 * locais — iguais para todos e perdidos a cada F5. Agora a fonte e o
 * `ProgressService`, e o modulo aberto vem da rota (`/ava/trilha/:moduleId`),
 * o que torna a posicao do aluno compartilhavel e recuperavel.
 */
@Component({
  selector: 'app-trilha',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BackLink,
    Badge,
    Button,
    Card,
    MaterialItem,
    ModuleCard,
    ProgressBar,
    RouterLink,
    VideoPlayer,
  ],
  templateUrl: './trilha.html',
})
export class Trilha {
  private readonly progressService = inject(ProgressService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly modules = this.progressService.modules;
  readonly progress = this.progressService.percentage;
  readonly courseCompleted = this.progressService.courseCompleted;

  readonly loading = signal(true);
  readonly error = signal('');
  readonly saving = signal(false);

  readonly showMobileModules = signal(false);

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

  readonly materials: Material[] = [
    { fileName: 'Apresentação da Aula', fileType: 'pdf', fileSize: '2.4 MB' },
    { fileName: 'Checklist de Diagnóstico', fileType: 'xls', fileSize: '850 KB' },
  ];

  constructor() {
    this.reload();
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

    this.saving.set(true);
    this.error.set('');

    this.progressService.setModuleCompletion(active.id, !active.completed).subscribe({
      next: () => this.saving.set(false),
      error: (message: string) => {
        this.error.set(message);
        this.saving.set(false);
      },
    });
  }
}
