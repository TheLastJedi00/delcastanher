import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { BundleOffer, OfferModule } from './store.service';

export type PromotionStatus = 'SCHEDULED' | 'RUNNING' | 'ENDED';

/** Campanha como a API a devolve (Spec 032, decisao 10). Datas em ISO UTC. */
export interface Promotion {
  id: string;
  name: string;
  percentOff: number;
  startsAt: string;
  endsAt: string;
  endedEarlyAt: string | null;
  status: PromotionStatus;
}

/** Pedidos pagos da campanha. Estornado nao entra, como na receita. */
export interface PromotionTotals {
  paidOrders: number;
  revenueCents: number;
  discountCents: number;
}

export interface PromotionListItem extends Promotion {
  totals: PromotionTotals;
}

/** O que o formulario manda. Datas em ISO com o deslocamento de Brasilia. */
export interface PromotionInput {
  name: string;
  percentOff: number;
  startsAt: string;
  endsAt: string;
}

/** Previa do formulario: os precos da loja com a porcentagem digitada. */
export interface PromotionPreview {
  modules: OfferModule[];
  bundle: BundleOffer | null;
}

/**
 * Campanhas de desconto no Financeiro (Spec 032). O front nao calcula
 * desconto: a previa vem da API, pela mesma conta da loja (decisao 4).
 */
@Injectable({ providedIn: 'root' })
export class AdminPromotionsService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/admin/promotions`;

  list(): Observable<PromotionListItem[]> {
    return this.http.get<PromotionListItem[]>(this.base).pipe(catchError(error => this.fail(error)));
  }

  preview(percentOff: number): Observable<PromotionPreview> {
    return this.http
      .get<PromotionPreview>(`${this.base}/preview`, { params: { percentOff } })
      .pipe(catchError(error => this.fail(error)));
  }

  create(input: PromotionInput): Observable<Promotion> {
    return this.http.post<Promotion>(this.base, input).pipe(catchError(error => this.fail(error)));
  }

  /** So os campos que mudam; a API decide o que pode mudar pelo estado (decisao 2). */
  update(id: string, input: Partial<PromotionInput>): Observable<Promotion> {
    return this.http
      .patch<Promotion>(`${this.base}/${encodeURIComponent(id)}`, input)
      .pipe(catchError(error => this.fail(error)));
  }

  remove(id: string): Observable<void> {
    return this.http
      .delete<void>(`${this.base}/${encodeURIComponent(id)}`)
      .pipe(catchError(error => this.fail(error)));
  }

  end(id: string): Observable<Promotion> {
    return this.http
      .post<Promotion>(`${this.base}/${encodeURIComponent(id)}/end`, {})
      .pipe(catchError(error => this.fail(error)));
  }

  private fail(error: HttpErrorResponse): Observable<never> {
    return throwError(() => this.toMessage(error));
  }

  private toMessage(error: HttpErrorResponse): string {
    if (error.status === 0) {
      return 'Não foi possível falar com o servidor. Verifique sua conexão e tente novamente.';
    }

    if (error.status === 403) {
      return 'Esta área é restrita a administradores.';
    }

    const detail: unknown = error.error?.message;

    if (Array.isArray(detail)) {
      return detail.join(' ');
    }

    return typeof detail === 'string' && detail
      ? detail
      : 'Não foi possível concluir a operação. Tente novamente.';
  }
}
