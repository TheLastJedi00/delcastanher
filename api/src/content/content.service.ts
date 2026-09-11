import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { MaterialItem, UploadTicket, materialKind } from './content.types';

/** Pedido de URL de escrita de um material. */
export interface MaterialUploadInput {
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

/** Confirmacao do upload de um material. */
export interface MaterialConfirmInput {
  storagePath: string;
  fileName: string;
  contentType: string;
  order?: number;
}

/** Material como vem do Prisma, com o modulo incluido. */
interface MaterialRow {
  id: string;
  moduleId: string;
  storagePath: string;
  fileName: string;
  fileType: string;
  sizeBytes: number;
  order: number;
  module: { order: number; title: string };
}

const WITH_MODULE = { module: { select: { order: true, title: true } } };

/**
 * Conteudo de um modulo: os materiais complementares nesta parte, o video na
 * parte do `VideoService`.
 *
 * Ate a Spec 010 os materiais eram dois arrays hardcoded — um na trilha, outro
 * em `/ava/materiais`, com conteudo diferente para o mesmo curso (decisao 15).
 * A partir daqui a lista e dado, e o download e sempre uma URL assinada gerada
 * na hora da consulta: o caminho do bucket nunca sai da API.
 */
@Injectable()
export class ContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /** Passo 1 do upload: permissao de escrita direto no bucket (decisao 3). */
  async createMaterialUploadUrl(
    moduleId: string,
    input: MaterialUploadInput,
  ): Promise<UploadTicket> {
    await this.requireModule(moduleId);

    return this.storage.createUploadUrl({
      kind: 'material',
      moduleId,
      fileName: input.fileName,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
    });
  }

  /**
   * Passo 3 do upload: o registro so nasce depois de o objeto existir no
   * bucket. `upsert` pelo caminho — reenviar o mesmo arquivo corrige o
   * registro em vez de criar um material duplicado apontando para o mesmo
   * objeto.
   */
  async confirmMaterial(moduleId: string, input: MaterialConfirmInput): Promise<MaterialItem> {
    const module = await this.requireModule(moduleId);

    this.requirePathOfModule(moduleId, input.storagePath);

    const uploaded = await this.storage.requireUploaded(input.storagePath);

    // O tamanho e o tipo saem da metadata do bucket, nao do corpo da request:
    // o que vale e o que foi de fato gravado.
    const data = {
      moduleId,
      storagePath: input.storagePath,
      fileName: input.fileName.trim(),
      fileType: uploaded.contentType || input.contentType,
      sizeBytes: uploaded.sizeBytes,
      order: input.order ?? (await this.prisma.material.count({ where: { moduleId } })),
    };

    const material = (await this.prisma.material.upsert({
      where: { storagePath: input.storagePath },
      create: data,
      update: { fileName: data.fileName, fileType: data.fileType, sizeBytes: data.sizeBytes },
      include: WITH_MODULE,
    })) as MaterialRow;

    return this.toItem({ ...material, module: material.module ?? module });
  }

  /** Materiais de um modulo, com URL de download assinada na hora. */
  async listForModule(moduleId: string): Promise<MaterialItem[]> {
    await this.requireModule(moduleId);

    const materials = (await this.prisma.material.findMany({
      where: { moduleId },
      orderBy: [{ order: 'asc' }, { fileName: 'asc' }],
      include: WITH_MODULE,
    })) as MaterialRow[];

    return Promise.all(materials.map(material => this.toItem(material)));
  }

  /**
   * Todos os materiais do curso, para a central em `/ava/materiais`. Ate a
   * Spec 010 aquela tela tinha a propria lista fixa, diferente da trilha.
   */
  async listForCourse(): Promise<MaterialItem[]> {
    const materials = (await this.prisma.material.findMany({
      orderBy: [{ module: { order: 'asc' } }, { order: 'asc' }, { fileName: 'asc' }],
      include: WITH_MODULE,
    })) as MaterialRow[];

    return Promise.all(materials.map(material => this.toItem(material)));
  }

  /**
   * Remove o material. O objeto sai do bucket **antes** da linha: na ordem
   * inversa, uma falha no bucket deixaria um arquivo orfao que ninguem mais
   * sabe que existe.
   */
  async removeMaterial(id: string): Promise<void> {
    const material = await this.prisma.material.findUnique({ where: { id } });

    if (!material) {
      throw new NotFoundException('Material nao encontrado.');
    }

    await this.storage.remove(material.storagePath);
    await this.prisma.material.delete({ where: { id } });
  }

  /** Modulo da rota; sem ele nao ha onde pendurar o arquivo. */
  private async requireModule(moduleId: string) {
    const module = await this.prisma.module.findUnique({ where: { id: moduleId } });

    if (!module) {
      throw new NotFoundException(`Modulo "${moduleId}" nao encontrado.`);
    }

    return module;
  }

  /**
   * O caminho chega pelo cliente, entao e reconferido contra o modulo da rota:
   * sem isso o admin de um modulo sobrescreveria o material de outro.
   */
  private requirePathOfModule(moduleId: string, storagePath: string): void {
    if (!storagePath?.startsWith(`modules/${moduleId}/materials/`)) {
      throw new BadRequestException('O arquivo enviado nao pertence a este modulo.');
    }
  }

  private async toItem(material: MaterialRow): Promise<MaterialItem> {
    const download = await this.storage.createReadUrl(material.storagePath);

    return {
      id: material.id,
      fileName: material.fileName,
      fileType: materialKind(material.fileType),
      contentType: material.fileType,
      sizeBytes: material.sizeBytes,
      order: material.order,
      moduleId: material.moduleId,
      moduleOrder: material.module.order,
      moduleTitle: material.module.title,
      downloadUrl: download.url,
      downloadExpiresAt: download.expiresAt,
    };
  }
}
