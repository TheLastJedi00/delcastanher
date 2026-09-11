import { BadRequestException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { storageBucket } from '../config/media.config';
import { FirebaseService } from '../firebase/firebase.service';

/** O que se envia ao bucket: o video do modulo ou um material complementar. */
export type UploadKind = 'video' | 'material';

/** 2 GB. Uma aula gravada em 1080p cabe com folga; um arquivo maior e engano. */
export const MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024;

/** 50 MB. Apostila, planilha e slide nao chegam perto disso. */
export const MAX_MATERIAL_BYTES = 50 * 1024 * 1024;

/** Validade da URL de escrita: tempo de subir o arquivo, nao mais. */
const WRITE_TTL_SECONDS = 60 * 60;

/** Validade padrao da URL de leitura. */
const READ_TTL_SECONDS = 15 * 60;

/** Teto da validade de leitura, mesmo se alguem pedir mais. */
const MAX_READ_TTL_SECONDS = 60 * 60;

const ALLOWED_TYPES: Record<UploadKind, readonly string[]> = {
  video: ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska', 'video/x-m4v'],
  material: [
    'application/pdf',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/csv',
    'text/plain',
  ],
};

const MAX_BYTES: Record<UploadKind, number> = {
  video: MAX_VIDEO_BYTES,
  material: MAX_MATERIAL_BYTES,
};

/** Pedido de URL de escrita, ja com o que precisa ser validado. */
export interface UploadUrlInput {
  kind: UploadKind;
  moduleId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

/** URL assinada de escrita e o caminho que sera gravado na confirmacao. */
export interface UploadUrlResult {
  storagePath: string;
  uploadUrl: string;
  /** Cabecalhos que o navegador **precisa** repetir no PUT, ou a assinatura falha. */
  headers: Record<string, string>;
  expiresAt: string;
}

/** URL assinada de leitura, com o instante em que deixa de valer. */
export interface ReadUrlResult {
  url: string;
  expiresAt: string;
}

/**
 * Nome de arquivo seguro para virar segmento de caminho: sem acento, sem
 * espaco, sem `/` e sem `..`. A extensao e preservada porque e ela que o
 * navegador usa para decidir como abrir o download.
 */
function slugifyFileName(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? '';
  const dot = base.lastIndexOf('.');
  const name = dot > 0 ? base.slice(0, dot) : base;
  const extension = dot > 0 ? base.slice(dot + 1) : '';

  const clean = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

  const slug = clean(name);
  const suffix = clean(extension);

  return suffix ? `${slug}.${suffix}` : slug;
}

/**
 * Acesso ao Firebase Storage. O front nunca fala com o Firebase (decisao 2):
 * quem detem a service account e a API, e o navegador so ve URLs assinadas de
 * curta duracao. Nenhum objeto do bucket e tornado publico em momento algum.
 *
 * Isolar as chamadas de rede aqui e o que permite as suites de `content`,
 * `certificates` e `progress` rodarem sem tocar em GCS (decisao 16).
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  constructor(
    private readonly firebase: FirebaseService,
    private readonly config: ConfigService,
  ) {}

  /** Caminho do video do modulo. Deterministico: substituir o arquivo sobrescreve. */
  videoPath(moduleId: string, fileName: string): string {
    return `modules/${moduleId}/video/${this.requireSlug(fileName)}`;
  }

  /** Caminho de um material do modulo. */
  materialPath(moduleId: string, fileName: string): string {
    return `modules/${moduleId}/materials/${this.requireSlug(fileName)}`;
  }

  /**
   * URL assinada v4 de escrita. A validacao de tipo e tamanho acontece **aqui**,
   * antes de existir permissao de escrita: depois que a URL sai, o navegador
   * envia o que quiser dentro do que ela permite.
   */
  async createUploadUrl(input: UploadUrlInput): Promise<UploadUrlResult> {
    const contentType = input.contentType?.split(';')[0].trim().toLowerCase() ?? '';

    if (!ALLOWED_TYPES[input.kind].includes(contentType)) {
      throw new BadRequestException(
        input.kind === 'video'
          ? 'Envie um arquivo de video (MP4, MOV, WebM ou MKV).'
          : 'Formato nao aceito. Envie PDF, planilha, documento, apresentacao ou CSV.',
      );
    }

    const limit = MAX_BYTES[input.kind];

    if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) {
      throw new BadRequestException('Informe o tamanho do arquivo em bytes.');
    }

    if (input.sizeBytes > limit) {
      throw new BadRequestException(
        `Arquivo acima do limite de ${Math.round(limit / (1024 * 1024))} MB.`,
      );
    }

    const storagePath =
      input.kind === 'video'
        ? this.videoPath(input.moduleId, input.fileName)
        : this.materialPath(input.moduleId, input.fileName);

    const expires = Date.now() + WRITE_TTL_SECONDS * 1000;

    const [uploadUrl] = await this.file(storagePath).getSignedUrl({
      version: 'v4',
      action: 'write',
      expires,
      contentType,
    });

    return {
      storagePath,
      uploadUrl,
      // O GCS assina o Content-Type junto da URL: um PUT sem o mesmo cabecalho
      // e recusado com 403, e o erro nao diz o motivo.
      headers: { 'Content-Type': contentType },
      expiresAt: new Date(expires).toISOString(),
    };
  }

  /** URL assinada v4 de leitura, de validade curta (decisoes 3 e 15). */
  async createReadUrl(storagePath: string, ttlSeconds = READ_TTL_SECONDS): Promise<ReadUrlResult> {
    const ttl = Math.min(Math.max(Math.round(ttlSeconds), 1), MAX_READ_TTL_SECONDS);
    const expires = Date.now() + ttl * 1000;

    const [url] = await this.file(storagePath).getSignedUrl({
      version: 'v4',
      action: 'read',
      expires,
    });

    return { url, expiresAt: new Date(expires).toISOString() };
  }

  /** Apaga o objeto. Objeto ja ausente e sucesso: o estado desejado e o mesmo. */
  async remove(storagePath: string): Promise<void> {
    try {
      await this.file(storagePath).delete();
    } catch (error) {
      if ((error as { code?: number }).code === 404) {
        return;
      }

      this.logger.error(`Falha ao apagar ${storagePath} do bucket.`, error as Error);
      throw new InternalServerErrorException('Nao foi possivel remover o arquivo do storage.');
    }
  }

  /**
   * Confirma que o `PUT` do navegador chegou de fato ao bucket, e devolve o
   * tamanho gravado. Sem esta checagem a API registraria no banco um material
   * cujo download responderia 404 para o aluno.
   */
  async requireUploaded(storagePath: string): Promise<{ sizeBytes: number; contentType: string }> {
    const file = this.file(storagePath);
    const [exists] = await file.exists();

    if (!exists) {
      throw new BadRequestException(
        'O arquivo nao chegou ao storage. Refaca o envio antes de confirmar.',
      );
    }

    const [metadata] = await file.getMetadata();

    return {
      sizeBytes: Number(metadata.size ?? 0),
      contentType: String(metadata.contentType ?? 'application/octet-stream'),
    };
  }

  private requireSlug(fileName: string): string {
    const slug = slugifyFileName(fileName ?? '');

    if (!slug || slug === '.') {
      throw new BadRequestException('Nome de arquivo invalido.');
    }

    return slug;
  }

  private file(storagePath: string) {
    return this.firebase.storage.bucket(storageBucket(this.config)).file(storagePath);
  }
}
