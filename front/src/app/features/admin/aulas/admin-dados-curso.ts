import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { DEFAULT_COURSE_SLUG } from '../../../core/mocks/courses.mock';
import { AdminCourse, AdminCoursesService } from '../../../core/services/admin-courses.service';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';

/** "51 min", "2 h 05 min": a soma dos videos, legivel. */
export function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  return hours ? `${hours} h ${String(rest).padStart(2, '0')} min` : `${rest} min`;
}

/**
 * Bloco "Dados do curso" da Gestao de Aulas (Spec 022, decisao 12).
 *
 * A carga horaria e decisao pedagogica e comercial, e por isso e digitada, e
 * nao somada dos videos: a soma aparece so como referencia. O mesmo numero vai
 * para a pagina do curso, o FAQ e os certificados — inclusive os ja emitidos,
 * que leem o valor do curso na hora. Por isso mudar um valor ja definido pede
 * confirmacao.
 */
@Component({
  selector: 'app-admin-dados-curso',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button, Card, ReactiveFormsModule],
  template: `
    <ui-card variant="default" padding="lg" [hover]="false">
      <h3 class="text-lg font-semibold text-brand-navy">Dados do curso</h3>
      <p class="mt-1 text-sm text-slate-600">
        A carga horária aparece na página do curso, no FAQ e nos certificados. Enquanto estiver em
        branco, a página não mostra carga horária e o certificado mostra "a definir".
      </p>

      @if (error(); as message) {
        <p class="mt-4 text-sm text-state-danger" role="alert">{{ message }}</p>
      }

      @if (course(); as dados) {
        <form [formGroup]="form" class="mt-5 flex flex-wrap items-end gap-4" (ngSubmit)="save()">
          <label class="block text-xs font-bold uppercase tracking-widest text-slate-500">
            Carga horária (horas)
            <input
              type="text"
              inputmode="numeric"
              formControlName="workload"
              aria-describedby="dados-curso-referencia"
              [class]="fieldClass" />
          </label>
          <ui-button type="submit" variant="primary" size="sm" [loading]="saving()">
            Salvar carga horária
          </ui-button>
        </form>

        <p id="dados-curso-referencia" class="mt-3 text-xs text-slate-500" data-testid="referencia-videos">
          Referência: os vídeos processados somam {{ videoTotal() }} ({{ dados.videoLessons }} de
          {{ dados.totalLessons }} aulas). A carga horária inclui também apostila, exercícios e plano de
          ação.
        </p>

        @if (formError(); as message) {
          <p class="mt-3 text-sm text-state-danger" role="alert">{{ message }}</p>
        }
        @if (savedMessage(); as message) {
          <p class="mt-3 text-sm text-state-success" role="status">{{ message }}</p>
        }
      } @else if (!error()) {
        <p class="mt-4 text-sm text-slate-500" role="status">Carregando os dados do curso…</p>
      }
    </ui-card>
  `,
})
export class AdminDadosCurso implements OnInit {
  private readonly courses = inject(AdminCoursesService);

  protected readonly fieldClass =
    'mt-1 block w-32 rounded-xl border border-brand-navy/15 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900 focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/30';

  private readonly slug = DEFAULT_COURSE_SLUG;

  protected readonly course = signal<AdminCourse | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly formError = signal<string | null>(null);
  protected readonly savedMessage = signal<string | null>(null);
  protected readonly saving = signal(false);

  protected readonly form = new FormGroup({
    workload: new FormControl('', { nonNullable: true }),
  });

  protected readonly videoTotal = computed(() => formatDuration(this.course()?.videoSeconds ?? 0));

  ngOnInit(): void {
    this.courses.load(this.slug).subscribe({
      next: course => this.apply(course),
      error: (message: string) => this.error.set(message),
    });
  }

  /**
   * Valida a forma (inteiro de 1 a 999, ou vazio) e envia. Mudar um valor ja
   * definido confirma antes, porque altera diplomas que alguem ja baixou.
   */
  protected save(): void {
    const current = this.course()?.workloadHours ?? null;
    const raw = this.form.controls.workload.value.trim();
    const value = raw === '' ? null : Number(raw);

    this.savedMessage.set(null);

    if (value !== null && (!Number.isInteger(value) || value < 1 || value > 999)) {
      this.formError.set('Informe a carga horária em horas inteiras, de 1 a 999, ou deixe em branco.');

      return;
    }

    if (value === current) {
      this.formError.set(null);

      return;
    }

    if (
      current !== null &&
      !confirm(
        `Mudar a carga horária de ${current} para ${value === null ? '"a definir"' : `${value} horas`}?\n\n` +
          'Os certificados já emitidos passam a mostrar a nova carga horária.',
      )
    ) {
      return;
    }

    this.saving.set(true);
    this.formError.set(null);
    this.courses.updateWorkload(this.slug, value).subscribe({
      next: course => {
        this.saving.set(false);
        this.apply(course);
        this.savedMessage.set('Carga horária salva.');
      },
      error: (message: string) => {
        this.saving.set(false);
        this.formError.set(message);
      },
    });
  }

  private apply(course: AdminCourse): void {
    this.error.set(null);
    this.course.set(course);
    this.form.controls.workload.setValue(course.workloadHours === null ? '' : String(course.workloadHours));
  }
}
