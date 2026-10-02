import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { toMessage } from './admin-email.service';

/** Situacoes da nota (Spec 023, decisoes A2, A5 e A7). */
export type InvoiceStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'UNKNOWN'
  | 'AUTHORIZED'
  | 'DENIED'
  | 'ERROR'
  | 'CANCELLING'
  | 'CANCELLED'
  | 'CANCEL_ERROR'
  | 'REFUND_PENDING';

/** A nota na listagem do financeiro (decisao A9). */
export interface InvoiceSummary {
  status: InvoiceStatus;
  /** `homologacao` aparece com selo (decisao A6). */
  environment: string;
  number: string | null;
  series: string | null;
  accessKey: string | null;
  lastError: string | null;
  issuedAt: string | null;
  hasPdf: boolean;
}

/** Ambiente, prazo de cancelamento e certificado (decisoes A6, A7 e A10). */
export interface InvoiceSettings {
  enabled: boolean;
  environment: 'producao' | 'homologacao';
  certificateExpiresAt: string | null;
  certificateDaysLeft: number | null;
  certificateWarning: boolean;
  cancelWindowHours: number;
}

/**
 * Acoes da nota no painel financeiro (Spec 023, decisao A9). Quem decide se a
 * acao vale para a situacao e a API; a tela so oferece o que faz sentido.
 */
@Injectable({ providedIn: 'root' })
export class AdminInvoicesService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/admin/invoices`;

  config(): Observable<InvoiceSettings> {
    return this.http.get<InvoiceSettings>(`${this.base}/config`).pipe(catchError(this.fail));
  }

  issue(orderId: string, confirmNoInvoice = false): Observable<InvoiceSummary> {
    return this.http
      .post<InvoiceSummary>(`${this.url(orderId)}/issue`, { confirmNoInvoice })
      .pipe(catchError(this.fail));
  }

  link(orderId: string, invoiceId: string): Observable<InvoiceSummary> {
    return this.http
      .post<InvoiceSummary>(`${this.url(orderId)}/link`, { invoiceId })
      .pipe(catchError(this.fail));
  }

  cancel(orderId: string): Observable<InvoiceSummary> {
    return this.http.post<InvoiceSummary>(`${this.url(orderId)}/cancel`, {}).pipe(catchError(this.fail));
  }

  resendEmail(orderId: string): Observable<InvoiceSummary> {
    return this.http.post<InvoiceSummary>(`${this.url(orderId)}/email`, {}).pipe(catchError(this.fail));
  }

  sync(orderId: string): Observable<InvoiceSummary> {
    return this.http.post<InvoiceSummary>(`${this.url(orderId)}/sync`, {}).pipe(catchError(this.fail));
  }

  pdf(orderId: string): Observable<{ url: string; expiresAt: string }> {
    return this.http
      .get<{ url: string; expiresAt: string }>(`${this.url(orderId)}/pdf`)
      .pipe(catchError(this.fail));
  }

  private url(orderId: string): string {
    return `${this.base}/${encodeURIComponent(orderId)}`;
  }

  private readonly fail = (error: HttpErrorResponse) => throwError(() => toMessage(error));
}
