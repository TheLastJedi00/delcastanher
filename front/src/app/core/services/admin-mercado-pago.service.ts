import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';

/**
 * Conta recebedora como a API a devolve (Spec 020, decisao 12). Nao leva token
 * nenhum: o painel so precisa saber qual conta e ate quando.
 */
export interface ReceivingAccount {
  /** Ambiente desta API: a conexao de preview e a de producao sao separadas. */
  environment: 'production' | 'sandbox';
  /** `never` e o ambiente que nunca teve conta conectada. */
  status: 'connected' | 'disconnected' | 'revoked' | 'never';
  account: { mpUserId: string; nickname: string | null; email: string | null } | null;
  connectedAt: string | null;
  connectedByEmail: string | null;
  expiresAt: string | null;
  lastRefreshedAt: string | null;
  disconnectedAt: string | null;
  disconnectReason: string | null;
  expiringSoon: boolean;
}

/** Link de autorizacao que o admin abre ou envia ao vendedor. */
export interface ConnectionLink {
  url: string;
  expiresAt: string;
}

/**
 * Conta que recebe as vendas (Spec 020): estado, link de conexao e
 * desconexao. Quem conecta de fato e o dono da conta, no site do Mercado Pago.
 */
@Injectable({ providedIn: 'root' })
export class AdminMercadoPagoService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/admin/mercadopago/connection`;

  load(): Observable<ReceivingAccount> {
    return this.http
      .get<ReceivingAccount>(this.base)
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => this.toMessage(error))));
  }

  createLink(): Observable<ConnectionLink> {
    return this.http
      .post<ConnectionLink>(`${this.base}/link`, {})
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => this.toMessage(error))));
  }

  disconnect(): Observable<ReceivingAccount> {
    return this.http
      .delete<ReceivingAccount>(this.base)
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
