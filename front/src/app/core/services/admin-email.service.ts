import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';

/** Os tres segmentos fixos (Spec 023, decisao B2). */
export type EmailSegment = 'ALL_ACTIVE' | 'INACTIVE_7D' | 'COMPLETED';

/** Segmento com quantas pessoas recebem hoje. */
export interface EmailSegmentView {
  id: EmailSegment;
  label: string;
  count: number;
}

/** O que a tela manda: so o nome do segmento, assunto e texto simples. */
export interface CampaignDraft {
  segment: EmailSegment;
  subject: string;
  body: string;
}

/** `PARTIAL` e a campanha com entrega que falhou ou nao saiu (decisao B4). */
export type CampaignStatus = 'SENDING' | 'SENT' | 'PARTIAL';

/** Uma linha do historico (decisao B6). */
export interface CampaignView {
  id: string;
  subject: string;
  segment: EmailSegment;
  createdByEmail: string;
  status: CampaignStatus;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  createdAt: string;
  finishedAt: string | null;
}

/**
 * Aba "Disparos de E-mail" (Spec 023, Parte B). O destinatario do teste e o
 * autor da campanha vem do token, na API: daqui sai so o rascunho.
 */
@Injectable({ providedIn: 'root' })
export class AdminEmailService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/admin/email`;

  segments(): Observable<EmailSegmentView[]> {
    return this.http.get<EmailSegmentView[]>(`${this.base}/segments`).pipe(catchError(this.fail));
  }

  sendTest(draft: CampaignDraft): Observable<{ sentTo: string }> {
    return this.http.post<{ sentTo: string }>(`${this.base}/test`, draft).pipe(catchError(this.fail));
  }

  campaigns(): Observable<CampaignView[]> {
    return this.http.get<CampaignView[]>(`${this.base}/campaigns`).pipe(catchError(this.fail));
  }

  dispatch(draft: CampaignDraft): Observable<CampaignView> {
    return this.http.post<CampaignView>(`${this.base}/campaigns`, draft).pipe(catchError(this.fail));
  }

  resume(campaignId: string): Observable<CampaignView> {
    return this.http
      .post<CampaignView>(`${this.base}/campaigns/${encodeURIComponent(campaignId)}/resume`, {})
      .pipe(catchError(this.fail));
  }

  /** A mensagem do servidor, quando existe: e ela que diz por que recusou. */
  private readonly fail = (error: HttpErrorResponse) => throwError(() => toMessage(error));
}

export function toMessage(error: HttpErrorResponse): string {
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
