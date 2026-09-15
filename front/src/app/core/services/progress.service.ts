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

/**
 * Aula com o estado do aluno logado. Desde a Spec 012 e aqui que vive o
 * conteudo: um modulo tem varias aulas, e cada uma tem o seu video.
 */
export interface ProgressLessonItem {
  id: string;
  order: number;
  title: string;
  summary: string;
  completed: boolean;
  /** Se ha video publicado nesta aula. */
  hasVideo: boolean;
  /**
   * Se o video ja esta reproduzivel. Falso com hasVideo verdadeiro significa
   * video em processamento ou com erro — a trilha precisa dos dois para nao
   * abrir um play que leva o aluno a um erro que nao e dele.
   */
  videoReady: boolean;
  /** Duracao vinda do Mux; nula enquanto o video nao processou. */
  durationSeconds: number | null;
}

/**
 * Modulo da trilha: um container de aulas. O completed e derivado no servidor
 * (todas as aulas concluidas), e os contadores vem prontos para a tela nao
 * refazer a conta.
 */
export interface ProgressModuleItem {
  id: string;
  order: number;
  title: string;
  summary: string;
  completed: boolean;
  lessons: ProgressLessonItem[];
  completedCount: number;
  totalCount: number;
  /** Primeira aula em aberto deste modulo. */
  nextLesson: ProgressLessonItem | null;
}

/** Resposta de `GET /progress/me`. */
export interface CourseProgress {
  course: ProgressCourse;
  modules: ProgressModuleItem[];
  completedCount: number;
  totalCount: number;
  percentage: number;
  nextModule: ProgressModuleItem | null;
  /** Primeira aula em aberto do curso — destino do "Retomar". */
  nextLesson: ProgressLessonItem | null;
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

  /** Modulo da proxima aula em aberto; nulo com a trilha concluida. */
  readonly nextModule = computed(() => this.state()?.nextModule ?? null);

  /** Primeira aula em aberto do curso. E ela que o "Retomar" abre. */
  readonly nextLesson = computed(() => this.state()?.nextLesson ?? null);

  /** Todas as aulas publicadas, na ordem da trilha. */
  readonly lessons = computed(() => this.modules().flatMap(module => module.lessons));

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
   * Marca ou desmarca uma **aula**. A API responde com o progresso
   * recalculado, entao a barra e a "proxima aula" se atualizam sem uma segunda
   * chamada.
   *
   * Nao existe equivalente por modulo desde a Spec 012 (decisao 5): a
   * conclusao do modulo e derivada das aulas, e marcar o modulo concluiria em
   * cascata videos que o aluno nao assistiu.
   */
  setLessonCompletion(lessonId: string, completed: boolean): Observable<CourseProgress> {
    return this.http
      .patch<CourseProgress>(`${environment.apiUrl}/progress/me/lessons/${lessonId}`, { completed })
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
