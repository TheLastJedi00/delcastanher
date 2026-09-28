import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';

/** Lote no painel, com as vagas ocupadas e se e o vigente (Spec 019). */
export interface AdminBundleTier {
  id: string;
  order: number;
  name: string;
  priceCents: number;
  /** Nulo = sem limite, so no ultimo lote. */
  capacity: number | null;
  occupied: number;
  current: boolean;
}

export interface AdminBundle {
  slug: string;
  title: string;
  active: boolean;
  tiers: AdminBundleTier[];
}

/** O que o painel pode mudar num lote: preco e vagas (decisao 13). */
export interface UpdateTierInput {
  priceCents?: number;
  capacity?: number | null;
}

/**
 * Pacote e lotes no painel (Spec 019, decisao 13). Leitura dos lotes com as
 * vagas ocupadas e edicao de preco e vagas — criar pacote ou lote e spec
 * propria.
 */
@Injectable({ providedIn: 'root' })
export class AdminBundlesService {
  private readonly http = inject(HttpClient);

  load(slug: string): Observable<AdminBundle> {
    return this.http
      .get<AdminBundle>(`${environment.apiUrl}/admin/bundles/${slug}`)
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => this.toMessage(error))));
  }

  updateTier(slug: string, tierId: string, input: UpdateTierInput): Observable<AdminBundleTier> {
    return this.http
      .patch<AdminBundleTier>(`${environment.apiUrl}/admin/bundles/${slug}/tiers/${tierId}`, input)
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
