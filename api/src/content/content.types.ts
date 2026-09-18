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
  lessonId: string;
  lessonOrder: number;
  lessonTitle: string;
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
 * Estado do video de uma aula. `hasVideo` falso e a aula que ainda nao
 * recebeu arquivo — diferente de um video que falhou no processamento, e o
 * painel e a trilha precisam distinguir os dois.
 *
 * `durationSeconds` vem do Mux no `video.asset.ready` e alimenta o tempo
 * exibido na trilha horizontal (decisao 18).
 */
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
    duration?: number;
    errors?: { messages?: string[] };
  };
}

/**
 * Aula como o painel do administrador a ve: o que ela e, o estado do video e
 * os dois numeros que a confirmacao de remocao precisa (decisao 16).
 */
export interface AdminLessonItem {
  id: string;
  moduleId: string;
  order: number;
  title: string;
  summary: string;
  video: LessonVideoState;
  materialCount: number;
  /** Quantos alunos ja concluiram esta aula. */
  completedBy: number;
}

/**
 * Modulo como o painel o ve. `certificateCount` existe para a UI explicar por
 * que nao ha remocao de modulo: o diploma emitido dele continua valendo
 * (decisao 15).
 */
export interface AdminModuleItem {
  id: string;
  order: number;
  title: string;
  summary: string;
  /** Preco de venda em centavos; nulo = "a definir" (Spec 014, decisao 1). */
  priceCents: number | null;
  lessonCount: number;
  certificateCount: number;
}
