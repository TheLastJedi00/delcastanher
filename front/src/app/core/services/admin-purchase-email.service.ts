import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { toMessage } from './admin-email.service';

/**
 * E-mail "Compra confirmada" pelo painel (Spec 024, Task 3.4). So o reenvio:
 * o envio automatico acontece na API, quando o pagamento e aprovado.
 */
@Injectable({ providedIn: 'root' })
export class AdminPurchaseEmailService {
  private readonly http = inject(HttpClient);

  resend(orderId: string): Observable<{ confirmationEmailedAt: string }> {
    return this.http
      .post<{ confirmationEmailedAt: string }>(
        `${environment.apiUrl}/admin/orders/${encodeURIComponent(orderId)}/confirmation-email`,
        {},
      )
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => toMessage(error))));
  }
}
