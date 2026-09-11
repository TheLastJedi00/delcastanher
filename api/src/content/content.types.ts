/**
 * Rotulo curto do arquivo, o mesmo vocabulario que o `ui-material-item` do
 * front ja usa no icone. E derivado do MIME na leitura, e nao guardado: o que
 * a coluna `fileType` do banco grava e o MIME completo, que e o dado real.
 */
export type MaterialKind = 'pdf' | 'xls' | 'doc';

/**
 * Permissao de escrita no bucket. O arquivo nunca passa pela API (decisao 3):
 * o navegador faz o `PUT` direto no Google Cloud Storage com esta URL e
 * **exatamente** estes cabecalhos — a assinatura cobre o Content-Type.
 */
export interface UploadTicket {
  storagePath: string;
  uploadUrl: string;
  headers: Record<string, string>;
  expiresAt: string;
}

/**
 * Material como o aluno o recebe. Nunca sai daqui o caminho no bucket: o que
 * o front usa e a URL assinada, gerada no momento da consulta e de validade
 * curta (decisao 15).
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

/** MIMEs mapeados para o rotulo curto exibido no item de material. */
const KIND_BY_TYPE: Record<string, MaterialKind> = {
  'application/pdf': 'pdf',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xls',
  'text/csv': 'xls',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'doc',
  'application/vnd.ms-powerpoint': 'doc',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'doc',
  'text/plain': 'doc',
};

/** Rotulo curto do material. Tipo desconhecido cai em `doc`, nunca em vazio. */
export function materialKind(contentType: string): MaterialKind {
  return KIND_BY_TYPE[contentType?.toLowerCase()] ?? 'doc';
}

/** Estagios da ingestao, espelhando o enum `VideoStatus` do banco. */
export type VideoStatus = 'PENDING' | 'PROCESSING' | 'READY' | 'ERRORED';

/**
 * Estado do video de um modulo. `hasVideo` falso e o modulo que ainda nao
 * recebeu arquivo — diferente de um video que falhou no processamento, e o
 * painel e a trilha precisam distinguir os dois.
 */
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
 * Autorizacao de reproducao. O `playbackId` sozinho nao reproduz nada: os
 * assets tem policy `signed` e e o `token` que libera o player (decisao 6).
 */
export interface PlaybackGrant {
  playbackId: string;
  token: string;
  expiresAt: string;
}

/** Evento do webhook do Mux, no que esta API consome. */
export interface MuxWebhookEvent {
  type: string;
  data: {
    id?: string;
    playback_ids?: { id: string }[];
    errors?: { messages?: string[] };
  };
}
