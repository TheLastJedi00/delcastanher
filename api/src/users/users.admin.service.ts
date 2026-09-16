import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser, Role } from '../auth/auth.types';
import { FirebaseService } from '../firebase/firebase.service';
import { PrismaService } from '../prisma/prisma.service';
import { isFullyCompleted, percentageOf } from '../progress/completion';
import { DEFAULT_COURSE_SLUG } from '../progress/progress.service';
import { ListAdminUsersDto } from './dto/list-admin-users.dto';
import {
  AdminUserDetail,
  AdminUserItem,
  AdminUserListResult,
  AdminUserModuleItem,
  AdminUsersKpis,
} from './users.admin.types';

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

/** Usuario na exportacao: a listagem mais o telefone, que e operacional. */
interface ExportRow extends UserRow {
  phone: string | null;
}

/** Usuario no detalhe: a linha inteira, inclusive o que so aparece la. */
interface DetailRow extends UserRow {
  bio: string | null;
  phone: string | null;
  linkedin: string | null;
}

/** Diploma como a consulta o devolve, com o titulo do modulo pela relacao. */
interface CertificateRow {
  id: string;
  code: string;
  moduleId: string | null;
  status: 'ACTIVE' | 'REVOKED';
  issuedAt: Date;
  module: { title: string } | null;
}

/** Modulo da grade, com as aulas na ordem em que o aluno as percorre. */
interface CourseModule {
  id: string;
  order: number;
  title: string;
  lessons: { id: string; order: number; title: string }[];
}

/** Aula da grade ja achatada, carregando o modulo a que pertence. */
interface CourseLesson {
  id: string;
  moduleOrder: number;
  moduleTitle: string;
}

/** A grade em uma lista unica, que e como a linha da tabela a percorre. */
function flatLessons(modules: CourseModule[]): CourseLesson[] {
  return modules.flatMap((module) =>
    module.lessons.map((lesson) => ({
      id: lesson.id,
      moduleOrder: module.order,
      moduleTitle: module.title,
    })),
  );
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

/**
 * Ponto e virgula, e nao virgula: o Excel em pt-BR usa o separador de lista do
 * sistema, e com virgula a planilha inteira cai em uma coluna so. O arquivo e
 * para ser aberto, nao para satisfazer o RFC.
 */
const CSV_SEPARATOR = ';';

/** Colunas operacionais da planilha (decisao 13). Bio e LinkedIn ficam fora. */
const CSV_HEADER = [
  'Nome',
  'E-mail',
  'Telefone',
  'Papel',
  'Situacao',
  'Matricula',
  'Ultimo acesso',
  'Aulas concluidas',
  'Total de aulas',
  'Progresso (%)',
];

/** Usuario como a exportacao o le: a listagem mais o telefone. */
const EXPORT_SELECT = { ...LIST_SELECT, phone: true } as const;

/**
 * Um campo de CSV. Separador, aspas e quebra de linha obrigam a citar: um nome
 * com ponto e virgula partiria a linha em duas colunas.
 */
function csvField(value: string): string {
  if (!/[;"\n\r]/.test(value)) {
    return value;
  }

  return `"${value.replace(/"/g, '""')}"`;
}

/** Data no formato da tela; vazio para o nulo, que e ausencia de acesso. */
function csvDate(value: Date | null): string {
  if (!value) {
    return '';
  }

  const day = String(value.getUTCDate()).padStart(2, '0');
  const month = String(value.getUTCMonth() + 1).padStart(2, '0');

  return `${day}/${month}/${value.getUTCFullYear()}`;
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

    const [modules, total, rows] = await Promise.all([
      this.courseModules(),
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
    const lessons = flatLessons(modules);

    return {
      items: rows.map((row) => this.toItem(row, lessons, completions.get(row.id))),
      total,
      page: query.page,
      pageSize: query.pageSize,
      kpis: await this.kpis(),
    };
  }

  /**
   * Detalhe de um aluno: perfil, progresso por modulo e diplomas emitidos.
   *
   * Somente leitura. Nao ha contrapartida de escrita para nenhum destes
   * campos: o onboarding e declaracao do proprio aluno (decisao 11), e o
   * diploma so aparece — revogar segue sendo ato deliberado, sem tela
   * (decisao 12).
   */
  async findOne(id: string): Promise<AdminUserDetail> {
    const user = (await this.prisma.user.findUnique({ where: { id } })) as DetailRow | null;

    if (!user) {
      throw new NotFoundException(`Usuario "${id}" nao encontrado.`);
    }

    const [grade, done, certificates] = await Promise.all([
      this.courseModules(),
      this.prisma.lessonProgress.findMany({
        where: { userId: id },
        select: { lessonId: true },
      }) as Promise<{ lessonId: string }[]>,
      this.prisma.certificate.findMany({
        where: { userId: id },
        orderBy: { issuedAt: 'desc' },
        select: {
          id: true,
          code: true,
          moduleId: true,
          status: true,
          issuedAt: true,
          module: { select: { title: true } },
        },
      }) as Promise<CertificateRow[]>,
    ]);

    const completed = new Set(done.map((row) => row.lessonId));

    const modules: AdminUserModuleItem[] = grade.map((module) => {
      const lessons = module.lessons.map((lesson) => ({
        id: lesson.id,
        order: lesson.order,
        title: lesson.title,
        completed: completed.has(lesson.id),
      }));

      const completedCount = lessons.filter((lesson) => lesson.completed).length;

      return {
        id: module.id,
        order: module.order,
        title: module.title,
        completedCount,
        totalCount: lessons.length,
        // Mesma funcao que o `ProgressService` usa: o painel nao pode dizer
        // que o aluno concluiu um modulo que a trilha dele mostra em aberto.
        completed: isFullyCompleted(lessons.length, completedCount),
        lessons,
      };
    });

    const totalLessons = modules.reduce((sum, module) => sum + module.totalCount, 0);
    const completedLessons = modules.reduce((sum, module) => sum + module.completedCount, 0);

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      initials: initialsOf(user.name, user.email),
      bio: user.bio,
      phone: user.phone,
      linkedin: user.linkedin,
      role: user.role,
      blocked: user.blockedAt !== null,
      onboardingCompleted: user.onboardingCompleted,
      createdAt: user.createdAt,
      lastSeenAt: user.lastSeenAt,
      completedLessons,
      totalLessons,
      percentage: percentageOf(completedLessons, totalLessons),
      courseCompleted: isFullyCompleted(totalLessons, completedLessons),
      modules,
      certificates: certificates.map((certificate) => ({
        id: certificate.id,
        code: certificate.code,
        // `moduleId` nulo e o diploma do curso inteiro; preenchido, o daquele
        // modulo (Spec 008 e Spec 010, decisao 11).
        scope: certificate.moduleId === null ? 'curso' : 'modulo',
        moduleTitle: certificate.module?.title ?? null,
        status: certificate.status,
        issuedAt: certificate.issuedAt,
      })),
    };
  }

  /**
   * A lista inteira do filtro corrente, em CSV. Sem paginacao e sem KPIs: a
   * planilha nao carrega o topo do painel, e montar o arquivo no cliente
   * exigiria varrer todas as paginas com N requisicoes (decisao 13).
   */
  async exportCsv(query: ListAdminUsersDto): Promise<string> {
    const [modules, rows] = await Promise.all([
      this.courseModules(),
      this.prisma.user.findMany({
        where: this.whereOf(query),
        select: EXPORT_SELECT,
        orderBy: this.orderByOf(query),
      }) as Promise<ExportRow[]>,
    ]);

    const completions = await this.completionsOf(rows.map((row) => row.id));
    const lessons = flatLessons(modules);

    const lines = rows.map((row) => {
      const item = this.toItem(row, lessons, completions.get(row.id));

      return [
        // Sem nome, o e-mail e o que a tela mostra na coluna — e a planilha
        // nao pode ter uma primeira coluna vazia (decisao 15).
        item.name ?? item.email,
        item.email,
        row.phone ?? '',
        item.role,
        item.blocked ? 'Bloqueado' : 'Ativo',
        csvDate(item.createdAt),
        csvDate(item.lastSeenAt),
        String(item.completedLessons),
        String(item.totalLessons),
        String(item.percentage),
      ]
        .map(csvField)
        .join(CSV_SEPARATOR);
    });

    // BOM de UTF-8: sem ele o Excel em pt-BR abre "Joao" no lugar de "João".
    return `﻿${[CSV_HEADER.join(CSV_SEPARATOR), ...lines].join('\n')}\n`;
  }

  /**
   * Troca o papel de uma conta, na ordem **Firebase primeiro, banco depois**.
   *
   * O token e a fonte da autorizacao; a coluna e espelho. Gravar a coluna
   * antes — ou apesar de — uma falha do Firebase produziria um admin que o
   * painel exibe e nenhuma rota reconhece (decisao 4).
   */
  async setRole(actor: AuthUser, id: string, role: Role): Promise<void> {
    await this.assertNotSelf(actor, id, 'Voce nao pode mudar o proprio papel.');
    await this.assertExists(id);

    const account = await this.firebase.auth.getUser(id);
    // Sem claim definida o backend ja trata o usuario como aluno, e e assim
    // que o `FirebaseAuthGuard` a le.
    const current = (account.customClaims?.role as Role | undefined) ?? 'aluno';

    if (current !== role) {
      // `setCustomUserClaims` substitui **todas** as claims: preserva as demais.
      await this.firebase.auth.setCustomUserClaims(id, { ...account.customClaims, role });
    }

    // Gravado mesmo quando o claim ja era o pedido: o espelho pode estar
    // defasado se alguem trocou o papel por fora do painel.
    await this.prisma.user.update({ where: { id }, data: { role } });
  }

  /**
   * Bloqueia ou libera uma conta. Nada e apagado: progresso, certificados e
   * perfil continuam no lugar, e e isso que separa esta acao da exclusao de
   * conta, que e o direito de eliminacao da Spec 009 (decisao 9).
   *
   * O `idToken` ja emitido continua valido ate expirar, no maximo uma hora.
   * Fechar essa janela exigiria `verifyIdToken(token, true)` — um round-trip
   * ao Firebase em toda requisicao autenticada da plataforma — para encurtar
   * em minutos o efeito de um ato raro. A revogacao do refresh token garante
   * que a sessao nao se renove.
   */
  async setBlocked(actor: AuthUser, id: string, blocked: boolean): Promise<void> {
    await this.assertNotSelf(actor, id, 'Voce nao pode bloquear a propria conta.');
    await this.assertExists(id);

    await this.firebase.auth.updateUser(id, { disabled: blocked });

    if (blocked) {
      // So no bloqueio: revogar ao liberar derrubaria a sessao de quem acabou
      // de ser desbloqueado.
      await this.firebase.auth.revokeRefreshTokens(id);
    }

    await this.prisma.user.update({
      where: { id },
      data: { blockedAt: blocked ? new Date() : null },
    });
  }

  /**
   * Spec 013, decisao 10: um admin que se rebaixa perde no mesmo clique a tela
   * onde reverteria, e um que se bloqueia perde a conta. A regra e do
   * servidor; a UI apenas antecipa o motivo.
   */
  private assertNotSelf(actor: AuthUser, id: string, message: string): Promise<void> {
    if (actor.uid === id) {
      throw new ConflictException(message);
    }

    return Promise.resolve();
  }

  /** Alvo inexistente e 404, e nao uma escrita silenciosa no Firebase. */
  private async assertExists(id: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id }, select: { id: true } });

    if (!user) {
      throw new NotFoundException(`Usuario "${id}" nao encontrado.`);
    }
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

  /**
   * A grade do curso, na ordem em que o aluno a percorre. A listagem achata
   * (`flatLessons`) e o detalhe mantem os modulos; a consulta e a mesma.
   */
  private async courseModules(): Promise<CourseModule[]> {
    const course = await this.prisma.course.findUnique({
      where: { slug: DEFAULT_COURSE_SLUG },
      select: {
        modules: {
          orderBy: { order: 'asc' },
          select: {
            id: true,
            order: true,
            title: true,
            lessons: { orderBy: { order: 'asc' }, select: { id: true, order: true, title: true } },
          },
        },
      },
    });

    return (course?.modules ?? []) as CourseModule[];
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
