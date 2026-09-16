import { Injectable } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import { PrismaService } from '../prisma/prisma.service';
import { isFullyCompleted, percentageOf } from '../progress/completion';
import { DEFAULT_COURSE_SLUG } from '../progress/progress.service';
import { ListAdminUsersDto } from './dto/list-admin-users.dto';
import { AdminUserItem, AdminUserListResult, AdminUsersKpis } from './users.admin.types';

/**
 * Janela das duas perguntas do topo do painel: "ainda esta por aqui?" e
 * "ainda esta estudando?". Trinta dias e o que faz um curso de doze modulos
 * ter um ritmo reconhecivel — sete dias marcaria como inativo quem estuda aos
 * fins de semana alternados (Spec 013, decisao 6).
 */
export const ACTIVITY_WINDOW_DAYS = 30;

/** Usuario como a listagem o le: sem bio e sem linkedin (decisao 11). */
const LIST_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  blockedAt: true,
  onboardingCompleted: true,
  createdAt: true,
  lastSeenAt: true,
} as const;

interface UserRow {
  id: string;
  name: string | null;
  email: string;
  role: 'aluno' | 'admin';
  blockedAt: Date | null;
  onboardingCompleted: boolean;
  createdAt: Date;
  lastSeenAt: Date | null;
}

/** Aula da grade, na ordem em que o aluno a percorre. */
interface CourseLesson {
  id: string;
  moduleOrder: number;
  moduleTitle: string;
}

/**
 * Iniciais do avatar. Sem nome — conta que parou antes do onboarding — as
 * letras saem do e-mail, que e o que a tela mostra no lugar (decisao 15).
 */
function initialsOf(name: string | null, email: string): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return email.slice(0, 2).toUpperCase();
  }

  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';

  return `${first}${last}`.toUpperCase();
}

/** Instante a partir do qual um acesso ou uma conclusao contam como recentes. */
function activityCutoff(): Date {
  return new Date(Date.now() - ACTIVITY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * Leitura administrativa de usuarios. Vive ao lado do `UsersService`, que
 * continua sendo o perfil do proprio usuario logado: o que muda aqui e o
 * leitor, nao a entidade.
 *
 * Nenhum metodo consulta `User.role` para decidir acesso — a autorizacao e do
 * `RolesGuard`, pelo claim do token (decisao 3). A coluna serve para listar,
 * filtrar e contar.
 */
@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly firebase: FirebaseService,
  ) {}

  /**
   * Uma pagina da listagem, com o progresso ja calculado e os KPIs da base.
   *
   * O custo e constante no tamanho da pagina: a grade do curso e lida uma vez,
   * e as conclusoes das vinte linhas saem de **uma** consulta filtrada pelos
   * ids da pagina. Calcular por linha seria um N+1 disparado a cada tecla
   * digitada na busca (decisao 8).
   */
  async list(query: ListAdminUsersDto): Promise<AdminUserListResult> {
    const where = this.whereOf(query);

    const [lessons, total, rows] = await Promise.all([
      this.courseLessons(),
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        select: LIST_SELECT,
        orderBy: this.orderByOf(query),
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }) as Promise<UserRow[]>,
    ]);

    const completions = await this.completionsOf(rows.map((row) => row.id));

    return {
      items: rows.map((row) => this.toItem(row, lessons, completions.get(row.id))),
      total,
      page: query.page,
      pageSize: query.pageSize,
      kpis: await this.kpis(),
    };
  }

  /**
   * Clausula do filtro da tela. A mesma vai para a contagem e para a pagina:
   * um total que nao corresponde as linhas exibidas quebra a paginacao.
   */
  private whereOf(query: ListAdminUsersDto): Record<string, unknown> {
    const where: Record<string, unknown> = {};
    const search = query.search?.trim();

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (query.role) {
      where.role = query.role;
    }

    if (query.status) {
      // A tela fala em "ativo" e "bloqueado"; o banco guarda a data do
      // bloqueio, que e o que permite saber desde quando.
      where.blockedAt = query.status === 'bloqueado' ? { not: null } : null;
    }

    return where;
  }

  /**
   * Ordenacao, sempre do banco. "Progresso" nao e coluna: ele sai da contagem
   * de linhas de `lesson_progress`, que com um curso unico e o proprio numero
   * de aulas concluidas — ordenar as vinte linhas ja paginadas em memoria
   * ordenaria a pagina, e nao a lista.
   */
  private orderByOf(query: ListAdminUsersDto): Record<string, unknown> {
    switch (query.sort) {
      case 'matricula':
        return { createdAt: query.direction };
      case 'acesso':
        // Nulo e ausencia de dado, nao a data mais antiga: quem nunca acessou
        // nao pode ocupar o topo.
        return { lastSeenAt: { sort: query.direction, nulls: 'last' } };
      case 'progresso':
        return { progress: { _count: query.direction } };
      default:
        return { name: query.direction };
    }
  }

  /** A grade do curso achatada na ordem em que o aluno a percorre. */
  private async courseLessons(): Promise<CourseLesson[]> {
    const course = await this.prisma.course.findUnique({
      where: { slug: DEFAULT_COURSE_SLUG },
      select: {
        modules: {
          orderBy: { order: 'asc' },
          select: {
            order: true,
            title: true,
            lessons: { orderBy: { order: 'asc' }, select: { id: true } },
          },
        },
      },
    });

    const modules = course?.modules ?? [];

    return modules.flatMap((module) =>
      module.lessons.map((lesson) => ({
        id: lesson.id,
        moduleOrder: module.order,
        moduleTitle: module.title,
      })),
    );
  }

  /** Aulas concluidas por usuario, para a pagina inteira, em uma consulta. */
  private async completionsOf(userIds: string[]): Promise<Map<string, Set<string>>> {
    const byUser = new Map<string, Set<string>>();

    if (userIds.length === 0) {
      return byUser;
    }

    const rows = await this.prisma.lessonProgress.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, lessonId: true },
    });

    for (const row of rows) {
      const set = byUser.get(row.userId) ?? new Set<string>();
      set.add(row.lessonId);
      byUser.set(row.userId, set);
    }

    return byUser;
  }

  /** Linha da tabela: perfil enxuto mais o progresso derivado da grade. */
  private toItem(
    row: UserRow,
    lessons: CourseLesson[],
    completed: Set<string> | undefined,
  ): AdminUserItem {
    const done = completed ?? new Set<string>();
    const completedLessons = lessons.filter((lesson) => done.has(lesson.id)).length;

    // A primeira **em aberto**, e nao a seguinte a ultima concluida: o aluno
    // pode ter pulado uma aula, e e nela que ele esta.
    const next = lessons.find((lesson) => !done.has(lesson.id)) ?? null;

    return {
      id: row.id,
      name: row.name,
      email: row.email,
      initials: initialsOf(row.name, row.email),
      role: row.role,
      blocked: row.blockedAt !== null,
      onboardingCompleted: row.onboardingCompleted,
      createdAt: row.createdAt,
      lastSeenAt: row.lastSeenAt,
      completedLessons,
      totalLessons: lessons.length,
      percentage: percentageOf(completedLessons, lessons.length),
      currentModuleOrder: next?.moduleOrder ?? null,
      currentModuleTitle: next?.moduleTitle ?? null,
      // Mesmo criterio do progresso do aluno, da mesma funcao: curso sem aula
      // nenhuma nao esta concluido, porque nao ha o que concluir.
      courseCompleted: isFullyCompleted(lessons.length, completedLessons),
    };
  }

  /**
   * Os tres numeros do topo. Valem para a **base inteira**, e nao para o
   * filtro da tela: filtrar por "bloqueados" nao pode fazer o painel dizer que
   * a turma encolheu.
   */
  private async kpis(): Promise<AdminUsersKpis> {
    const cutoff = activityCutoff();
    const students = { role: 'aluno' as const, blockedAt: null };

    const [totalStudents, activeStudents, engaged] = await Promise.all([
      this.prisma.user.count({ where: students }),
      this.prisma.user.count({ where: { ...students, lastSeenAt: { gte: cutoff } } }),
      this.engagedStudents(cutoff),
    ]);

    return {
      totalStudents,
      activeStudents,
      engagementRate: percentageOf(engaged, totalStudents),
      windowDays: ACTIVITY_WINDOW_DAYS,
    };
  }

  /**
   * Alunos **distintos** que concluiram alguma aula na janela. Agrupado por
   * aluno, e nao contado por conclusao: quem terminou seis aulas na semana
   * continua sendo uma pessoa engajada.
   */
  private async engagedStudents(cutoff: Date): Promise<number> {
    const rows = await this.prisma.lessonProgress.groupBy({
      by: ['userId'],
      where: { completedAt: { gte: cutoff }, user: { role: 'aluno', blockedAt: null } },
    });

    return rows.length;
  }
}
