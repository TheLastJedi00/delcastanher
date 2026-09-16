import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { FirebaseService } from '../firebase/firebase.service';
import { AdminUsersService } from './users.admin.service';
import { ListAdminUsersDto } from './dto/list-admin-users.dto';

/**
 * Curso de teste: dois modulos, quatro aulas no total. E o bastante para o
 * percentual dar numeros redondos (25%, 50%, 100%) e para "modulo atual" ter
 * onde variar.
 */
const COURSE = {
  id: 'course-1',
  slug: 'imersao-rh',
  modules: [
    {
      id: 'm1',
      order: 1,
      title: 'Fundamentos',
      lessons: [
        { id: 'l1', order: 1, title: 'O papel do RH' },
        { id: 'l2', order: 2, title: 'Maturidade de RH' },
      ],
    },
    {
      id: 'm2',
      order: 2,
      title: 'Diagnóstico',
      lessons: [
        { id: 'l3', order: 1, title: 'Indicadores' },
        { id: 'l4', order: 2, title: 'Plano de acao' },
      ],
    },
  ],
};

const ANA = {
  id: 'uid-ana',
  name: 'Ana Silva',
  email: 'ana@empresa.com',
  role: 'aluno' as const,
  blockedAt: null,
  onboardingCompleted: true,
  createdAt: new Date('2026-08-10T12:00:00Z'),
  lastSeenAt: new Date('2026-09-14T12:00:00Z'),
};

const CARLOS = {
  id: 'uid-carlos',
  name: null,
  email: 'carlos@empresa.com',
  role: 'aluno' as const,
  blockedAt: null,
  onboardingCompleted: false,
  createdAt: new Date('2026-08-12T12:00:00Z'),
  lastSeenAt: null,
};

/** Consulta padrao da tela: primeira pagina, sem filtro, ordenada por nome. */
const QUERY: ListAdminUsersDto = {
  page: 1,
  pageSize: 20,
  sort: 'nome',
  direction: 'asc',
};

interface Fake {
  users?: unknown[];
  total?: number;
  /** Curso devolvido pela consulta da grade; o padrao e o COURSE acima. */
  course?: unknown;
  progress?: { userId: string; lessonId: string }[];
  /** Quantidades devolvidas pelos `count` dos KPIs, na ordem matriculados/ativos. */
  counts?: [number, number];
  engaged?: { userId: string }[];
}

async function build(fake: Fake = {}) {
  const findMany = jest.fn().mockResolvedValue(fake.users ?? [ANA]);
  const progressFindMany = jest.fn().mockResolvedValue(fake.progress ?? []);
  const groupBy = jest.fn().mockResolvedValue(fake.engaged ?? []);
  const [students, active] = fake.counts ?? [1, 1];

  // Tres `count` com `where` diferentes: o total do filtro corrente da tela e
  // os dois dos KPIs, que valem para a base inteira e nao para a pagina.
  const count = jest.fn().mockImplementation(({ where }: { where: Record<string, unknown> }) => {
    if (where?.lastSeenAt) return Promise.resolve(active);
    if (where?.role === 'aluno' && where?.blockedAt === null) return Promise.resolve(students);

    return Promise.resolve(fake.total ?? (fake.users ?? [ANA]).length);
  });

  const prisma = {
    course: { findUnique: jest.fn().mockResolvedValue(fake.course ?? COURSE) },
    user: { findMany, count },
    lessonProgress: { findMany: progressFindMany, groupBy },
  };

  const moduleRef = await Test.createTestingModule({
    providers: [
      AdminUsersService,
      { provide: PrismaService, useValue: prisma },
      { provide: FirebaseService, useValue: { auth: {} } },
    ],
  }).compile();

  return { service: moduleRef.get(AdminUsersService), findMany, count, progressFindMany, groupBy };
}

describe('AdminUsersService', () => {
  describe('list', () => {
    it('devolve a pagina pedida com o total do filtro corrente', async () => {
      const { service } = await build({ users: [ANA, CARLOS], total: 37 });

      const result = await service.list({ ...QUERY, page: 2 });

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(37);
      expect(result.page).toBe(2);
      expect(result.pageSize).toBe(20);
    });

    // Spec 013, decisao 7: paginar no cliente significaria baixar o cadastro
    // inteiro para uma tela que mostra vinte linhas.
    it('pagina no servidor, traduzindo pagina e tamanho em skip e take', async () => {
      const { service, findMany } = await build();

      await service.list({ ...QUERY, page: 3, pageSize: 20 });

      expect(findMany.mock.calls[0][0]).toMatchObject({ skip: 40, take: 20 });
    });

    it('busca por nome ou e-mail sem diferenciar maiusculas', async () => {
      const { service, findMany } = await build();

      await service.list({ ...QUERY, search: 'ANA' });

      expect(findMany.mock.calls[0][0].where.OR).toEqual([
        { name: { contains: 'ANA', mode: 'insensitive' } },
        { email: { contains: 'ANA', mode: 'insensitive' } },
      ]);
    });

    it('nao gera clausula de busca quando o termo vem vazio', async () => {
      const { service, findMany } = await build();

      await service.list({ ...QUERY, search: '   ' });

      expect(findMany.mock.calls[0][0].where).not.toHaveProperty('OR');
    });

    it('filtra por papel', async () => {
      const { service, findMany } = await build();

      await service.list({ ...QUERY, role: 'admin' });

      expect(findMany.mock.calls[0][0].where.role).toBe('admin');
    });

    it('filtra por situacao, traduzindo bloqueado em blockedAt preenchido', async () => {
      const { service, findMany } = await build();

      await service.list({ ...QUERY, status: 'bloqueado' });

      expect(findMany.mock.calls[0][0].where.blockedAt).toEqual({ not: null });
    });

    it('filtra por situacao ativa como blockedAt nulo', async () => {
      const { service, findMany } = await build();

      await service.list({ ...QUERY, status: 'ativo' });

      expect(findMany.mock.calls[0][0].where.blockedAt).toBeNull();
    });

    it('aplica o mesmo filtro na contagem e na pagina', async () => {
      const { service, findMany, count } = await build();

      await service.list({ ...QUERY, search: 'ana', role: 'aluno' });

      expect(count.mock.calls[0][0].where).toEqual(findMany.mock.calls[0][0].where);
    });

    it('ordena por nome, matricula e ultimo acesso na direcao pedida', async () => {
      const { service, findMany } = await build();

      await service.list({ ...QUERY, sort: 'nome', direction: 'desc' });
      await service.list({ ...QUERY, sort: 'matricula', direction: 'asc' });

      expect(findMany.mock.calls[0][0].orderBy).toEqual({ name: 'desc' });
      expect(findMany.mock.calls[1][0].orderBy).toEqual({ createdAt: 'asc' });
    });

    // Quem nunca acessou nao pode ocupar o topo da ordenacao por acesso: o
    // nulo e ausencia de dado, nao a data mais antiga.
    it('joga quem nunca acessou para o fim da ordenacao por acesso', async () => {
      const { service, findMany } = await build();

      await service.list({ ...QUERY, sort: 'acesso', direction: 'desc' });

      expect(findMany.mock.calls[0][0].orderBy).toEqual({
        lastSeenAt: { sort: 'desc', nulls: 'last' },
      });
    });

    // Progresso nao e coluna: a ordenacao sai da contagem de linhas de
    // `lesson_progress`, que com um curso unico e o proprio numero de aulas
    // concluidas — e continua sendo feita pelo banco.
    it('ordena por progresso pela contagem de aulas concluidas', async () => {
      const { service, findMany } = await build();

      await service.list({ ...QUERY, sort: 'progresso', direction: 'desc' });

      expect(findMany.mock.calls[0][0].orderBy).toEqual({ progress: { _count: 'desc' } });
    });

    it('devolve pagina vazia sem quebrar, preservando o total', async () => {
      const { service } = await build({ users: [], total: 0 });

      const result = await service.list(QUERY);

      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
    });

    // Spec 013, decisao 15: conta sem onboarding aparece, com o e-mail no
    // lugar do nome — esconde-la faria a tabela discordar do KPI.
    it('mantem na lista quem nao concluiu o onboarding, com iniciais do e-mail', async () => {
      const { service } = await build({ users: [CARLOS] });

      const [item] = (await service.list(QUERY)).items;

      expect(item.name).toBeNull();
      expect(item.onboardingCompleted).toBe(false);
      expect(item.initials).toBe('CA');
    });

    it('deriva as iniciais do primeiro e do ultimo nome', async () => {
      const { service } = await build({ users: [ANA] });

      expect((await service.list(QUERY)).items[0].initials).toBe('AS');
    });

    it('expoe o bloqueio como booleano, sem vazar a data para a tela', async () => {
      const bloqueada = { ...ANA, blockedAt: new Date('2026-09-01T12:00:00Z') };
      const { service } = await build({ users: [bloqueada] });

      const [item] = (await service.list(QUERY)).items;

      expect(item.blocked).toBe(true);
      expect(item).not.toHaveProperty('blockedAt');
    });

    // Spec 013, decisao 11: a listagem nao carrega dado pessoal que a tela nao
    // mostra. Bio e LinkedIn so existem no detalhe.
    it('nao devolve bio nem linkedin na listagem', async () => {
      const { service, findMany } = await build();

      const [item] = (await service.list(QUERY)).items;

      expect(item).not.toHaveProperty('bio');
      expect(item).not.toHaveProperty('linkedin');
      expect(findMany.mock.calls[0][0].select).not.toHaveProperty('bio');
    });
  });

  describe('list: progresso da linha', () => {
    /** Conclusoes de Ana, no formato em que a consulta as devolve. */
    const done = (...lessonIds: string[]) =>
      lessonIds.map((lessonId) => ({ userId: ANA.id, lessonId }));

    it('conta aulas concluidas sobre o total de aulas do curso', async () => {
      const { service } = await build({ users: [ANA], progress: done('l1') });

      const [item] = (await service.list(QUERY)).items;

      expect(item.completedLessons).toBe(1);
      expect(item.totalLessons).toBe(4);
      expect(item.percentage).toBe(25);
    });

    it('deixa em zero quem ainda nao concluiu nenhuma aula', async () => {
      const { service } = await build({ users: [ANA], progress: [] });

      const [item] = (await service.list(QUERY)).items;

      expect(item.completedLessons).toBe(0);
      expect(item.percentage).toBe(0);
      expect(item.courseCompleted).toBe(false);
    });

    // Spec 013, decisao 8: e o mesmo `nextLesson` do Hub. A primeira **em
    // aberto**, e nao a seguinte a ultima concluida — o aluno pode ter pulado.
    it('aponta o modulo da primeira aula em aberto como modulo atual', async () => {
      const { service } = await build({ users: [ANA], progress: done('l1', 'l2', 'l3') });

      const [item] = (await service.list(QUERY)).items;

      expect(item.currentModuleOrder).toBe(2);
      expect(item.currentModuleTitle).toBe('Diagnóstico');
    });

    it('volta ao modulo anterior quando o aluno pulou uma aula', async () => {
      const { service } = await build({ users: [ANA], progress: done('l1', 'l3', 'l4') });

      const [item] = (await service.list(QUERY)).items;

      expect(item.currentModuleOrder).toBe(1);
      expect(item.percentage).toBe(75);
    });

    // A tela mostra "Concluido", e nao "12 / 12": com tudo terminado nao ha
    // modulo atual nenhum.
    it('marca o curso como concluido e zera o modulo atual', async () => {
      const { service } = await build({ users: [ANA], progress: done('l1', 'l2', 'l3', 'l4') });

      const [item] = (await service.list(QUERY)).items;

      expect(item.percentage).toBe(100);
      expect(item.courseCompleted).toBe(true);
      expect(item.currentModuleOrder).toBeNull();
      expect(item.currentModuleTitle).toBeNull();
    });

    it('nao atribui a um aluno a conclusao de outro', async () => {
      const { service } = await build({
        users: [ANA, CARLOS],
        progress: [...done('l1', 'l2'), { userId: CARLOS.id, lessonId: 'l1' }],
      });

      const [ana, carlos] = (await service.list(QUERY)).items;

      expect(ana.completedLessons).toBe(2);
      expect(carlos.completedLessons).toBe(1);
    });

    // Spec 013, decisao 8: uma consulta de progresso por pagina, nunca uma por
    // linha. O N+1 aqui seriam vinte consultas a cada digito da busca.
    it('busca o progresso da pagina inteira em uma consulta so', async () => {
      const { service, progressFindMany } = await build({ users: [ANA, CARLOS] });

      await service.list(QUERY);

      expect(progressFindMany).toHaveBeenCalledTimes(1);
      expect(progressFindMany.mock.calls[0][0].where.userId).toEqual({
        in: [ANA.id, CARLOS.id],
      });
    });

    it('nao consulta progresso nenhum quando a pagina vem vazia', async () => {
      const { service, progressFindMany } = await build({ users: [], total: 0 });

      await service.list(QUERY);

      expect(progressFindMany).not.toHaveBeenCalled();
    });

    // Curso recem-semeado, sem aula publicada: dividir por zero daria NaN na
    // tela em vez de 0%.
    it('devolve zero por cento quando o curso ainda nao tem aula', async () => {
      const { service } = await build({ users: [ANA], course: { ...COURSE, modules: [] } });

      const [item] = (await service.list(QUERY)).items;

      expect(item.totalLessons).toBe(0);
      expect(item.percentage).toBe(0);
      expect(item.courseCompleted).toBe(false);
    });
  });

  /**
   * Spec 013, decisao 6: as definicoes sao fixas e aparecem escritas ao lado
   * do numero na tela. Alunos matriculados sao os de papel `aluno` nao
   * bloqueados; ativos, os que acessaram nos ultimos 30 dias; engajamento, a
   * fracao que concluiu ao menos uma aula na mesma janela.
   */
  describe('list: KPIs', () => {
    it('devolve os tres numeros com a janela usada nos dois ultimos', async () => {
      const { service } = await build({
        counts: [10, 7],
        engaged: [{ userId: 'a' }, { userId: 'b' }, { userId: 'c' }, { userId: 'd' }, { userId: 'e' }],
      });

      const { kpis } = await service.list(QUERY);

      expect(kpis.totalStudents).toBe(10);
      expect(kpis.activeStudents).toBe(7);
      expect(kpis.engagementRate).toBe(50);
      expect(kpis.windowDays).toBe(30);
    });

    // Divisao por zero daria NaN num card que diz "%".
    it('devolve engajamento zero quando nao ha nenhum aluno na base', async () => {
      const { service } = await build({ counts: [0, 0], engaged: [] });

      expect((await service.list(QUERY)).kpis.engagementRate).toBe(0);
    });

    it('conta como matriculado so quem e aluno e nao esta bloqueado', async () => {
      const { service, count } = await build();

      await service.list(QUERY);

      const matriculados = count.mock.calls.find(
        ([args]) => args.where?.role === 'aluno' && args.where?.blockedAt === null,
      );

      expect(matriculados).toBeDefined();
    });

    // Spec 013, decisao 16: o administrador aparece na tabela, mas nao e aluno
    // matriculado — contando-o, o KPI mentiria sobre o tamanho da turma.
    it('nao conta administrador como aluno matriculado', async () => {
      const { service, count } = await build();

      await service.list(QUERY);

      const kpiCalls = count.mock.calls.filter(([args]) => args.where?.role);

      for (const [args] of kpiCalls) {
        expect(args.where.role).toBe('aluno');
      }
    });

    it('mede ativos pelo ultimo acesso dentro da janela de 30 dias', async () => {
      const { service, count } = await build();
      const before = Date.now();

      await service.list(QUERY);

      const [ativos] = count.mock.calls.find(([args]) => args.where?.lastSeenAt) ?? [];
      const cutoff = (ativos.where.lastSeenAt as { gte: Date }).gte;

      expect(before - cutoff.getTime()).toBeCloseTo(30 * 24 * 60 * 60 * 1000, -4);
      expect(ativos.where.blockedAt).toBeNull();
    });

    // Engajamento e "quantos alunos distintos concluiram alguma aula", e nao
    // "quantas aulas foram concluidas": quem terminou seis aulas na semana
    // continua sendo uma pessoa.
    it('agrupa o engajamento por aluno, nao por conclusao', async () => {
      const { service, groupBy } = await build({ counts: [4, 4], engaged: [{ userId: 'a' }] });

      const { kpis } = await service.list(QUERY);

      expect(groupBy.mock.calls[0][0].by).toEqual(['userId']);
      expect(groupBy.mock.calls[0][0].where.completedAt).toEqual({ gte: expect.any(Date) });
      expect(kpis.engagementRate).toBe(25);
    });

    it('restringe o engajamento aos alunos nao bloqueados', async () => {
      const { service, groupBy } = await build();

      await service.list(QUERY);

      expect(groupBy.mock.calls[0][0].where.user).toEqual({ role: 'aluno', blockedAt: null });
    });

    // Os KPIs sao da base inteira: filtrar a tela por "bloqueados" nao pode
    // fazer o topo do painel dizer que a turma encolheu.
    it('nao deixa o filtro da tela contaminar os KPIs', async () => {
      const { service, count } = await build({ counts: [10, 7] });

      const { kpis } = await service.list({ ...QUERY, search: 'ana', status: 'bloqueado' });

      const kpiCalls = count.mock.calls.filter(([args]) => args.where?.role === 'aluno');

      for (const [args] of kpiCalls) {
        expect(args.where).not.toHaveProperty('OR');
      }

      expect(kpis.totalStudents).toBe(10);
    });
  });
});
