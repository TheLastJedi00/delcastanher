import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, tap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';

/**
 * Diploma do proprio aluno, como vem de `GET /certificates/me`. As datas
 * chegam como string ISO — o HTTP nao transporta `Date`.
 */
export interface StudentCertificate {
  code: string;
  hash: string;
  studentName: string;
  courseTitle: string;
  /** Nulo enquanto a carga horaria for placeholder no comercial. */
  workloadHours: number | null;
  issuedAt: string;
  status: 'ACTIVE' | 'REVOKED';
}

/** O que o portal publico exibe de um certificado valido. */
export interface PublicCertificate {
  code: string;
  studentName: string;
  courseTitle: string;
  workloadHours: number | null;
  issuedAt: string;
}

/** Por que um certificado existente nao vale. */
export type InvalidReason = 'revoked' | 'tampered';

/** Resposta de `GET /certificates/verify/:code`. */
export type CertificateVerification =
  | { status: 'valid'; certificate: PublicCertificate }
  | { status: 'invalid'; reason: InvalidReason }
  | { status: 'not_found' };

/**
 * Certificado do aluno e verificacao publica. O front nunca calcula codigo nem
 * hash: os dois nascem no servidor (Spec 008, decisao 6) e aqui sao apenas
 * exibidos.
 */
@Injectable({ providedIn: 'root' })
export class CertificateService {
  private readonly http = inject(HttpClient);

  private readonly state = signal<StudentCertificate | null>(null);

  readonly certificate = this.state.asReadonly();

  readonly issued = computed(() => this.state() !== null);

  /** Diploma do aluno logado; `null` quando ainda nao foi emitido. */
  load(): Observable<StudentCertificate | null> {
    return this.http
      .get<StudentCertificate | null>(`${environment.apiUrl}/certificates/me`)
      .pipe(
        tap(certificate => this.state.set(certificate)),
        catchError((error: HttpErrorResponse) => throwError(() => this.toMessage(error))),
      );
  }

  /** Emite o diploma. Chamar de novo devolve o mesmo certificado. */
  issue(): Observable<StudentCertificate> {
    return this.http
      .post<StudentCertificate>(`${environment.apiUrl}/certificates/me`, {})
      .pipe(
        tap(certificate => this.state.set(certificate)),
        catchError((error: HttpErrorResponse) => throwError(() => this.toMessage(error))),
      );
  }

  /**
   * Verificacao publica por codigo. A rota nao exige sessao, e os tres estados
   * chegam com status 200 — "nao encontrado" e uma resposta, nao um erro HTTP.
   */
  verify(code: string): Observable<CertificateVerification> {
    return this.http
      .get<CertificateVerification>(
        `${environment.apiUrl}/certificates/verify/${encodeURIComponent(code.trim())}`,
      )
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => this.toMessage(error))));
  }

  /** Descarta o certificado em memoria ao encerrar a sessao. */
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
      : 'Nao foi possivel carregar seu certificado. Tente novamente.';
  }
}
