import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, of, tap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';

/** Curso a que o progresso pertence. `workloadHours` nulo significa "a definir". */
export interface ProgressCourse {
  slug: string;
  title: string;
  workloadHours: number | null;
}

/** Modulo da trilha com o estado do aluno logado. */
export interface ProgressModuleItem {
  id: string;
  order: number;
  title: string;
  summary: string;
  completed: boolean;
  /** Se ha video publicado neste modulo (Spec 010). */
  hasVideo: boolean;
  /**
   * Se o video ja esta reproduzivel. Falso com hasVideo verdadeiro significa
   * video em processamento ou com erro — a trilha precisa dos dois para nao
   * abrir um play que leva o aluno a um erro que nao e dele.
   */
  videoReady: boolean;
}

/** Resposta de `GET /progress/me`. */
export interface CourseProgress {
  course: ProgressCourse;
  modules: ProgressModuleItem[];
  completedCount: number;
  totalCount: number;
  percentage: number;
  nextModule: ProgressModuleItem | null;
  completed: boolean;
}

/**
 * Progresso do aluno na trilha, vindo do banco. Antes da Spec 008 esse estado
 * vivia dentro do componente da trilha — igual para todos e perdido a cada F5.
 * Centralizar aqui e o que permite o dashboard e a trilha mostrarem o mesmo
 * numero sem repetir a conta.
 */
@Injectable({ providedIn: 'root' })
export class ProgressService {
  private readonly http = inject(HttpClient);

  private readonly state = signal<CourseProgress | null>(null);

  readonly progress = this.state.asReadonly();

  /** Zero enquanto o progresso nao carregou: nada de barra indefinida na tela. */
  readonly percentage = computed(() => this.state()?.percentage ?? 0);

  readonly modules = computed(() => this.state()?.modules ?? []);

  readonly completedCount = computed(() => this.state()?.completedCount ?? 0);

  readonly totalCount = computed(() => this.state()?.totalCount ?? 0);

  /** Primeiro modulo em aberto; nulo com a trilha concluida ou nao carregada. */
  readonly nextModule = computed(() => this.state()?.nextModule ?? null);

  readonly courseCompleted = computed(() => this.state()?.completed ?? false);

  readonly course = computed(() => this.state()?.course ?? null);

  load(): Observable<CourseProgress> {
    return this.http.get<CourseProgress>(`${environment.apiUrl}/progress/me`).pipe(
      tap(progress => this.state.set(progress)),
      catchError((error: HttpErrorResponse) => throwError(() => this.toMessage(error))),
    );
  }

  /** Evita repetir a chamada a cada navegacao dentro do AVA. */
  ensureProgress(): Observable<CourseProgress | null> {
    const current = this.state();

    return current ? of(current) : this.load().pipe(catchError(() => of(null)));
  }

  /**
   * Marca ou desmarca um modulo. A API responde com o progresso recalculado,
   * entao a barra e o "proximo modulo" se atualizam sem uma segunda chamada.
   */
  setModuleCompletion(moduleId: string, completed: boolean): Observable<CourseProgress> {
    return this.http
      .patch<CourseProgress>(`${environment.apiUrl}/progress/me/modules/${moduleId}`, { completed })
      .pipe(
        tap(progress => this.state.set(progress)),
        catchError((error: HttpErrorResponse) => throwError(() => this.toMessage(error))),
      );
  }

  /** Descarta o progresso; chamado pelo `AuthService` ao encerrar a sessao. */
  clear(): void {
    this.state.set(null);
  }

  private toMessage(error: HttpErrorResponse): string {
    if (error.status === 0) {
      return 'Nao foi possivel falar com o servidor. Verifique sua conexao e tente novamente.';
    }

    const detail: unknown = error.error?.message;

    if (Array.isArray(detail)) {
      return detail.join(' ');
    }

    return typeof detail === 'string' && detail
      ? detail
      : 'Nao foi possivel carregar seu progresso. Tente novamente.';
  }
}
