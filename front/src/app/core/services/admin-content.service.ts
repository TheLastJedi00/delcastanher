import { HttpClient, HttpErrorResponse, HttpEvent, HttpEventType } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { EMPTY, Observable, catchError, map, of, switchMap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';

/** Estagios da ingestao do video no Mux, como a API os grava. */
export type VideoStatus = 'PENDING' | 'PROCESSING' | 'READY' | 'ERRORED';

/** Rotulo curto do material, o mesmo que o `ui-material-item` usa no icone. */
export type MaterialKind = 'pdf' | 'xls' | 'doc';

/** Permissao de escrita no bucket, devolvida pelo passo 1. */
interface UploadTicket {
  storagePath: string;
  uploadUrl: string;
  /** Precisam ser repetidos no PUT: a assinatura cobre o Content-Type. */
  headers: Record<string, string>;
  expiresAt: string;
}

/** Material de uma aula, como a API o devolve. */
export interface MaterialItem {
  id: string;
  fileName: string;
  fileType: MaterialKind;
  contentType: string;
  sizeBytes: number;
  order: number;
  moduleId: string;
  moduleOrder: number;
  moduleTitle: string;
  lessonId: string;
  lessonOrder: number;
  lessonTitle: string;
  downloadUrl: string;
  downloadExpiresAt: string;
}

/**
 * Modulo da grade no painel. `certificateCount` existe para a tela explicar
 * por que nao ha remocao de modulo: o diploma emitido dele continua valendo
 * (Spec 012, decisao 15).
 */
export interface AdminModule {
  id: string;
  order: number;
  title: string;
  summary: string;
  /** Preco de venda em centavos; nulo = "a definir" (Spec 014, decisao 1). */
  priceCents: number | null;
  lessonCount: number;
  certificateCount: number;
}

/** Estado do video de uma aula no painel. */
export interface LessonVideoState {
  lessonId: string;
  hasVideo: boolean;
  status: VideoStatus | null;
  playbackId: string | null;
  fileName: string | null;
  sizeBytes: number | null;
  error: string | null;
  durationSeconds: number | null;
}

/**
 * Aula como o painel a ve. `completedBy` e o numero que a confirmacao de
 * remocao mostra: apagar a aula apaga o progresso de quem a concluiu
 * (decisao 16).
 */
export interface AdminLesson {
  id: string;
  moduleId: string;
  order: number;
  title: string;
  summary: string;
  video: LessonVideoState;
  materialCount: number;
  completedBy: number;
}

/**
 * Andamento de um envio. `progress` e inteiro de 0 a 100; `done` so chega
 * depois da confirmacao na API, nao do fim do PUT — um arquivo no bucket sem
 * registro no banco nao e um upload concluido.
 */
export type UploadProgress<T> =
  | { phase: 'signing' | 'uploading' | 'confirming'; progress: number }
  | { phase: 'done'; progress: 100; result: T };

/**
 * Administracao de conteudo: a grade (modulos e aulas) e os arquivos de cada
 * aula.
 *
 * O envio continua em tres passos (Spec 010, decisao 3): pedir a URL assinada,
 * mandar o arquivo **direto** ao bucket e confirmar na API. O arquivo nunca
 * passa pelo servidor — a API roda como funcao serverless, onde o corpo de uma
 * request cabe em poucos megabytes. O que mudou na Spec 012 e o dono: o
 * arquivo pertence a uma aula, nao ao modulo.
 */
@Injectable({ providedIn: 'root' })
export class AdminContentService {
  private readonly http = inject(HttpClient);

  /** Envia o video de uma aula, emitindo o progresso do PUT. */
  uploadVideo(lessonId: string, file: File): Observable<UploadProgress<LessonVideoState>> {
    return this.upload<LessonVideoState>(
      file,
      `${environment.apiUrl}/admin/lessons/${lessonId}/video/upload-url`,
      `${environment.apiUrl}/admin/lessons/${lessonId}/video`,
    );
  }

  /** Envia um material complementar de uma aula. */
  uploadMaterial(lessonId: string, file: File): Observable<UploadProgress<MaterialItem>> {
    return this.upload<MaterialItem>(
      file,
      `${environment.apiUrl}/admin/lessons/${lessonId}/materials/upload-url`,
      `${environment.apiUrl}/admin/lessons/${lessonId}/materials`,
    );
  }

  /**
   * Grade do curso.
   *
   * Ate a Spec 010 esta lista vinha de `GET /progress/me`, porque nao havia o
   * que administrar num modulo e o progresso ja trazia os 12 em ordem. Com a
   * Spec 012 o painel passa a criar, renomear e reordenar: ele precisa da
   * contagem de aulas e de diplomas, que progresso de aluno nao tem.
   */
  modules(): Observable<AdminModule[]> {
    return this.http
      .get<AdminModule[]>(`${environment.apiUrl}/admin/modules`)
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => this.toMessage(error))));
  }

  createModule(input: { title: string; summary: string }): Observable<AdminModule> {
    return this.http
      .post<AdminModule>(`${environment.apiUrl}/admin/modules`, input)
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => this.toMessage(error))));
  }

  updateModule(
    moduleId: string,
    input: { title?: string; summary?: string },
  ): Observable<AdminModule> {
    return this.http
      .patch<AdminModule>(`${environment.apiUrl}/admin/modules/${moduleId}`, input)
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => this.toMessage(error))));
  }

  /**
   * Preco de venda do modulo, em centavos (Spec 014, decisao 1).
   *
   * Rota propria, separada de `updateModule`: titulo e resumo sao
   * conteudo, preco e decisao comercial. `null` volta o modulo para
   * "a definir" e o tira da loja.
   */
  updateModulePrice(moduleId: string, priceCents: number | null): Observable<AdminModule> {
    return this.http
      .patch<AdminModule>(`${environment.apiUrl}/admin/modules/${moduleId}/price`, {
        priceCents,
      })
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => this.toMessage(error))));
  }

  /** Lista completa de ids na ordem desejada, gravada em transacao (decisao 17). */
  reorderModules(ids: string[]): Observable<void> {
    return this.http
      .patch<void>(`${environment.apiUrl}/admin/course/modules/order`, { ids })
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => this.toMessage(error))));
  }

  /** Aulas do modulo, com estado do video e os numeros da remocao. */
  lessons(moduleId: string): Observable<AdminLesson[]> {
    return this.http
      .get<AdminLesson[]>(`${environment.apiUrl}/admin/modules/${moduleId}/lessons`)
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => this.toMessage(error))));
  }

  createLesson(
    moduleId: string,
    input: { title: string; summary: string },
  ): Observable<AdminLesson> {
    return this.http
      .post<AdminLesson>(`${environment.apiUrl}/admin/modules/${moduleId}/lessons`, input)
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => this.toMessage(error))));
  }

  updateLesson(
    lessonId: string,
    input: { title?: string; summary?: string },
  ): Observable<AdminLesson> {
    return this.http
      .patch<AdminLesson>(`${environment.apiUrl}/admin/lessons/${lessonId}`, input)
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => this.toMessage(error))));
  }

  /** Remove a aula com o video, os materiais e as conclusoes dela (decisao 16). */
  removeLesson(lessonId: string): Observable<void> {
    return this.http
      .delete<void>(`${environment.apiUrl}/admin/lessons/${lessonId}`)
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => this.toMessage(error))));
  }

  reorderLessons(moduleId: string, ids: string[]): Observable<void> {
    return this.http
      .patch<void>(`${environment.apiUrl}/admin/modules/${moduleId}/lessons/order`, { ids })
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => this.toMessage(error))));
  }

  /** Estado do processamento do video, consultado enquanto o Mux ingere. */
  videoState(lessonId: string): Observable<LessonVideoState> {
    return this.http
      .get<LessonVideoState>(`${environment.apiUrl}/admin/lessons/${lessonId}/video`)
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => this.toMessage(error))));
  }

  /** Materiais ja enviados para a aula. */
  materials(lessonId: string): Observable<MaterialItem[]> {
    return this.http
      .get<MaterialItem[]>(`${environment.apiUrl}/admin/lessons/${lessonId}/materials`)
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => this.toMessage(error))));
  }

  removeMaterial(id: string): Observable<void> {
    return this.http
      .delete<void>(`${environment.apiUrl}/admin/materials/${id}`)
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => this.toMessage(error))));
  }

  /**
   * Os tres passos em sequencia. O PUT no bucket sai sem o header de sessao
   * porque o `authInterceptor` so anexa o token a chamadas do
   * `environment.apiUrl` — mandar o idToken do Firebase para o Google Cloud
   * Storage vazaria a credencial para fora da API sem nenhum ganho: a URL
   * assinada ja e a autorizacao.
   */
  private upload<T>(
    file: File,
    signUrl: string,
    confirmUrl: string,
  ): Observable<UploadProgress<T>> {
    const payload = {
      fileName: file.name,
      contentType: file.type || 'application/octet-stream',
      sizeBytes: file.size,
    };

    return this.http.post<UploadTicket>(signUrl, payload).pipe(
      switchMap(ticket =>
        this.http
          .put(ticket.uploadUrl, file, {
            headers: ticket.headers,
            reportProgress: true,
            observe: 'events',
            responseType: 'text',
          })
          .pipe(
            switchMap((event: HttpEvent<unknown>): Observable<UploadProgress<T>> => {
              if (event.type === HttpEventType.UploadProgress) {
                const total = event.total ?? file.size;

                return of<UploadProgress<T>>({
                  phase: 'uploading',
                  progress: total ? Math.round((event.loaded / total) * 100) : 0,
                });
              }

              if (event.type !== HttpEventType.Response) {
                return EMPTY;
              }

              // Confirmacao: so aqui o registro nasce no banco.
              return this.http
                .post<T>(confirmUrl, {
                  storagePath: ticket.storagePath,
                  fileName: file.name,
                  contentType: payload.contentType,
                })
                .pipe(map(result => ({ phase: 'done', progress: 100, result }) as UploadProgress<T>));
            }),
          ),
      ),
      catchError((error: HttpErrorResponse) => throwError(() => this.toMessage(error))),
    );
  }

  private toMessage(error: HttpErrorResponse): string {
    if (error.status === 0) {
      return 'Nao foi possivel falar com o servidor. Verifique sua conexao e tente novamente.';
    }

    if (error.status === 403) {
      return 'Esta ação é restrita a administradores.';
    }

    const detail: unknown = error.error?.message;

    if (Array.isArray(detail)) {
      return detail.join(' ');
    }

    return typeof detail === 'string' && detail
      ? detail
      : 'Não foi possível concluir o envio. Tente novamente.';
  }
}
