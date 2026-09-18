import { ChangeDetectionStrategy, Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable } from 'rxjs';
import {
  AdminContentService,
  AdminLesson,
  AdminModule,
  LessonVideoState,
  MaterialItem,
  VideoStatus,
} from '../../../core/services/admin-content.service';
import { formatDuration, formatFileSize } from '../../../core/services/content.service';
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

/** O que esta sendo renomeado: um modulo da grade ou uma aula. */
type EditTarget = { kind: 'module' | 'lesson'; id: string } | null;

/**
 * Gestao de Aulas em **dois niveis**: a grade (modulos) e as aulas de cada
 * modulo.
 *
 * Ate a Spec 010 esta aba pendurava um video num modulo, porque modulo e aula
 * eram a mesma coisa. Com a Spec 012 o modulo virou container: o que o
 * administrador compoe aqui e a lista de aulas dentro dele, e o arquivo
 * pertence a aula (decisoes 1 e 2).
 *
 * Nao existe remocao de modulo (decisao 15): `Certificate.moduleId` esta em
 * `onDelete: Restrict`, e apagar um modulo que ja certificou alguem apagaria
 * diplomas emitidos. A propria tela diz isso quando ha diploma.
 */
@Component({
  selector: 'app-admin-aulas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Badge, Button, Card, ProgressBar, ReactiveFormsModule, SectionHeader],
  template: `
    <div class="mb-6">
      <ui-section-header overline="Conteúdo" title="Gestão de Aulas" />
    </div>

    @if (error()) {
      <div class="mb-6 rounded-xl border border-state-danger/30 bg-state-danger/5 p-4" role="alert">
        <p class="text-sm text-slate-700">{{ error() }}</p>
      </div>
    }

    <!-- Nível 1: a grade -->
    <ui-card variant="default" padding="lg" [hover]="false">
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 class="text-lg font-semibold text-brand-navy">Módulos do curso</h3>
        <ui-button variant="outline" size="sm" (click)="toggleModuleForm()">
          {{ showModuleForm() ? 'Cancelar' : 'Novo módulo' }}
        </ui-button>
      </div>

      @if (showModuleForm()) {
        <form [formGroup]="moduleForm" (ngSubmit)="createModule()" class="mb-4 grid gap-3 sm:grid-cols-2">
          <label class="block">
            <span class="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-500">
              Título do módulo
            </span>
            <input type="text" formControlName="title" [class]="fieldClass" />
          </label>
          <label class="block">
            <span class="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-500">
              Resumo
            </span>
            <input type="text" formControlName="summary" [class]="fieldClass" />
          </label>
          <div class="sm:col-span-2">
            <ui-button type="submit" variant="primary" size="sm" [loading]="savingModule()">
              Criar módulo
            </ui-button>
          </div>
        </form>
      }

      @if (modules().length === 0) {
        <p class="text-sm text-slate-500">Carregando módulos…</p>
      } @else {
        <ul class="divide-y divide-brand-navy/8">
          @for (module of modules(); track module.id; let i = $index) {
            <li class="flex flex-wrap items-center gap-3 py-3">
              <button
                type="button"
                [class]="rowClass(module.id === selectedModuleId())"
                (click)="selectModule(module.id)">
                <span class="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500">
                  Módulo {{ module.order }}
                </span>
                <span class="block text-sm font-bold">{{ module.title }}</span>
                <span class="block text-xs text-slate-500">
                  {{ module.lessonCount }} aula(s)
                  @if (module.certificateCount > 0) {
                    · {{ module.certificateCount }} diploma(s) emitido(s)
                  }
                </span>
                <!--
                  Preço de venda (Spec 014, decisão 1). "A definir" é estado
                  legítimo: o módulo some da loja em vez de ser vendido por um
                  valor que ninguém decidiu.
                -->
                <span
                  class="mt-1 block text-xs font-bold"
                  [class.text-brand-teal-deep]="module.priceCents !== null"
                  [class.text-state-warning]="module.priceCents === null">
                  {{ priceLabel(module.priceCents) }}
                </span>
              </button>

              <span class="ml-auto flex items-center gap-2">
                <ui-button variant="ghost" size="sm" [disabled]="i === 0" (click)="moveModule(i, -1)">
                  ↑
                </ui-button>
                <ui-button
                  variant="ghost"
                  size="sm"
                  [disabled]="i === modules().length - 1"
                  (click)="moveModule(i, 1)">
                  ↓
                </ui-button>
                <ui-button variant="outline" size="sm" (click)="startEdit('module', module)">
                  Renomear
                </ui-button>
                <ui-button variant="outline" size="sm" (click)="startPrice(module)">
                  Preço
                </ui-button>
              </span>

              @if (pricingModuleId() === module.id) {
                <form
                  [formGroup]="priceForm"
                  (ngSubmit)="savePrice(module)"
                  class="w-full grid gap-3 rounded-xl bg-brand-teal/5 p-3">
                  <label [for]="'preco-' + module.id" class="text-xs text-slate-600">
                    Preço em reais (deixe vazio para voltar a "a definir")
                  </label>
                  <input
                    [id]="'preco-' + module.id"
                    type="text"
                    inputmode="decimal"
                    formControlName="price"
                    [class]="fieldClass"
                    placeholder="199,00" />
                  <!--
                    Os R$ 199,00 vieram da migration como valor provisório do
                    time (decisão 1) — dizer isso aqui evita que alguém o trate
                    como preço decidido.
                  -->
                  <p class="text-xs text-slate-500">
                    O valor de R$ 199,00 foi aplicado a todos os módulos na migração desta spec
                    como preço provisório. Alterar aqui não muda pedidos já feitos: eles guardam o
                    valor cobrado na época.
                  </p>
                  @if (priceError(); as message) {
                    <p class="text-xs text-state-danger" role="alert">{{ message }}</p>
                  }
                  <div class="flex gap-2">
                    <ui-button type="submit" variant="primary" size="sm" [loading]="savingPrice()">
                      Salvar preço
                    </ui-button>
                    <ui-button variant="ghost" size="sm" (click)="cancelPrice()">Cancelar</ui-button>
                  </div>
                </form>
              }

              @if (isEditing('module', module.id)) {
                <form
                  [formGroup]="editForm"
                  (ngSubmit)="saveEdit()"
                  class="w-full grid gap-3 rounded-xl bg-brand-teal/5 p-3 sm:grid-cols-2">
                  <input type="text" formControlName="title" [class]="fieldClass" />
                  <input type="text" formControlName="summary" [class]="fieldClass" />
                  <div class="sm:col-span-2 flex gap-2">
                    <ui-button type="submit" variant="primary" size="sm" [loading]="savingEdit()">
                      Salvar
                    </ui-button>
                    <ui-button variant="ghost" size="sm" (click)="cancelEdit()">Cancelar</ui-button>
                  </div>
                </form>
              }
            </li>
          }
        </ul>

        <!--
          Sem botão de excluir módulo: um módulo que já certificou alguém não é
          removível pelo painel (decisão 15), e a FK está em RESTRICT
          justamente para isso.
        -->
        <p class="mt-3 text-xs text-slate-500">
          Módulos não são excluídos por aqui: diplomas já emitidos continuam valendo.
        </p>
      }
    </ui-card>

    <!-- Nível 2: as aulas do módulo escolhido -->
    @if (selectedModule(); as module) {
      <div class="mt-6">
        <ui-card variant="default" padding="lg" [hover]="false">
          <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h3 class="text-lg font-semibold text-brand-navy">
              Aulas do módulo {{ module.order }} · {{ module.title }}
            </h3>
            <ui-button variant="outline" size="sm" (click)="toggleLessonForm()">
              {{ showLessonForm() ? 'Cancelar' : 'Nova aula' }}
            </ui-button>
          </div>

          @if (showLessonForm()) {
            <form [formGroup]="lessonForm" (ngSubmit)="createLesson()" class="mb-4 grid gap-3 sm:grid-cols-2">
              <label class="block">
                <span class="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-500">
                  Título da aula
                </span>
                <input type="text" formControlName="title" [class]="fieldClass" />
              </label>
              <label class="block">
                <span class="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-500">
                  Resumo
                </span>
                <input type="text" formControlName="summary" [class]="fieldClass" />
              </label>
              <div class="sm:col-span-2">
                <ui-button type="submit" variant="primary" size="sm" [loading]="savingLesson()">
                  Criar aula
                </ui-button>
              </div>
            </form>
          }

          @if (lessons().length === 0) {
            <p class="text-sm text-slate-500">
              Este módulo ainda não tem aulas. Crie a primeira para poder enviar o vídeo.
            </p>
          } @else {
            <ul class="divide-y divide-brand-navy/8">
              @for (lesson of lessons(); track lesson.id; let i = $index) {
                <li class="flex flex-wrap items-center gap-3 py-3">
                  <button
                    type="button"
                    [class]="rowClass(lesson.id === selectedLessonId())"
                    (click)="selectLesson(lesson.id)">
                    <span class="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500">
                      Aula {{ lesson.order }}
                    </span>
                    <span class="block text-sm font-bold">{{ lesson.title }}</span>
                    <span class="block text-xs text-slate-500">
                      {{ lesson.materialCount }} material(is) · {{ lesson.completedBy }} aluno(s)
                      concluíram
                      @if (durationOf(lesson)) {
                        · {{ durationOf(lesson) }}
                      }
                    </span>
                  </button>

                  <span class="flex items-center gap-2">
                    @if (lesson.video.hasVideo && lesson.video.status) {
                      <ui-badge
                        [variant]="badgeVariant(lesson.video.status)"
                        [label]="badgeLabel(lesson.video.status)" />
                    } @else {
                      <span class="text-xs text-slate-400">sem vídeo</span>
                    }
                  </span>

                  <span class="ml-auto flex items-center gap-2">
                    <ui-button variant="ghost" size="sm" [disabled]="i === 0" (click)="moveLesson(i, -1)">
                      ↑
                    </ui-button>
                    <ui-button
                      variant="ghost"
                      size="sm"
                      [disabled]="i === lessons().length - 1"
                      (click)="moveLesson(i, 1)">
                      ↓
                    </ui-button>
                    <ui-button variant="outline" size="sm" (click)="startEdit('lesson', lesson)">
                      Renomear
                    </ui-button>
                    <ui-button
                      variant="outline"
                      size="sm"
                      [loading]="removingLessonId() === lesson.id"
                      (click)="removeLesson(lesson)">
                      Remover
                    </ui-button>
                  </span>

                  @if (isEditing('lesson', lesson.id)) {
                    <form
                      [formGroup]="editForm"
                      (ngSubmit)="saveEdit()"
                      class="w-full grid gap-3 rounded-xl bg-brand-teal/5 p-3 sm:grid-cols-2">
                      <input type="text" formControlName="title" [class]="fieldClass" />
                      <input type="text" formControlName="summary" [class]="fieldClass" />
                      <div class="sm:col-span-2 flex gap-2">
                        <ui-button type="submit" variant="primary" size="sm" [loading]="savingEdit()">
                          Salvar
                        </ui-button>
                        <ui-button variant="ghost" size="sm" (click)="cancelEdit()">
                          Cancelar
                        </ui-button>
                      </div>
                    </form>
                  }
                </li>
              }
            </ul>
          }
        </ui-card>
      </div>
    }

    <!-- Nível 3: o conteúdo da aula escolhida -->
    @if (selectedLesson(); as lesson) {
      <div class="mt-6">
        <ui-card variant="default" padding="lg" [hover]="false">
          <h3 class="mb-4 text-lg font-semibold text-brand-navy">
            Vídeo da aula {{ lesson.order }} · {{ lesson.title }}
          </h3>

          <!--
            aria-live: o estado da ingestão muda sozinho, por polling. Sem isto
            quem usa leitor de tela não saberia que o vídeo ficou pronto.
          -->
          <div class="mb-4 flex flex-wrap items-center gap-3" aria-live="polite">
            @if (video(); as state) {
              @if (state.hasVideo && state.status) {
                <ui-badge [variant]="statusVariant()" [label]="statusLabel()" />
                <span class="text-sm text-slate-600">{{ state.fileName }}</span>
                @if (videoSize()) {
                  <span class="text-xs text-slate-500">{{ videoSize() }}</span>
                }
                @if (videoDuration()) {
                  <span class="text-xs text-slate-500">{{ videoDuration() }}</span>
                }
              } @else {
                <span class="text-sm text-slate-500">Nenhum vídeo enviado para esta aula.</span>
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
          <h3 class="mb-4 text-lg font-semibold text-brand-navy">Materiais desta aula</h3>

          @if (materials().length === 0) {
            <p class="mb-4 text-sm text-slate-500">Nenhum material enviado para esta aula.</p>
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
  private readonly fb = inject(FormBuilder);

  private pollTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly fieldClass =
    'w-full rounded-xl border border-brand-navy/10 bg-white/80 px-4 py-2.5 text-sm text-slate-800 outline-none transition-all duration-200 focus:border-brand-teal focus:ring-2 focus:ring-brand-teal/20';

  protected readonly modules = signal<AdminModule[]>([]);
  protected readonly lessons = signal<AdminLesson[]>([]);
  protected readonly selectedModuleId = signal<string | null>(null);
  protected readonly selectedLessonId = signal<string | null>(null);
  protected readonly video = signal<LessonVideoState | null>(null);
  protected readonly materials = signal<MaterialItem[]>([]);
  protected readonly error = signal('');

  protected readonly showModuleForm = signal(false);
  protected readonly showLessonForm = signal(false);
  protected readonly savingModule = signal(false);
  protected readonly savingLesson = signal(false);
  protected readonly savingEdit = signal(false);
  protected readonly editing = signal<EditTarget>(null);
  protected readonly removingLessonId = signal<string | null>(null);

  protected readonly videoUploading = signal(false);
  protected readonly videoProgress = signal(0);
  protected readonly materialUploading = signal(false);
  protected readonly materialProgress = signal(0);
  protected readonly removingId = signal<string | null>(null);

  // Reactive forms, como manda o padrao do projeto: o titulo e o resumo tem
  // minimo validado no DTO da API, e repeti-lo aqui evita a ida ate o 400.
  protected readonly moduleForm = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.minLength(3)]],
    summary: ['', [Validators.required, Validators.minLength(3)]],
  });

  protected readonly lessonForm = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.minLength(3)]],
    summary: ['', [Validators.required, Validators.minLength(3)]],
  });

  protected readonly editForm = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.minLength(3)]],
    summary: ['', [Validators.required, Validators.minLength(3)]],
  });

  // --- Preco do modulo (Spec 014, decisao 1) ---

  /** Modulo com o campo de preco aberto; nulo quando nenhum esta em edicao. */
  protected readonly pricingModuleId = signal<string | null>(null);
  protected readonly savingPrice = signal(false);
  protected readonly priceError = signal<string | null>(null);
  /**
   * O campo vive em um `FormGroup`, e nao solto, por um motivo pratico: sem o
   * `[formGroup]` no `<form>`, nenhuma diretiva do Angular se prende a ele, o
   * `(ngSubmit)` vira um listener de `submit` nativo sem `preventDefault`, e
   * salvar o preco RECARREGA a pagina. Foi o que aconteceu no teste funcional.
   */
  protected readonly priceForm = this.fb.nonNullable.group({ price: [''] });

  /** Rotulo do preco na lista. "A definir" e estado legitimo, e nao erro. */
  protected priceLabel(cents: number | null): string {
    return cents === null
      ? 'Preço a definir'
      : (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  protected startPrice(module: AdminModule): void {
    this.priceError.set(null);
    this.pricingModuleId.set(module.id);
    this.priceForm.controls.price.setValue(
      module.priceCents === null ? '' : (module.priceCents / 100).toFixed(2).replace('.', ','),
    );
  }

  protected cancelPrice(): void {
    this.pricingModuleId.set(null);
    this.priceError.set(null);
  }

  /**
   * Converte o texto digitado em centavos inteiros.
   *
   * Aceita virgula e ponto porque as duas grafias sao naturais em portugues, e
   * arredonda para o centavo: o banco guarda inteiro, e um valor fracionario de
   * centavo nao existe em cobranca.
   */
  protected savePrice(module: AdminModule): void {
    const raw = this.priceForm.controls.price.value.trim();

    if (raw === '') {
      this.persistPrice(module, null);

      return;
    }

    const value = Number(raw.replace(/\./g, '').replace(',', '.'));

    if (!Number.isFinite(value) || value <= 0) {
      this.priceError.set('Informe um valor maior que zero, como 199,00.');

      return;
    }

    this.persistPrice(module, Math.round(value * 100));
  }

  private persistPrice(module: AdminModule, priceCents: number | null): void {
    this.savingPrice.set(true);
    this.priceError.set(null);

    this.content.updateModulePrice(module.id, priceCents).subscribe({
      next: () => {
        this.savingPrice.set(false);
        this.pricingModuleId.set(null);
        this.loadModules(false);
      },
      error: (message: string) => {
        this.savingPrice.set(false);
        this.priceError.set(message);
      },
    });
  }

  protected readonly selectedModule = computed(
    () => this.modules().find(module => module.id === this.selectedModuleId()) ?? null,
  );

  protected readonly selectedLesson = computed(
    () => this.lessons().find(lesson => lesson.id === this.selectedLessonId()) ?? null,
  );

  protected readonly statusLabel = computed(() => {
    const status = this.video()?.status;

    return status ? STATUS_LABEL[status] : '';
  });

  protected readonly statusVariant = computed(() => {
    const status = this.video()?.status;

    return status ? STATUS_VARIANT[status] : 'teal';
  });

  protected readonly videoSize = computed(() => formatFileSize(this.video()?.sizeBytes ?? null));

  protected readonly videoDuration = computed(() =>
    formatDuration(this.video()?.durationSeconds ?? null),
  );

  constructor() {
    this.loadModules(true);
  }

  ngOnDestroy(): void {
    this.stopPolling();
  }

  protected badgeLabel(status: VideoStatus): string {
    return STATUS_LABEL[status];
  }

  protected badgeVariant(status: VideoStatus): 'teal' | 'success' | 'danger' {
    return STATUS_VARIANT[status];
  }

  protected durationOf(lesson: AdminLesson): string {
    return formatDuration(lesson.video.durationSeconds);
  }

  protected rowClass(active: boolean): string {
    return [
      'min-w-0 flex-1 rounded-xl px-3 py-2 text-left transition-colors',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal',
      active ? 'bg-brand-teal/10 text-brand-teal-deep' : 'text-brand-navy hover:bg-brand-teal/5',
    ].join(' ');
  }

  protected toggleModuleForm(): void {
    this.moduleForm.reset();
    this.showModuleForm.update(open => !open);
  }

  protected toggleLessonForm(): void {
    this.lessonForm.reset();
    this.showLessonForm.update(open => !open);
  }

  protected createModule(): void {
    if (this.moduleForm.invalid || this.savingModule()) {
      this.moduleForm.markAllAsTouched();

      return;
    }

    this.savingModule.set(true);
    this.error.set('');

    this.content.createModule(this.moduleForm.getRawValue()).subscribe({
      next: created => {
        this.savingModule.set(false);
        this.showModuleForm.set(false);
        this.moduleForm.reset();
        this.modules.update(list => [...list, created]);
        this.selectModule(created.id);
      },
      error: (message: string) => {
        this.error.set(message);
        this.savingModule.set(false);
      },
    });
  }

  protected createLesson(): void {
    const moduleId = this.selectedModuleId();

    if (!moduleId || this.lessonForm.invalid || this.savingLesson()) {
      this.lessonForm.markAllAsTouched();

      return;
    }

    this.savingLesson.set(true);
    this.error.set('');

    this.content.createLesson(moduleId, this.lessonForm.getRawValue()).subscribe({
      next: created => {
        this.savingLesson.set(false);
        this.showLessonForm.set(false);
        this.lessonForm.reset();
        this.lessons.update(list => [...list, created]);
        this.bumpLessonCount(moduleId, 1);
        this.selectLesson(created.id);
      },
      error: (message: string) => {
        this.error.set(message);
        this.savingLesson.set(false);
      },
    });
  }

  protected isEditing(kind: 'module' | 'lesson', id: string): boolean {
    const target = this.editing();

    return target?.kind === kind && target.id === id;
  }

  protected startEdit(kind: 'module' | 'lesson', item: { id: string; title: string; summary: string }): void {
    this.editing.set({ kind, id: item.id });
    this.editForm.setValue({ title: item.title, summary: item.summary });
  }

  protected cancelEdit(): void {
    this.editing.set(null);
  }

  protected saveEdit(): void {
    const target = this.editing();

    if (!target || this.editForm.invalid || this.savingEdit()) {
      this.editForm.markAllAsTouched();

      return;
    }

    this.savingEdit.set(true);
    this.error.set('');

    const input = this.editForm.getRawValue();
    const request: Observable<AdminModule | AdminLesson> =
      target.kind === 'module'
        ? this.content.updateModule(target.id, input)
        : this.content.updateLesson(target.id, input);

    request.subscribe({
      next: (updated: AdminModule | AdminLesson) => {
        this.savingEdit.set(false);
        this.editing.set(null);

        if (target.kind === 'module') {
          this.modules.update(list =>
            list.map(item => (item.id === target.id ? (updated as AdminModule) : item)),
          );
        } else {
          this.lessons.update(list =>
            list.map(item => (item.id === target.id ? (updated as AdminLesson) : item)),
          );
        }
      },
      error: (message: string) => {
        this.error.set(message);
        this.savingEdit.set(false);
      },
    });
  }

  /**
   * Subir/descer manda a **lista completa** de ids na ordem desejada
   * (decisao 17): reordenar item por item passaria por um estado intermediario
   * em conflito com o indice unico de ordem.
   */
  protected moveModule(index: number, step: number): void {
    const reordered = this.swap(this.modules(), index, index + step);

    if (!reordered) {
      return;
    }

    const previous = this.modules();
    this.modules.set(this.renumber(reordered));

    this.content.reorderModules(reordered.map(module => module.id)).subscribe({
      error: (message: string) => {
        // A ordem volta ao que era: a tela nao pode mostrar uma grade que o
        // banco recusou.
        this.modules.set(previous);
        this.error.set(message);
      },
    });
  }

  protected moveLesson(index: number, step: number): void {
    const moduleId = this.selectedModuleId();
    const reordered = this.swap(this.lessons(), index, index + step);

    if (!moduleId || !reordered) {
      return;
    }

    const previous = this.lessons();
    this.lessons.set(this.renumber(reordered));

    this.content.reorderLessons(moduleId, reordered.map(lesson => lesson.id)).subscribe({
      error: (message: string) => {
        this.lessons.set(previous);
        this.error.set(message);
      },
    });
  }

  protected removeLesson(lesson: AdminLesson): void {
    // A confirmacao diz quantos alunos concluiram: remover a aula apaga o
    // progresso deles, alem do video e dos materiais (decisao 16).
    const impact =
      lesson.completedBy > 0
        ? ` ${lesson.completedBy} aluno(s) já concluíram esta aula e perderão esse progresso.`
        : '';

    if (
      !confirm(
        `Remover a aula "${lesson.title}"? O vídeo e os materiais dela serão apagados definitivamente.${impact}`,
      )
    ) {
      return;
    }

    this.error.set('');
    this.removingLessonId.set(lesson.id);

    this.content.removeLesson(lesson.id).subscribe({
      next: () => {
        this.removingLessonId.set(null);
        this.lessons.update(list => this.renumber(list.filter(item => item.id !== lesson.id)));
        this.bumpLessonCount(lesson.moduleId, -1);

        if (this.selectedLessonId() === lesson.id) {
          this.selectedLessonId.set(null);
          this.video.set(null);
          this.materials.set([]);
          this.stopPolling();
        }
      },
      error: (message: string) => {
        this.error.set(message);
        this.removingLessonId.set(null);
      },
    });
  }

  protected selectModule(id: string): void {
    if (!id || id === this.selectedModuleId()) {
      return;
    }

    this.stopPolling();
    this.selectedModuleId.set(id);
    this.selectedLessonId.set(null);
    this.lessons.set([]);
    this.video.set(null);
    this.materials.set([]);
    this.editing.set(null);
    this.showLessonForm.set(false);
    this.error.set('');

    this.loadLessons(id);
  }

  protected selectLesson(id: string): void {
    if (!id || id === this.selectedLessonId()) {
      return;
    }

    this.stopPolling();
    this.selectedLessonId.set(id);
    this.video.set(null);
    this.materials.set([]);
    this.error.set('');

    this.refreshVideo();
    this.refreshMaterials();
  }

  protected uploadVideo(event: Event): void {
    const file = this.fileFrom(event);
    const lessonId = this.selectedLessonId();

    if (!file || !lessonId) {
      return;
    }

    this.error.set('');
    this.videoUploading.set(true);
    this.videoProgress.set(0);

    this.content.uploadVideo(lessonId, file).subscribe({
      next: progress => {
        this.videoProgress.set(progress.progress);

        if (progress.phase === 'done') {
          this.videoUploading.set(false);
          this.video.set(progress.result);
          this.syncLessonVideo(lessonId, progress.result);
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
    const lessonId = this.selectedLessonId();

    if (!file || !lessonId) {
      return;
    }

    this.error.set('');
    this.materialUploading.set(true);
    this.materialProgress.set(0);

    this.content.uploadMaterial(lessonId, file).subscribe({
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

  private loadModules(selectFirst: boolean): void {
    this.content.modules().subscribe({
      next: modules => {
        this.modules.set(modules);

        if (selectFirst && modules.length > 0) {
          this.selectModule(modules[0].id);
        }
      },
      error: (message: string) => this.error.set(message),
    });
  }

  private loadLessons(moduleId: string): void {
    this.content.lessons(moduleId).subscribe({
      next: lessons => {
        this.lessons.set(lessons);

        if (lessons.length > 0) {
          this.selectLesson(lessons[0].id);
        }
      },
      error: (message: string) => this.error.set(message),
    });
  }

  private refreshVideo(): void {
    const lessonId = this.selectedLessonId();

    if (!lessonId) {
      return;
    }

    this.content.videoState(lessonId).subscribe({
      next: state => {
        this.video.set(state);
        this.syncLessonVideo(lessonId, state);

        if (state.status === 'PROCESSING') {
          this.schedulePoll();
        }
      },
      error: (message: string) => this.error.set(message),
    });
  }

  private refreshMaterials(): void {
    const lessonId = this.selectedLessonId();

    if (!lessonId) {
      return;
    }

    this.content.materials(lessonId).subscribe({
      next: materials => this.materials.set(materials),
      error: (message: string) => this.error.set(message),
    });
  }

  /** Mantem o badge da lista de aulas coerente com o estado recem-consultado. */
  private syncLessonVideo(lessonId: string, state: LessonVideoState): void {
    this.lessons.update(list =>
      list.map(lesson => (lesson.id === lessonId ? { ...lesson, video: state } : lesson)),
    );
  }

  private bumpLessonCount(moduleId: string, delta: number): void {
    this.modules.update(list =>
      list.map(module =>
        module.id === moduleId
          ? { ...module, lessonCount: Math.max(module.lessonCount + delta, 0) }
          : module,
      ),
    );
  }

  /** Troca dois itens de lugar; nulo quando o destino esta fora da lista. */
  private swap<T>(list: readonly T[], from: number, to: number): T[] | null {
    if (to < 0 || to >= list.length) {
      return null;
    }

    const copy = [...list];
    [copy[from], copy[to]] = [copy[to], copy[from]];

    return copy;
  }

  /** Reexibe a numeracao que o servidor vai gravar, sem esperar o round-trip. */
  private renumber<T extends { order: number }>(list: readonly T[]): T[] {
    return list.map((item, index) => ({ ...item, order: index + 1 }));
  }

  /** Uma consulta agendada por vez: trocar de aula cancela a anterior. */
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
