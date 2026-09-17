import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import { AuthUser } from '../auth/auth.types';
import { AccessService } from '../payments/access.service';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_COURSE_SLUG, ProgressService } from '../progress/progress.service';
import { UsersService } from '../users/users.service';
import { certificateHash, generateCode, hashSecret, normalizeCode } from './certificate-code';
import {
  CertificateVerification,
  PublicCertificate,
  StudentCertificate,
} from './certificates.types';

/** Certificado com aluno, curso e (quando houver) modulo incluidos. */
interface CertificateRow {
  userId: string;
  courseId: string;
  moduleId: string | null;
  code: string;
  hash: string;
  status: string;
  issuedAt: Date;
  user: { name: string | null; email: string };
  course: { title: string; workloadHours: number | null };
  module?: { title: string; order: number } | null;
}

const WITH_RELATIONS = {
  user: { select: { name: true, email: true } },
  course: { select: { title: true, workloadHours: true } },
  module: { select: { title: true, order: true } },
};

/**
 * Nome impresso no diploma. Cai no inicio do e-mail apenas se o perfil ainda
 * nao tem nome — mesma regra do `displayName` do front, para o aluno nao ver
 * duas grafias diferentes de si mesmo.
 */
function displayName(user: { name: string | null; email: string }): string {
  return user.name?.trim() || user.email.split('@')[0];
}

/** Titulo do modulo com o numero na frente, como a trilha o exibe. */
function moduleTitle(row: CertificateRow): string | null {
  return row.module ? `Módulo ${row.module.order}: ${row.module.title}` : null;
}

function toStudentCertificate(row: CertificateRow): StudentCertificate {
  return {
    code: row.code,
    hash: row.hash,
    scope: row.moduleId ? 'module' : 'course',
    studentName: displayName(row.user),
    courseTitle: row.course.title,
    moduleTitle: moduleTitle(row),
    moduleId: row.moduleId,
    workloadHours: row.course.workloadHours,
    issuedAt: row.issuedAt,
    status: row.status as StudentCertificate['status'],
  };
}

function toPublicCertificate(row: CertificateRow): PublicCertificate {
  return {
    code: row.code,
    scope: row.moduleId ? 'module' : 'course',
    studentName: displayName(row.user),
    courseTitle: row.course.title,
    moduleTitle: moduleTitle(row),
    workloadHours: row.course.workloadHours,
    issuedAt: row.issuedAt,
  };
}

/** Comparacao em tempo constante; tamanhos diferentes ja sao divergencia. */
function hashMatches(expected: string, stored: string): boolean {
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(stored, 'utf8');

  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Emissao e verificacao do diploma digital. O codigo publico e o hash nascem
 * aqui: um identificador fabricado no cliente nao validaria nada.
 *
 * Desde a Spec 010 existem dois escopos (decisao 11): o diploma do curso, que
 * continua sendo um por aluno, e o diploma de modulo. O model e o mesmo —
 * `moduleId` nulo distingue os dois.
 *
 * Na Spec 012 (decisao 13) o criterio do diploma de modulo passou a ser
 * **todas as aulas** daquele modulo concluidas, e nao existe diploma de aula:
 * emitir por aula multiplicaria os documentos por doze e esvaziaria o que eles
 * atestam. Diploma ja emitido nao e revogado quando uma aula nova entra no
 * modulo (decisao 14) — ele atesta o que estava publicado na data da emissao.
 */
@Injectable()
export class CertificatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly progress: ProgressService,
    private readonly users: UsersService,
    private readonly config: ConfigService,
    private readonly access: AccessService,
  ) {}

  /**
   * Exige acesso ativo a **todos** os modulos da trilha (Spec 014, decisao 18).
   *
   * Uma consulta so, e nao uma por modulo: o mapa de acessos ativos ja e o
   * formato em que o resto da plataforma le acesso.
   */
  private async requireAccessToAllModules(
    user: AuthUser,
    progress: { modules: { id: string; order: number }[] },
  ): Promise<void> {
    const active = await this.access.activeMap(user.uid);
    const missing = progress.modules.filter((module) => !active.has(module.id));

    if (missing.length > 0) {
      throw new ForbiddenException(
        `O certificado do curso exige acesso a todos os modulos. Faltam: ${missing
          .map((module) => `modulo ${module.order}`)
          .join(', ')}.`,
      );
    }
  }

  /** Certificado do curso do proprio aluno, ou nulo se ainda nao foi emitido. */
  async findForUser(user: AuthUser): Promise<StudentCertificate | null> {
    const course = await this.requireCourse();
    const certificate = await this.findCourseCertificate(user.uid, course.id);

    return certificate ? toStudentCertificate(certificate) : null;
  }

  /**
   * Emite o certificado do curso concluido. Idempotente: chamar de novo
   * devolve o mesmo diploma, porque reemitir mudaria o codigo que o aluno ja
   * pode ter mandado para um recrutador.
   */
  async issueForUser(user: AuthUser): Promise<StudentCertificate> {
    const course = await this.requireCourse();
    const existing = await this.findCourseCertificate(user.uid, course.id);

    if (existing) {
      return this.requireNotRevoked(existing);
    }

    const progress = await this.progress.findForUser(user);

    if (!progress.completed) {
      throw new ConflictException(
        `Conclua todos os modulos da trilha para emitir o certificado (${progress.percentage}% concluido).`,
      );
    }

    // Spec 014, decisao 18: o diploma do curso afirma o curso **inteiro**.
    // Emiti-lo para quem comprou metade da trilha seria emitir um documento
    // falso — e a conclusao sozinha nao basta, porque o progresso de antes do
    // paywall continua no banco, como deve continuar.
    await this.requireAccessToAllModules(user, progress);

    return this.create(user, { courseId: course.id, moduleId: null });
  }

  /** Diplomas de modulo ja emitidos para o aluno, do primeiro modulo ao ultimo. */
  async findModuleCertificates(user: AuthUser): Promise<StudentCertificate[]> {
    const certificates = (await this.prisma.certificate.findMany({
      where: { userId: user.uid, moduleId: { not: null } },
      orderBy: { module: { order: 'asc' } },
      include: WITH_RELATIONS,
    })) as CertificateRow[];

    return certificates.map(toStudentCertificate);
  }

  /**
   * Emite o diploma de um modulo concluido. Independente do diploma do curso:
   * um nao substitui nem antecipa o outro.
   *
   * A checagem do existente vem **antes** do criterio de conclusao de
   * proposito: e o que mantem o diploma valido depois de o admin acrescentar
   * uma aula ao modulo (decisao 14).
   */
  async issueForModule(user: AuthUser, moduleId: string): Promise<StudentCertificate> {
    const module = await this.prisma.module.findUnique({ where: { id: moduleId } });

    if (!module) {
      throw new NotFoundException(`Modulo "${moduleId}" nao encontrado.`);
    }

    const existing = (await this.prisma.certificate.findUnique({
      where: { userId_moduleId: { userId: user.uid, moduleId } },
      include: WITH_RELATIONS,
    })) as CertificateRow | null;

    if (existing) {
      return this.requireNotRevoked(existing);
    }

    // Spec 014, decisao 18: so emite quem comprou. A checagem vem DEPOIS da
    // busca pelo existente de proposito — diploma ja emitido continua valendo
    // com o acesso vencido, porque ele atesta um fato passado, e revoga-lo por
    // vencimento seria mentir sobre o que aconteceu.
    await this.access.requireForModule(user.uid, moduleId);

    // O criterio do diploma e o **mesmo** estado que o Hub e a trilha exibem:
    // desde a Spec 012 (decisao 13) "modulo concluido" e "todas as aulas deste
    // modulo concluidas", derivado pelo `ProgressService`. Reimplementar a
    // conta aqui abriria a porta para a tela dizer concluido e a emissao
    // discordar.
    const progress = await this.progress.findForUser(user);
    const target = progress.modules.find((item) => item.id === moduleId);

    if (!target?.completed) {
      throw new ConflictException(
        target && target.totalCount > 0
          ? `Conclua as ${target.totalCount} aulas deste modulo para emitir o certificado (${target.completedCount} concluida(s)).`
          : 'Este modulo ainda nao tem aulas publicadas.',
      );
    }

    return this.create(user, { courseId: module.courseId, moduleId });
  }

  /**
   * Verificacao publica por codigo. Os tres estados sao distintos de proposito:
   * quem digitou errado precisa saber que o codigo nao existe, e quem recebeu
   * um diploma revogado precisa saber que ele nao vale mais.
   */
  async verify(input: string): Promise<CertificateVerification> {
    const code = normalizeCode(input);

    if (!code) {
      return { status: 'not_found' };
    }

    const certificate = (await this.prisma.certificate.findUnique({
      where: { code },
      include: WITH_RELATIONS,
    })) as CertificateRow | null;

    if (!certificate) {
      return { status: 'not_found' };
    }

    if (certificate.status === 'REVOKED') {
      return { status: 'invalid', reason: 'revoked' };
    }

    const expected = certificateHash(hashSecret(this.config), {
      code: certificate.code,
      userId: certificate.userId,
      courseId: certificate.courseId,
      moduleId: certificate.moduleId,
      issuedAt: certificate.issuedAt,
    });

    if (!hashMatches(expected, certificate.hash)) {
      return { status: 'invalid', reason: 'tampered' };
    }

    return { status: 'valid', certificate: toPublicCertificate(certificate) };
  }

  /** Emissao propriamente dita, comum aos dois escopos. */
  private async create(
    user: AuthUser,
    target: { courseId: string; moduleId: string | null },
  ): Promise<StudentCertificate> {
    // O guard autentica, mas nao cria o registro do aluno no banco.
    await this.users.findOrCreate(user);

    // `issuedAt` e definido aqui, e nao pelo default do banco, porque entra no
    // hash: e preciso conhecer a data antes de assinar.
    const issuedAt = new Date();
    const code = generateCode();

    const created = await this.prisma.certificate.create({
      data: {
        userId: user.uid,
        courseId: target.courseId,
        moduleId: target.moduleId,
        code,
        issuedAt,
        hash: certificateHash(hashSecret(this.config), {
          code,
          userId: user.uid,
          courseId: target.courseId,
          moduleId: target.moduleId,
          issuedAt,
        }),
      },
      include: WITH_RELATIONS,
    });

    return toStudentCertificate(created as CertificateRow);
  }

  /** Revogar e um ato deliberado: reemitir por cima desfaria a decisao. */
  private requireNotRevoked(certificate: CertificateRow): StudentCertificate {
    if (certificate.status === 'REVOKED') {
      throw new ConflictException(
        'Este certificado foi revogado. Fale com o suporte para regularizar a emissao.',
      );
    }

    return toStudentCertificate(certificate);
  }

  /**
   * Diploma do curso inteiro. Nao e `findUnique`: desde a Spec 010 a coluna
   * `moduleId` distingue os dois escopos, e a unicidade do diploma de curso
   * vive num indice parcial em SQL (`WHERE module_id IS NULL`), que o Prisma
   * nao expoe como chave composta (decisao 11).
   */
  private async findCourseCertificate(userId: string, courseId: string) {
    const certificate = await this.prisma.certificate.findFirst({
      where: { userId, courseId, moduleId: null },
      include: WITH_RELATIONS,
    });

    return certificate as CertificateRow | null;
  }

  /** Curso unico da plataforma; sem ele nao ha o que certificar. */
  private async requireCourse() {
    const course = await this.prisma.course.findUnique({ where: { slug: DEFAULT_COURSE_SLUG } });

    if (!course) {
      throw new NotFoundException(
        `Curso "${DEFAULT_COURSE_SLUG}" nao encontrado. Rode o seed do banco (npm run db:seed).`,
      );
    }

    return course;
  }
}
