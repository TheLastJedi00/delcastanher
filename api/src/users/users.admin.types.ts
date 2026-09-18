import { Role } from '../auth/auth.types';

/**
 * Linha da listagem administrativa. Traz o progresso **ja calculado**, pelo
 * mesmo motivo que a Spec 008 calculava o percentual do aluno no servidor: a
 * tela nao refaz a conta, e as vinte linhas da pagina saem de uma consulta so
 * (Spec 013, decisao 8).
 */
export interface AdminUserItem {
  id: string;
  /**
   * Nulo para quem criou a conta e parou antes do onboarding. A tela mostra o
   * e-mail no lugar, com o selo "Onboarding pendente": esconder a linha faria
   * a tabela discordar do KPI logo acima dela (decisao 15).
   */
  name: string | null;
  email: string;
  /** Iniciais do avatar, derivadas do nome ou, na falta dele, do e-mail. */
  initials: string;
  role: Role;
  /** Espelho de `blockedAt`: a tela so precisa do sim ou nao. */
  blocked: boolean;
  onboardingCompleted: boolean;
  /** Data de matricula — o registro nasce na primeira entrada na plataforma. */
  createdAt: Date;
  /** Nulo para quem nao acessou desde que a coluna existe (decisao 5). */
  lastSeenAt: Date | null;
  completedLessons: number;
  totalLessons: number;
  /** Inteiro de 0 a 100, no mesmo criterio do progresso do aluno. */
  percentage: number;
  /**
   * Modulo da primeira aula em aberto — o mesmo `nextLesson` que o Hub usa,
   * para que o painel nao invente um segundo conceito de "onde o aluno esta".
   * Nulos quando o curso inteiro esta concluido, e ai `courseCompleted` e
   * verdadeiro: a tela mostra "Concluido", e nao "12 / 12".
   */
  currentModuleOrder: number | null;
  currentModuleTitle: string | null;
  courseCompleted: boolean;
}

/**
 * Os tres numeros do topo do painel. Cada definicao esta fixada na decisao 6 e
 * aparece escrita ao lado do numero na tela — percentual sem criterio visivel
 * e enfeite.
 */
export interface AdminUsersKpis {
  /** Usuarios de papel `aluno` nao bloqueados. Administrador nao e aluno. */
  totalStudents: number;
  /** Destes, os que acessaram nos ultimos 30 dias. */
  activeStudents: number;
  /** Fracao (0 a 100) dos alunos que concluiu ao menos uma aula em 30 dias. */
  engagementRate: number;
  /** A janela usada nos dois ultimos, em dias, para a tela nao a repetir. */
  windowDays: number;
}

/** Pagina da listagem, com os KPIs da base inteira — nao os da pagina. */
export interface AdminUserListResult {
  items: AdminUserItem[];
  /** Total de linhas do filtro corrente, para a paginacao. */
  total: number;
  page: number;
  pageSize: number;
  kpis: AdminUsersKpis;
}

/** Aula concluida por um aluno, no detalhe. */
export interface AdminUserLessonItem {
  id: string;
  order: number;
  title: string;
  completed: boolean;
}

/** Modulo no detalhe do aluno, com as aulas dele e o quanto foi concluido. */
export interface AdminUserModuleItem {
  id: string;
  order: number;
  title: string;
  completedCount: number;
  totalCount: number;
  completed: boolean;
  lessons: AdminUserLessonItem[];
}

/**
 * Diploma no detalhe. Exibido, nunca revogado por aqui: revogacao segue sendo
 * ato deliberado, sem tela (Spec 008, decisao 8; Spec 013, decisao 12).
 */
export interface AdminUserCertificateItem {
  id: string;
  code: string;
  /** `curso` quando `moduleId` e nulo; `modulo` quando preenchido. */
  scope: 'curso' | 'modulo';
  moduleTitle: string | null;
  status: 'ACTIVE' | 'REVOKED';
  issuedAt: Date;
}

/**
 * Detalhe do aluno. Somente leitura: o onboarding e declaracao do proprio
 * aluno, e um administrador reescrevendo bio e telefone de outra pessoa abre
 * um caminho de alteracao de dado pessoal sem rastro (decisao 11).
 */
export interface AdminUserDetail {
  id: string;
  name: string | null;
  email: string;
  initials: string;
  bio: string | null;
  phone: string | null;
  linkedin: string | null;
  role: Role;
  blocked: boolean;
  onboardingCompleted: boolean;
  createdAt: Date;
  lastSeenAt: Date | null;
  /**
   * Aceite da Politica de Privacidade, para o suporte (Spec 015, decisao 11).
   * Nulo e conta anterior a exigencia, e nunca recusa — a tela precisa poder
   * distinguir os dois. Nao ha rota que escreva isto: aceite que o
   * administrador edita nao prova nada.
   */
  policyAcceptedAt: Date | null;
  policyAcceptedVersion: string | null;
  completedLessons: number;
  totalLessons: number;
  percentage: number;
  courseCompleted: boolean;
  modules: AdminUserModuleItem[];
  certificates: AdminUserCertificateItem[];
}
