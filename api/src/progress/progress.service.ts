import { Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { CourseProgress, ProgressModuleItem } from './progress.types';

/**
 * Slug do curso unico da plataforma (mesmo valor do seed e do mock do front).
 * Enquanto nao existe matricula (Spec 008, decisao 5), e daqui que o progresso
 * descobre de que curso esta falando.
 */
export const DEFAULT_COURSE_SLUG = 'imersao-rh';

/** Modulo como vem do banco, antes de receber o estado do aluno. */
interface ModuleRow {
  id: string;
  order: number;
  title: string;
  summary: string;
  videoStoragePath: string | null;
  videoStatus: string | null;
}

function percentageOf(completed: number, total: number): number {
  return total === 0 ? 0 : Math.round((completed / total) * 100);
}

/**
 * Progresso do aluno na trilha. Ate a Spec 008 esse estado vivia dentro do
 * componente da trilha, igual para todos e perdido a cada F5; aqui ele e dado
 * por usuario, o que sustenta a retomada e o criterio de conclusao do
 * certificado.
 */
@Injectable()
export class ProgressService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
  ) {}

  /** Progresso do aluno no curso unico, com percentual e proximo modulo. */
  async findForUser(user: AuthUser): Promise<CourseProgress> {
    const course = await this.prisma.course.findUnique({
      where: { slug: DEFAULT_COURSE_SLUG },
      include: { modules: { orderBy: { order: 'asc' } } },
    });

    if (!course) {
      throw new NotFoundException(
        `Curso "${DEFAULT_COURSE_SLUG}" nao encontrado. Rode o seed do banco (npm run db:seed).`,
      );
    }

    const done = await this.prisma.moduleProgress.findMany({
      where: { userId: user.uid, module: { courseId: course.id } },
      select: { moduleId: true },
    });

    const completedIds = new Set(done.map((row) => row.moduleId));

    const modules: ProgressModuleItem[] = (course.modules as ModuleRow[]).map((module) => ({
      id: module.id,
      order: module.order,
      title: module.title,
      summary: module.summary,
      completed: completedIds.has(module.id),
      hasVideo: Boolean(module.videoStoragePath),
      videoReady: module.videoStatus === 'READY',
    }));

    const completedCount = modules.filter((module) => module.completed).length;

    return {
      course: {
        slug: course.slug,
        title: course.title,
        workloadHours: course.workloadHours,
      },
      modules,
      completedCount,
      totalCount: modules.length,
      percentage: percentageOf(completedCount, modules.length),
      // Primeiro em aberto, nao "o seguinte ao ultimo concluido": o aluno pode
      // ter pulado um modulo, e e nele que a retomada precisa cair.
      nextModule: modules.find((module) => !module.completed) ?? null,
      completed: modules.length > 0 && completedCount === modules.length,
    };
  }

  /**
   * Marca ou desmarca um modulo. Desmarcar apaga a linha: a ausencia de
   * registro ja significa "em aberto", e guardar um booleano falso criaria duas
   * formas de dizer a mesma coisa.
   */
  async setModuleCompletion(
    user: AuthUser,
    moduleId: string,
    completed: boolean,
  ): Promise<CourseProgress> {
    const module = await this.prisma.module.findUnique({ where: { id: moduleId } });

    if (!module) {
      throw new NotFoundException(`Modulo "${moduleId}" nao encontrado.`);
    }

    if (completed) {
      // O guard autentica, mas nao cria o registro do aluno no banco: sem isso
      // o primeiro clique de quem nunca abriu o perfil bateria na FK.
      await this.users.findOrCreate(user);

      await this.prisma.moduleProgress.upsert({
        where: { userId_moduleId: { userId: user.uid, moduleId } },
        update: {},
        create: { userId: user.uid, moduleId },
      });
    } else {
      // deleteMany em vez de delete: desmarcar o que nunca foi concluido e
      // uma operacao valida, nao um erro.
      await this.prisma.moduleProgress.deleteMany({ where: { userId: user.uid, moduleId } });
    }

    return this.findForUser(user);
  }
}
