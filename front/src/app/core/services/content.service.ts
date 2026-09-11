import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, of, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';

/** Rotulo curto do material, o mesmo que o `ui-material-item` usa no icone. */
export type MaterialKind = 'pdf' | 'xls' | 'doc';

/**
 * Material como o aluno o recebe. `downloadUrl` e uma URL assinada de
 * validade curta, gerada no momento da consulta — nao um link permanente, e
 * nunca o caminho no bucket (Spec 010, decisao 15).
 */
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

/**
 * Autorizacao de reproducao. O `playbackId` sozinho nao reproduz nada: os
 * assets do Mux tem policy `signed` (decisao 6).
 */
export interface PlaybackGrant {
  playbackId: string;
  token: string;
  expiresAt: string;
}

/** Por que o video de um modulo nao pode ser reproduzido agora. */
export type PlaybackBlock = 'processing' | 'none';

/**
 * Conteudo como o aluno o consome: video e materiais de um modulo, e a
 * central de materiais do curso.
 *
 * Ate a Spec 010 os materiais eram dois arrays hardcoded em telas diferentes,
 * com conteudo divergente para o mesmo curso.
 */
@Injectable({ providedIn: 'root' })
export class ContentService {
  private readonly http = inject(HttpClient);

  /** Materiais de um modulo, com URL de download assinada. */
  materialsOf(moduleId: string): Observable<MaterialItem[]> {
    return this.http
      .get<MaterialItem[]>(`${environment.apiUrl}/modules/${moduleId}/materials`)
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => this.toMessage(error))));
  }

  /** Todos os materiais do curso, para a central em `/ava/materiais`. */
  allMaterials(): Observable<MaterialItem[]> {
    return this.http
      .get<MaterialItem[]>(`${environment.apiUrl}/materials`)
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => this.toMessage(error))));
  }

  /**
   * Token de reproducao do modulo. O 409 da API — video ausente ou ainda em
   * processamento — nao e erro de tela: chega como `null` para a trilha
   * mostrar o estado certo em vez de uma mensagem de falha.
   */
  playback(moduleId: string): Observable<PlaybackGrant | null> {
    return this.http
      .get<PlaybackGrant>(`${environment.apiUrl}/modules/${moduleId}/playback-token`)
      .pipe(
        catchError((error: HttpErrorResponse) =>
          error.status === 409 ? of(null) : throwError(() => this.toMessage(error)),
        ),
      );
  }

  private toMessage(error: HttpErrorResponse): string {
    if (error.status === 0) {
      return 'Não foi possível falar com o servidor. Verifique sua conexão e tente novamente.';
    }

    const detail: unknown = error.error?.message;

    if (Array.isArray(detail)) {
      return detail.join(' ');
    }

    return typeof detail === 'string' && detail
      ? detail
      : 'Não foi possível carregar o conteúdo desta aula. Tente novamente.';
  }
}

/**
 * Tamanho legivel de um arquivo. Vive aqui, e nao em cada tela, porque a
 * trilha, a central de materiais e o painel do admin exibem o mesmo dado — e
 * ja divergiram uma vez, quando cada lista era hardcoded no componente.
 */
export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) {
    return '';
  }

  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.round(bytes / 1024)} KB`;
}
