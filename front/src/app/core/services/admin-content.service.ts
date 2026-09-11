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

/** Material de um modulo, como a API o devolve. */
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
  downloadUrl: string;
  downloadExpiresAt: string;
}

/** Estado do video de um modulo no painel. */
export interface ModuleVideoState {
  moduleId: string;
  hasVideo: boolean;
  status: VideoStatus | null;
  playbackId: string | null;
  fileName: string | null;
  sizeBytes: number | null;
  error: string | null;
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
 * Envio de conteudo pelo administrador, em tres passos (Spec 010, decisao 3):
 * pedir a URL assinada, mandar o arquivo **direto** ao bucket e confirmar na
 * API. O arquivo nunca passa pelo servidor — a API roda como funcao
 * serverless, onde o corpo de uma request cabe em poucos megabytes.
 */
@Injectable({ providedIn: 'root' })
export class AdminContentService {
  private readonly http = inject(HttpClient);

  /** Envia o video de um modulo, emitindo o progresso do PUT. */
  uploadVideo(moduleId: string, file: File): Observable<UploadProgress<ModuleVideoState>> {
    return this.upload<ModuleVideoState>(
      file,
      `${environment.apiUrl}/admin/modules/${moduleId}/video/upload-url`,
      `${environment.apiUrl}/admin/modules/${moduleId}/video`,
    );
  }

  /** Envia um material complementar de um modulo. */
  uploadMaterial(moduleId: string, file: File): Observable<UploadProgress<MaterialItem>> {
    return this.upload<MaterialItem>(
      file,
      `${environment.apiUrl}/admin/modules/${moduleId}/materials/upload-url`,
      `${environment.apiUrl}/admin/modules/${moduleId}/materials`,
    );
  }

  /** Estado do processamento do video, consultado enquanto o Mux ingere. */
  videoState(moduleId: string): Observable<ModuleVideoState> {
    return this.http
      .get<ModuleVideoState>(`${environment.apiUrl}/admin/modules/${moduleId}/video`)
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => this.toMessage(error))));
  }

  /** Materiais ja enviados para o modulo. */
  materials(moduleId: string): Observable<MaterialItem[]> {
    return this.http
      .get<MaterialItem[]>(`${environment.apiUrl}/admin/modules/${moduleId}/materials`)
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
