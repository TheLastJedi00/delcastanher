import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';

/** Dados do curso no painel (Spec 022, decisao 12). */
export interface AdminCourse {
  slug: string;
  title: string;
  /** Nulo e "a definir": ninguem inventa carga horaria de diploma. */
  workloadHours: number | null;
  /**
   * Soma da duracao dos videos ja processados, em segundos. So referencia
   * para quem preenche: carga horaria inclui apostila e exercicios, e **nao**
   * e derivada daqui.
   */
  videoSeconds: number;
  /** Aulas com video processado, e o total de aulas do curso. */
  videoLessons: number;
  totalLessons: number;
}

/**
 * Dados do curso no painel. Por `slug`, como os lotes (Spec 019): a
 * plataforma tem um curso, e o painel so conhece o slug dele.
 */
@Injectable({ providedIn: 'root' })
export class AdminCoursesService {
  private readonly http = inject(HttpClient);

  load(slug: string): Observable<AdminCourse> {
    return this.http
      .get<AdminCourse>(`${environment.apiUrl}/admin/courses/${slug}`)
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => this.toMessage(error))));
  }

  /** `null` volta a carga horaria para "a definir". */
  updateWorkload(slug: string, workloadHours: number | null): Observable<AdminCourse> {
    return this.http
      .patch<AdminCourse>(`${environment.apiUrl}/admin/courses/${slug}`, { workloadHours })
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => this.toMessage(error))));
  }

  /** A mensagem do servidor, quando existe: e ela que diz por que recusou. */
  private toMessage(error: HttpErrorResponse): string {
    if (error.status === 0) {
      return 'Não foi possível falar com o servidor. Verifique sua conexão e tente de novo.';
    }

    const detail = (error.error as { message?: string | string[] })?.message;

    if (Array.isArray(detail) && detail.length) {
      return detail[0];
    }

    return typeof detail === 'string' && detail
      ? detail
      : 'Não foi possível concluir a operação. Tente de novo em instantes.';
  }
}
