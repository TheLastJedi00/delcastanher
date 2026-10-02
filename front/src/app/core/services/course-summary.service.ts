import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { PUBLIC_REQUEST } from '../interceptors/auth.interceptor';

/** `GET /courses/:slug/summary` (Spec 022, decisoes 13 e 14). */
export interface CourseSummary {
  /** Nulo e "a definir": a vitrine esconde o cartao e a pergunta do FAQ. */
  workloadHours: number | null;
  /** Validade do acesso, lida da constante que o concede na API. */
  accessMonths: number;
}

/**
 * Dados reais do curso para a vitrine. Sem token e com cache na CDN, como os
 * documentos legais (decisao 16); `fresh` pula o transfer cache da hidratacao.
 */
@Injectable({ providedIn: 'root' })
export class CourseSummaryService {
  private readonly http = inject(HttpClient);

  summary(slug: string, fresh = false): Observable<CourseSummary> {
    return this.http.get<CourseSummary>(`${environment.apiUrl}/courses/${slug}/summary`, {
      context: new HttpContext().set(PUBLIC_REQUEST, true),
      transferCache: !fresh,
    });
  }
}
