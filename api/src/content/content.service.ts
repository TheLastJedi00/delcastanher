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

/** Material como vem do Prisma, com a aula e o modulo dela incluidos. */
interface MaterialRow {
  id: string;
  lessonId: string;
  storagePath: string;
  fileName: string;
  fileType: string;
  sizeBytes: number;
  order: number;
  lesson: {
    order: number;
    title: string;
    moduleId: string;
    module: { order: number; title: string };
  };
}

const WITH_LESSON = {
  lesson: {
    select: {
      order: true,
      title: true,
      moduleId: true,
      module: { select: { order: true, title: true } },
    },
  },
};

/**
 * Conteudo de uma aula: os materiais complementares nesta parte, o video na
 * parte do `VideoService`.
 *
 * Ate a Spec 010 os materiais eram dois arrays hardcoded — um na trilha, outro
 * em `/ava/materiais`, com conteudo diferente para o mesmo curso (decisao 15).
 * A partir dali a lista e dado, e o download e sempre uma URL assinada gerada
 * na hora da consulta: o caminho do bucket nunca sai da API.
 *
 * Desde a Spec 012 o dono e a **aula**, e nao o modulo (decisao 2): material
 * pendurado no modulo nao dizia a qual video pertencia.
 */
@Injectable()
export class ContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /** Passo 1 do upload: permissao de escrita direto no bucket (decisao 3). */
  async createMaterialUploadUrl(
    lessonId: string,
    input: MaterialUploadInput,
  ): Promise<UploadTicket> {
    await this.requireLesson(lessonId);

    return this.storage.createUploadUrl({
      kind: 'material',
      lessonId,
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
  async confirmMaterial(lessonId: string, input: MaterialConfirmInput): Promise<MaterialItem> {
    await this.requireLesson(lessonId);

    this.requirePathOfLesson(lessonId, input.storagePath);

    const uploaded = await this.storage.requireUploaded(input.storagePath);

    // O tamanho e o tipo saem da metadata do bucket, nao do corpo da request:
    // o que vale e o que foi de fato gravado.
    const data = {
      lessonId,
      storagePath: input.storagePath,
      fileName: input.fileName.trim(),
      fileType: uploaded.contentType || input.contentType,
      sizeBytes: uploaded.sizeBytes,
      order: input.order ?? (await this.prisma.material.count({ where: { lessonId } })),
    };

    const material = (await this.prisma.material.upsert({
      where: { storagePath: input.storagePath },
      create: data,
      update: { fileName: data.fileName, fileType: data.fileType, sizeBytes: data.sizeBytes },
      include: WITH_LESSON,
    })) as unknown as MaterialRow;

    return this.toItem(material);
  }

  /** Materiais de uma aula, com URL de download assinada na hora. */
  async listForLesson(lessonId: string): Promise<MaterialItem[]> {
    await this.requireLesson(lessonId);

    const materials = (await this.prisma.material.findMany({
      where: { lessonId },
      orderBy: [{ order: 'asc' }, { fileName: 'asc' }],
      include: WITH_LESSON,
    })) as unknown as MaterialRow[];

    return Promise.all(materials.map((material) => this.toItem(material)));
  }

  /**
   * Todos os materiais do curso, para a central em `/ava/materiais`. A ordem e
   * a da trilha: modulo, depois aula, depois a ordem do material dentro dela —
   * e assim que a tela agrupa (Spec 012, Task 8.2).
   */
  async listForCourse(moduleIds?: string[]): Promise<MaterialItem[]> {
    // Lista vazia e diferente de ausente: `[]` e "este aluno nao comprou nada"
    // e precisa devolver nada, enquanto `undefined` e o painel pedindo tudo.
    if (moduleIds?.length === 0) {
      return [];
    }

    const materials = (await this.prisma.material.findMany({
      where: moduleIds ? { lesson: { moduleId: { in: moduleIds } } } : undefined,
      orderBy: [
        { lesson: { module: { order: 'asc' } } },
        { lesson: { order: 'asc' } },
        { order: 'asc' },
        { fileName: 'asc' },
      ],
      include: WITH_LESSON,
    })) as unknown as MaterialRow[];

    return Promise.all(materials.map((material) => this.toItem(material)));
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

  /** Aula da rota; sem ela nao ha onde pendurar o arquivo. */
  private async requireLesson(lessonId: string) {
    const lesson = await this.prisma.lesson.findUnique({ where: { id: lessonId } });

    if (!lesson) {
      throw new NotFoundException(`Aula "${lessonId}" nao encontrada.`);
    }

    return lesson;
  }

  /**
   * O caminho chega pelo cliente, entao e reconferido contra a aula da rota:
   * sem isso o admin de uma aula sobrescreveria o material de outra.
   */
  private requirePathOfLesson(lessonId: string, storagePath: string): void {
    if (!storagePath?.startsWith(`lessons/${lessonId}/materials/`)) {
      throw new BadRequestException('O arquivo enviado nao pertence a esta aula.');
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
      moduleId: material.lesson.moduleId,
      moduleOrder: material.lesson.module.order,
      moduleTitle: material.lesson.module.title,
      lessonId: material.lessonId,
      lessonOrder: material.lesson.order,
      lessonTitle: material.lesson.title,
      downloadUrl: download.url,
      downloadExpiresAt: download.expiresAt,
    };
  }
}
