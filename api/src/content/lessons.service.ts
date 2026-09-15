import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { MuxService } from '../mux/mux.service';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_COURSE_SLUG } from '../progress/progress.service';
import { StorageService } from '../storage/storage.service';
import { AdminLessonItem, AdminModuleItem, LessonVideoState, VideoStatus } from './content.types';

/** Campos editaveis de uma aula. Ordem nao entra aqui: ela tem rota propria. */
export interface LessonInput {
  title: string;
  summary: string;
}

/** Campos editaveis de um modulo. */
export interface ModuleInput {
  title: string;
  summary: string;
}

/** Aula como vem do banco, no que a administracao usa. */
interface LessonRow {
  id: string;
  moduleId: string;
  order: number;
  title: string;
  summary: string;
  videoStoragePath: string | null;
  videoOriginalName: string | null;
  videoSizeBytes: number | null;
  muxAssetId: string | null;
  muxPlaybackId: string | null;
  videoStatus: VideoStatus | null;
  videoError: string | null;
  durationSeconds: number | null;
}

/**
 * Estrutura da grade: criar, renomear e reordenar modulos e aulas.
 *
 * Fica separado do `ContentService`/`VideoService` de proposito: aqueles
 * cuidam do **conteudo** pendurado numa aula (arquivo, bucket, Mux), este
 * cuida da **forma** da trilha. Ate a Spec 010 a grade vinha inteira do seed
 * e nao havia o que administrar; com o modulo virando container de aulas
 * (Spec 012), compor a lista de aulas passa a ser o trabalho do painel.
 *
 * Nao existe remocao de modulo aqui (decisao 15): `Certificate.moduleId` esta
 * em `onDelete: Restrict`, e apagar um modulo que ja certificou alguem e
 * decisao de produto, nao de painel.
 */
@Injectable()
export class LessonsService {
  private readonly logger = new Logger(LessonsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly mux: MuxService,
  ) {}

  /** Modulos do curso com contagem de aulas e de diplomas ja emitidos. */
  async listModules(): Promise<AdminModuleItem[]> {
    const course = await this.requireCourse();

    const modules = await this.prisma.module.findMany({
      where: { courseId: course.id },
      orderBy: { order: 'asc' },
      include: { _count: { select: { lessons: true } } },
    });

    return Promise.all(
      modules.map(async (module) => ({
        id: module.id,
        order: module.order,
        title: module.title,
        summary: module.summary,
        lessonCount: (module as { _count?: { lessons: number } })._count?.lessons ?? 0,
        // A UI usa este numero para explicar por que a remocao de modulo nao
        // existe: o diploma emitido continua valendo (decisao 15).
        certificateCount: await this.prisma.certificate.count({ where: { moduleId: module.id } }),
      })),
    );
  }

  /** Cria o modulo no fim da grade. */
  async createModule(input: ModuleInput): Promise<AdminModuleItem> {
    const course = await this.requireCourse();

    const created = await this.prisma.module.create({
      data: {
        courseId: course.id,
        order: await this.nextModuleOrder(course.id),
        title: input.title.trim(),
        summary: input.summary.trim(),
      },
    });

    return {
      id: created.id,
      order: created.order,
      title: created.title,
      summary: created.summary,
      lessonCount: 0,
      certificateCount: 0,
    };
  }

  /** Renomeia o modulo. Ordem e conteudo nao passam por aqui. */
  async updateModule(moduleId: string, input: Partial<ModuleInput>): Promise<AdminModuleItem> {
    await this.requireModule(moduleId);

    const updated = await this.prisma.module.update({
      where: { id: moduleId },
      data: this.trimmed(input),
      include: { _count: { select: { lessons: true } } },
    });

    return {
      id: updated.id,
      order: updated.order,
      title: updated.title,
      summary: updated.summary,
      lessonCount: (updated as { _count?: { lessons: number } })._count?.lessons ?? 0,
      certificateCount: await this.prisma.certificate.count({ where: { moduleId } }),
    };
  }

  /** Reordena a grade recebendo a lista completa de ids (decisao 17). */
  async reorderModules(moduleIds: string[]): Promise<void> {
    const course = await this.requireCourse();

    const modules = await this.prisma.module.findMany({
      where: { courseId: course.id },
      select: { id: true },
    });

    this.requireExactSet(
      modules.map((module) => module.id),
      moduleIds,
      'modulos',
    );

    await this.prisma.$transaction(
      this.reorderStatements(moduleIds, (id, order) =>
        this.prisma.module.update({ where: { id }, data: { order } }),
      ),
    );
  }

  /** Aulas do modulo, com estado do video, materiais e alunos que concluiram. */
  async listForModule(moduleId: string): Promise<AdminLessonItem[]> {
    await this.requireModule(moduleId);

    const lessons = (await this.prisma.lesson.findMany({
      where: { moduleId },
      orderBy: { order: 'asc' },
    })) as unknown as LessonRow[];

    return Promise.all(lessons.map((lesson) => this.toAdminItem(lesson)));
  }

  /** Cria a aula no fim da lista do modulo. */
  async createLesson(moduleId: string, input: LessonInput): Promise<AdminLessonItem> {
    await this.requireModule(moduleId);

    const created = (await this.prisma.lesson.create({
      data: {
        moduleId,
        order: await this.nextLessonOrder(moduleId),
        title: input.title.trim(),
        summary: input.summary.trim(),
      },
    })) as unknown as LessonRow;

    return this.toAdminItem(created);
  }

  /** Renomeia a aula. O video continua onde esta. */
  async updateLesson(lessonId: string, input: Partial<LessonInput>): Promise<AdminLessonItem> {
    await this.requireLesson(lessonId);

    const updated = (await this.prisma.lesson.update({
      where: { id: lessonId },
      data: this.trimmed(input),
    })) as unknown as LessonRow;

    return this.toAdminItem(updated);
  }

  /**
   * Remove a aula com tudo o que so existe por causa dela: asset no Mux,
   * objetos no bucket, materiais e conclusoes (as duas ultimas por cascade no
   * banco).
   *
   * O banco vem por ultimo: na ordem inversa, uma falha de rede deixaria
   * arquivo e asset orfaos que ninguem mais sabe que existem. Uma falha no Mux
   * nao impede a remocao — o registro precisa sair de qualquer forma, e um
   * asset pago a mais e problema menor que uma aula fantasma na trilha.
   */
  async removeLesson(lessonId: string): Promise<void> {
    const lesson = (await this.requireLesson(lessonId)) as LessonRow;

    if (lesson.muxAssetId) {
      await this.mux.deleteAsset(lesson.muxAssetId).catch((error: Error) => {
        this.logger.warn(`Falha ao apagar o asset ${lesson.muxAssetId} no Mux: ${error.message}`);
      });
    }

    if (lesson.videoStoragePath) {
      await this.storage.remove(lesson.videoStoragePath);
    }

    const materials = await this.prisma.material.findMany({
      where: { lessonId },
      select: { storagePath: true },
    });

    for (const material of materials) {
      await this.storage.remove(material.storagePath);
    }

    // `lesson_progress` e `materials` saem por cascade: deixar linhas
    // apontando para conteudo inexistente corromperia o percentual de quem ja
    // estudou (decisao 16).
    await this.prisma.lesson.delete({ where: { id: lessonId } });
  }

  /** Reordena as aulas do modulo recebendo a lista completa de ids. */
  async reorderLessons(moduleId: string, lessonIds: string[]): Promise<void> {
    await this.requireModule(moduleId);

    const lessons = await this.prisma.lesson.findMany({
      where: { moduleId },
      select: { id: true },
    });

    this.requireExactSet(
      lessons.map((lesson) => lesson.id),
      lessonIds,
      'aulas',
    );

    await this.prisma.$transaction(
      this.reorderStatements(lessonIds, (id, order) =>
        this.prisma.lesson.update({ where: { id }, data: { order } }),
      ),
    );
  }

  /**
   * Reordenacao em **dois passos**, dentro de uma transacao: primeiro todos os
   * itens recebem uma ordem negativa, depois a definitiva. Sem o passo
   * intermediario o primeiro UPDATE bateria no `@@unique([moduleId, order])`
   * de um item que ainda nao se moveu (decisao 17).
   */
  private reorderStatements<T>(ids: string[], update: (id: string, order: number) => T): T[] {
    return [
      ...ids.map((id, index) => update(id, -(index + 1))),
      ...ids.map((id, index) => update(id, index + 1)),
    ];
  }

  /**
   * A lista recebida precisa conter exatamente os itens daquele pai: reordenar
   * metade deixaria a outra metade com ordem duplicada, e um id de fora
   * moveria o item de outro modulo.
   */
  private requireExactSet(current: string[], received: string[], label: string): void {
    const unique = new Set(received);

    if (unique.size !== received.length) {
      throw new BadRequestException(`A lista de ${label} tem id repetido.`);
    }

    if (
      unique.size !== current.length ||
      current.some((id) => !unique.has(id))
    ) {
      throw new BadRequestException(
        `Envie a lista completa de ${label} deste grupo, na ordem desejada.`,
      );
    }
  }

  /** Maior ordem + 1. A contagem nao serve: com um item removido no meio, ela colidiria. */
  private async nextLessonOrder(moduleId: string): Promise<number> {
    const { _max } = await this.prisma.lesson.aggregate({
      where: { moduleId },
      _max: { order: true },
    });

    return (_max.order ?? 0) + 1;
  }

  private async nextModuleOrder(courseId: string): Promise<number> {
    const { _max } = await this.prisma.module.aggregate({
      where: { courseId },
      _max: { order: true },
    });

    return (_max.order ?? 0) + 1;
  }

  /** Remove espaco das pontas e ignora campo ausente, para nao apagar titulo por omissao. */
  private trimmed(input: Partial<LessonInput>): Partial<LessonInput> {
    return {
      ...(input.title !== undefined ? { title: input.title.trim() } : {}),
      ...(input.summary !== undefined ? { summary: input.summary.trim() } : {}),
    };
  }

  private async requireCourse() {
    const course = await this.prisma.course.findUnique({ where: { slug: DEFAULT_COURSE_SLUG } });

    if (!course) {
      throw new NotFoundException(
        `Curso "${DEFAULT_COURSE_SLUG}" nao encontrado. Rode o seed do banco (npm run db:seed).`,
      );
    }

    return course;
  }

  private async requireModule(moduleId: string) {
    const module = await this.prisma.module.findUnique({ where: { id: moduleId } });

    if (!module) {
      throw new NotFoundException(`Modulo "${moduleId}" nao encontrado.`);
    }

    return module;
  }

  private async requireLesson(lessonId: string) {
    const lesson = await this.prisma.lesson.findUnique({ where: { id: lessonId } });

    if (!lesson) {
      throw new NotFoundException(`Aula "${lessonId}" nao encontrada.`);
    }

    return lesson;
  }

  private async toAdminItem(lesson: LessonRow): Promise<AdminLessonItem> {
    const video: LessonVideoState = {
      lessonId: lesson.id,
      hasVideo: Boolean(lesson.videoStoragePath),
      status: lesson.videoStatus,
      playbackId: lesson.muxPlaybackId,
      fileName: lesson.videoOriginalName,
      sizeBytes: lesson.videoSizeBytes,
      error: lesson.videoError,
      durationSeconds: lesson.durationSeconds,
    };

    return {
      id: lesson.id,
      moduleId: lesson.moduleId,
      order: lesson.order,
      title: lesson.title,
      summary: lesson.summary,
      video,
      materialCount: await this.prisma.material.count({ where: { lessonId: lesson.id } }),
      // Quantos alunos ja concluiram: e o que a confirmacao de remocao mostra
      // antes de apagar o progresso deles (decisao 16).
      completedBy: await this.prisma.lessonProgress.count({ where: { lessonId: lesson.id } }),
    };
  }
}
