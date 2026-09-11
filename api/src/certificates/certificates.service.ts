import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import { AuthUser } from '../auth/auth.types';
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
 * continua sendo um por aluno, e o diploma de modulo, emitido quando aquele
 * modulo e concluido. O model e o mesmo — `moduleId` nulo distingue os dois.
 */
@Injectable()
export class CertificatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly progress: ProgressService,
    private readonly users: UsersService,
    private readonly config: ConfigService,
  ) {}

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

    // A conclusao do modulo e a mesma linha que o Hub e a trilha ja usam: o
    // criterio do diploma nao pode ser outro.
    const completed = await this.prisma.moduleProgress.findUnique({
      where: { userId_moduleId: { userId: user.uid, moduleId } },
    });

    if (!completed) {
      throw new ConflictException(
        'Conclua este modulo para emitir o certificado correspondente.',
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
