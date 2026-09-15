import { Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { CourseProgress, ProgressLessonItem, ProgressModuleItem } from './progress.types';

/**
 * Slug do curso unico da plataforma (mesmo valor do seed e do mock do front).
 * Enquanto nao existe matricula (Spec 008, decisao 5), e daqui que o progresso
 * descobre de que curso esta falando.
 */
export const DEFAULT_COURSE_SLUG = 'imersao-rh';

/** Aula como vem do banco, no que o progresso usa. */
interface LessonRow {
  id: string;
  order: number;
  title: string;
  summary: string;
  videoStoragePath: string | null;
  videoStatus: string | null;
  durationSeconds: number | null;
}

/** Modulo como vem do banco, com as suas aulas. */
interface ModuleRow {
  id: string;
  order: number;
  title: string;
  summary: string;
  lessons: LessonRow[];
}

function percentageOf(completed: number, total: number): number {
  return total === 0 ? 0 : Math.round((completed / total) * 100);
}

/**
 * Progresso do aluno na trilha. Ate a Spec 008 esse estado vivia dentro do
 * componente da trilha, igual para todos e perdido a cada F5; aqui ele e dado
 * por usuario, o que sustenta a retomada e o criterio de conclusao do
 * certificado.
 *
 * Desde a Spec 012 o que o aluno conclui e a **aula**: "modulo concluido" e
 * derivado de "todas as aulas deste modulo concluidas", calculado na leitura.
 * Guardar as duas coisas permitiria o estado impossivel — modulo concluido com
 * aula em aberto — e obrigaria um recalculo a cada mudanca de conteudo
 * (decisao 5).
 */
@Injectable()
export class ProgressService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
  ) {}

  /** Progresso do aluno no curso unico, com percentual e proxima aula. */
  async findForUser(user: AuthUser): Promise<CourseProgress> {
    const course = await this.prisma.course.findUnique({
      where: { slug: DEFAULT_COURSE_SLUG },
      include: {
        modules: {
          orderBy: { order: 'asc' },
          include: { lessons: { orderBy: { order: 'asc' } } },
        },
      },
    });

    if (!course) {
      throw new NotFoundException(
        `Curso "${DEFAULT_COURSE_SLUG}" nao encontrado. Rode o seed do banco (npm run db:seed).`,
      );
    }

    const done = await this.prisma.lessonProgress.findMany({
      where: { userId: user.uid, lesson: { module: { courseId: course.id } } },
      select: { lessonId: true },
    });

    const completedIds = new Set(done.map((row) => row.lessonId));

    const modules: ProgressModuleItem[] = (course.modules as unknown as ModuleRow[]).map(
      (module) => {
        const lessons: ProgressLessonItem[] = module.lessons.map((lesson) => ({
          id: lesson.id,
          order: lesson.order,
          title: lesson.title,
          summary: lesson.summary,
          completed: completedIds.has(lesson.id),
          hasVideo: Boolean(lesson.videoStoragePath),
          videoReady: lesson.videoStatus === 'READY',
          durationSeconds: lesson.durationSeconds,
        }));

        const completedCount = lessons.filter((lesson) => lesson.completed).length;

        return {
          id: module.id,
          order: module.order,
          title: module.title,
          summary: module.summary,
          // Modulo sem aula nenhuma nao esta concluido: nao ha o que concluir,
          // e dizer o contrario liberaria um diploma de modulo sem uma unica
          // aula assistida (decisao 13).
          completed: lessons.length > 0 && completedCount === lessons.length,
          lessons,
          completedCount,
          totalCount: lessons.length,
          nextLesson: lessons.find((lesson) => !lesson.completed) ?? null,
        };
      },
    );

    const allLessons = modules.flatMap((module) => module.lessons);
    const completedCount = allLessons.filter((lesson) => lesson.completed).length;

    // Primeira em aberto, nao "a seguinte a ultima concluida": o aluno pode ter
    // pulado uma aula, e e nela que a retomada precisa cair.
    const nextModule = modules.find((module) => module.nextLesson !== null) ?? null;

    return {
      course: {
        slug: course.slug,
        title: course.title,
        workloadHours: course.workloadHours,
      },
      modules,
      completedCount,
      totalCount: allLessons.length,
      percentage: percentageOf(completedCount, allLessons.length),
      nextModule,
      nextLesson: nextModule?.nextLesson ?? null,
      completed: allLessons.length > 0 && completedCount === allLessons.length,
    };
  }

  /**
   * Marca ou desmarca uma aula. Desmarcar apaga a linha: a ausencia de
   * registro ja significa "em aberto", e guardar um booleano falso criaria duas
   * formas de dizer a mesma coisa.
   *
   * Esta e a **unica** porta da conclusao, para o botao manual e para o fim do
   * video (Spec 010, decisao 10). Nao existe equivalente por modulo: marcar um
   * modulo concluiria em cascata aulas que o aluno nao assistiu (decisao 5).
   */
  async setLessonCompletion(
    user: AuthUser,
    lessonId: string,
    completed: boolean,
  ): Promise<CourseProgress> {
    const lesson = await this.prisma.lesson.findUnique({ where: { id: lessonId } });

    if (!lesson) {
      throw new NotFoundException(`Aula "${lessonId}" nao encontrada.`);
    }

    if (completed) {
      // O guard autentica, mas nao cria o registro do aluno no banco: sem isso
      // o primeiro clique de quem nunca abriu o perfil bateria na FK.
      await this.users.findOrCreate(user);

      await this.prisma.lessonProgress.upsert({
        where: { userId_lessonId: { userId: user.uid, lessonId } },
        update: {},
        create: { userId: user.uid, lessonId },
      });
    } else {
      // deleteMany em vez de delete: desmarcar o que nunca foi concluido e
      // uma operacao valida, nao um erro.
      await this.prisma.lessonProgress.deleteMany({ where: { userId: user.uid, lessonId } });
    }

    return this.findForUser(user);
  }
}
