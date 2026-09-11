import { ChangeDetectionStrategy, Component, OnDestroy, computed, inject, signal } from '@angular/core';
import {
  AdminContentService,
  AdminModule,
  MaterialItem,
  ModuleVideoState,
  VideoStatus,
} from '../../../core/services/admin-content.service';
import { formatFileSize } from '../../../core/services/content.service';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ProgressBar } from '../../../shared/ui/progress-bar/progress-bar';
import { SectionHeader } from '../../../shared/ui/section-header/section-header';

/** Intervalo entre consultas enquanto o Mux processa o video. */
const POLL_MS = 5000;

/** Rotulo e cor de cada estagio, para o admin nao ler o enum cru. */
const STATUS_LABEL: Record<VideoStatus, string> = {
  PENDING: 'Aguardando',
  PROCESSING: 'Processando',
  READY: 'Pronto',
  ERRORED: 'Falhou',
};

const STATUS_VARIANT: Record<VideoStatus, 'teal' | 'success' | 'danger'> = {
  PENDING: 'teal',
  PROCESSING: 'teal',
  READY: 'success',
  ERRORED: 'danger',
};

/**
 * Gestao de Aulas: envio real do video e dos materiais de um modulo.
 *
 * Ate a Spec 010 esta aba era mock — um campo de "URL do Vídeo (Vimeo/YouTube)"
 * e uma area de arraste que nao enviava nada. Ela e evoluida no lugar (decisao
 * 14), e nao substituida por uma segunda tela de administracao de conteudo.
 *
 * Nao ha CRUD de modulo aqui de proposito (fora de escopo): os 12 modulos vem
 * do seed da Spec 008, e o que esta aba faz e pendurar conteudo neles.
 */
@Component({
  selector: 'app-admin-aulas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Badge, Button, Card, ProgressBar, SectionHeader],
  template: `
    <div class="mb-6">
      <ui-section-header overline="Conteúdo" title="Gestão de Aulas" />
    </div>

    @if (error()) {
      <div class="mb-6 rounded-xl border border-state-danger/30 bg-state-danger/5 p-4" role="alert">
        <p class="text-sm text-slate-700">{{ error() }}</p>
      </div>
    }

    <ui-card variant="default" padding="lg" [hover]="false">
      <div class="md:w-2/3">
        <label
          for="admin-modulo"
          class="mb-2 block text-xs font-bold uppercase tracking-widest text-slate-500">
          Módulo
        </label>
        <select
          id="admin-modulo"
          [value]="selectedId() ?? ''"
          (change)="selectModule($any($event.target).value)"
          class="w-full rounded-xl border border-brand-navy/10 bg-white/80 px-4 py-2.5 text-sm text-slate-800 outline-none transition-all duration-200 focus:border-brand-teal focus:ring-2 focus:ring-brand-teal/20">
          @if (modules().length === 0) {
            <option value="">Carregando módulos…</option>
          }
          @for (module of modules(); track module.id) {
            <option [value]="module.id">{{ module.order }}. {{ module.title }}</option>
          }
        </select>
      </div>
    </ui-card>

    @if (selectedId()) {
      <div class="mt-6">
        <ui-card variant="default" padding="lg" [hover]="false">
          <h3 class="mb-4 text-lg font-semibold text-brand-navy">Vídeo da aula</h3>

          <!--
            aria-live: o estado da ingestao muda sozinho, por polling. Sem isto
            quem usa leitor de tela nao saberia que o vídeo ficou pronto.
          -->
          <div class="mb-4 flex flex-wrap items-center gap-3" aria-live="polite">
            @if (video(); as state) {
              @if (state.hasVideo && state.status) {
                <ui-badge [variant]="statusVariant()" [label]="statusLabel()" />
                <span class="text-sm text-slate-600">{{ state.fileName }}</span>
                @if (videoSize()) {
                  <span class="text-xs text-slate-500">{{ videoSize() }}</span>
                }
              } @else {
                <span class="text-sm text-slate-500">Nenhum vídeo enviado para este módulo.</span>
              }

              @if (state.status === 'ERRORED' && state.error) {
                <p class="w-full text-sm text-state-danger">{{ state.error }}</p>
              }
            } @else {
              <span class="text-sm text-slate-500">Carregando estado do vídeo…</span>
            }
          </div>

          <label
            class="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-brand-navy/12 p-6 text-center transition-colors hover:border-brand-teal hover:bg-brand-teal/5 focus-within:border-brand-teal focus-within:ring-2 focus-within:ring-brand-teal/30">
            <svg class="h-8 w-8 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <span class="text-sm text-slate-600">
              {{ videoUploading() ? 'Enviando…' : 'Selecione o arquivo de vídeo (MP4, MOV, WebM ou MKV)' }}
            </span>
            <input
              type="file"
              class="sr-only"
              accept="video/*"
              [disabled]="videoUploading()"
              (change)="uploadVideo($event)" />
          </label>

          @if (videoUploading()) {
            <div class="mt-4" aria-live="polite">
              <ui-progress-bar
                [value]="videoProgress()"
                variant="gradient"
                [showLabel]="true"
                label="Envio do vídeo" />
            </div>
          }
        </ui-card>
      </div>

      <div class="mt-6">
        <ui-card variant="default" padding="lg" [hover]="false">
          <h3 class="mb-4 text-lg font-semibold text-brand-navy">Materiais complementares</h3>

          @if (materials().length === 0) {
            <p class="mb-4 text-sm text-slate-500">Nenhum material enviado para este módulo.</p>
          } @else {
            <ul class="mb-4 divide-y divide-brand-navy/8">
              @for (material of materials(); track material.id) {
                <li class="flex flex-wrap items-center justify-between gap-3 py-3">
                  <span class="min-w-0">
                    <span class="block truncate text-sm font-bold text-brand-navy">
                      {{ material.fileName }}
                    </span>
                    <span class="block text-xs text-slate-500">
                      {{ material.fileType.toUpperCase() }} • {{ sizeOf(material) }}
                    </span>
                  </span>
                  <ui-button
                    variant="outline"
                    size="sm"
                    [loading]="removingId() === material.id"
                    (click)="removeMaterial(material)">
                    Remover
                  </ui-button>
                </li>
              }
            </ul>
          }

          <label
            class="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-brand-navy/12 p-6 text-center transition-colors hover:border-brand-teal hover:bg-brand-teal/5 focus-within:border-brand-teal focus-within:ring-2 focus-within:ring-brand-teal/30">
            <span class="text-sm text-slate-600">
              {{ materialUploading() ? 'Enviando…' : 'Selecione um material (PDF, planilha, documento ou apresentação)' }}
            </span>
            <input
              type="file"
              class="sr-only"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt"
              [disabled]="materialUploading()"
              (change)="uploadMaterial($event)" />
          </label>

          @if (materialUploading()) {
            <div class="mt-4" aria-live="polite">
              <ui-progress-bar
                [value]="materialProgress()"
                variant="gradient"
                [showLabel]="true"
                label="Envio do material" />
            </div>
          }
        </ui-card>
      </div>
    }
  `,
})
export class AdminAulas implements OnDestroy {
  private readonly content = inject(AdminContentService);

  private pollTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly modules = signal<AdminModule[]>([]);
  protected readonly selectedId = signal<string | null>(null);
  protected readonly video = signal<ModuleVideoState | null>(null);
  protected readonly materials = signal<MaterialItem[]>([]);
  protected readonly error = signal('');

  protected readonly videoUploading = signal(false);
  protected readonly videoProgress = signal(0);
  protected readonly materialUploading = signal(false);
  protected readonly materialProgress = signal(0);
  protected readonly removingId = signal<string | null>(null);

  protected readonly statusLabel = computed(() => {
    const status = this.video()?.status;

    return status ? STATUS_LABEL[status] : '';
  });

  protected readonly statusVariant = computed(() => {
    const status = this.video()?.status;

    return status ? STATUS_VARIANT[status] : 'teal';
  });

  protected readonly videoSize = computed(() => formatFileSize(this.video()?.sizeBytes ?? null));

  constructor() {
    this.content.modules().subscribe({
      next: modules => {
        this.modules.set(modules);

        if (modules.length > 0) {
          this.selectModule(modules[0].id);
        }
      },
      error: (message: string) => this.error.set(message),
    });
  }

  ngOnDestroy(): void {
    this.stopPolling();
  }

  protected selectModule(id: string): void {
    if (!id || id === this.selectedId()) {
      return;
    }

    this.stopPolling();
    this.selectedId.set(id);
    this.video.set(null);
    this.materials.set([]);
    this.error.set('');

    this.refreshVideo();
    this.refreshMaterials();
  }

  protected uploadVideo(event: Event): void {
    const file = this.fileFrom(event);

    if (!file || !this.selectedId()) {
      return;
    }

    this.error.set('');
    this.videoUploading.set(true);
    this.videoProgress.set(0);

    this.content.uploadVideo(this.selectedId()!, file).subscribe({
      next: progress => {
        this.videoProgress.set(progress.progress);

        if (progress.phase === 'done') {
          this.videoUploading.set(false);
          this.video.set(progress.result);
          // A ingestao e assincrona: o estado continua mudando depois do PUT.
          this.schedulePoll();
        }
      },
      error: (message: string) => {
        this.error.set(message);
        this.videoUploading.set(false);
      },
    });
  }

  protected uploadMaterial(event: Event): void {
    const file = this.fileFrom(event);

    if (!file || !this.selectedId()) {
      return;
    }

    this.error.set('');
    this.materialUploading.set(true);
    this.materialProgress.set(0);

    this.content.uploadMaterial(this.selectedId()!, file).subscribe({
      next: progress => {
        this.materialProgress.set(progress.progress);

        if (progress.phase === 'done') {
          this.materialUploading.set(false);
          this.refreshMaterials();
        }
      },
      error: (message: string) => {
        this.error.set(message);
        this.materialUploading.set(false);
      },
    });
  }

  protected removeMaterial(material: MaterialItem): void {
    // Confirmacao antes de excluir: o arquivo sai do bucket e nao volta.
    if (!confirm(`Remover "${material.fileName}"? O arquivo será apagado definitivamente.`)) {
      return;
    }

    this.error.set('');
    this.removingId.set(material.id);

    this.content.removeMaterial(material.id).subscribe({
      next: () => {
        this.removingId.set(null);
        this.materials.update(list => list.filter(item => item.id !== material.id));
      },
      error: (message: string) => {
        this.error.set(message);
        this.removingId.set(null);
      },
    });
  }

  protected sizeOf(material: MaterialItem): string {
    return formatFileSize(material.sizeBytes);
  }

  private refreshVideo(): void {
    const moduleId = this.selectedId();

    if (!moduleId) {
      return;
    }

    this.content.videoState(moduleId).subscribe({
      next: state => {
        this.video.set(state);

        if (state.status === 'PROCESSING') {
          this.schedulePoll();
        }
      },
      error: (message: string) => this.error.set(message),
    });
  }

  private refreshMaterials(): void {
    const moduleId = this.selectedId();

    if (!moduleId) {
      return;
    }

    this.content.materials(moduleId).subscribe({
      next: materials => this.materials.set(materials),
      error: (message: string) => this.error.set(message),
    });
  }

  /** Uma consulta agendada por vez: trocar de modulo cancela a anterior. */
  private schedulePoll(): void {
    this.stopPolling();
    this.pollTimer = setTimeout(() => this.refreshVideo(), POLL_MS);
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private fileFrom(event: Event): File | null {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;

    // Limpa o input para que reenviar o mesmo arquivo volte a disparar change.
    input.value = '';

    return file;
  }
}
