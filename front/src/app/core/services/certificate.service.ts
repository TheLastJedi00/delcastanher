import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, tap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';

/**
 * A que a conclusao se refere (Spec 010, decisao 11). O diploma do curso da
 * Spec 008 segue existindo: os dois convivem.
 */
export type CertificateScope = 'course' | 'module';

/**
 * Diploma do proprio aluno, como vem de `GET /certificates/me`. As datas
 * chegam como string ISO — o HTTP nao transporta `Date`.
 */
export interface StudentCertificate {
  code: string;
  hash: string;
  /** `course` e o diploma da trilha inteira; `module`, o de um modulo. */
  scope: CertificateScope;
  studentName: string;
  courseTitle: string;
  /** Nulo no diploma do curso; o titulo do modulo no diploma de modulo. */
  moduleTitle: string | null;
  /** Id do modulo certificado, para a trilha ligar o diploma ao modulo. */
  moduleId: string | null;
  /** Nulo enquanto a carga horaria for placeholder no comercial. */
  workloadHours: number | null;
  issuedAt: string;
  status: 'ACTIVE' | 'REVOKED';
}

/** O que o portal publico exibe de um certificado valido. */
export interface PublicCertificate {
  code: string;
  scope: CertificateScope;
  studentName: string;
  courseTitle: string;
  moduleTitle: string | null;
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

  /** Diplomas de modulo ja emitidos, na ordem dos modulos. */
  private readonly modules = signal<StudentCertificate[]>([]);

  readonly moduleCertificates = this.modules.asReadonly();

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

  /**
   * Diplomas de modulo do aluno, indexados pelo id do modulo — e assim que a
   * trilha pergunta "este modulo ja tem diploma?" sem varrer a lista.
   */
  loadModuleCertificates(): Observable<StudentCertificate[]> {
    return this.http
      .get<StudentCertificate[]>(`${environment.apiUrl}/certificates/me/modules`)
      .pipe(
        tap(certificates => this.modules.set(certificates)),
        catchError((error: HttpErrorResponse) => throwError(() => this.toMessage(error))),
      );
  }

  /** Emite o diploma de um modulo concluido. Chamar de novo devolve o mesmo. */
  issueForModule(moduleId: string): Observable<StudentCertificate> {
    return this.http
      .post<StudentCertificate>(`${environment.apiUrl}/certificates/me/modules/${moduleId}`, {})
      .pipe(
        tap(certificate =>
          this.modules.update(list => [
            ...list.filter(item => item.moduleId !== certificate.moduleId),
            certificate,
          ]),
        ),
        catchError((error: HttpErrorResponse) => throwError(() => this.toMessage(error))),
      );
  }

  /** Diploma ja emitido para um modulo, ou nulo. */
  certificateOfModule(moduleId: string): StudentCertificate | null {
    return this.modules().find(certificate => certificate.moduleId === moduleId) ?? null;
  }

  /** Descarta os certificados em memoria ao encerrar a sessao. */
  clear(): void {
    this.state.set(null);
    this.modules.set([]);
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
