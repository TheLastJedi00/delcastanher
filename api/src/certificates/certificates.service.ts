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

/** Certificado com aluno e curso incluidos, como vem do Prisma. */
interface CertificateRow {
  userId: string;
  courseId: string;
  code: string;
  hash: string;
  status: string;
  issuedAt: Date;
  user: { name: string | null; email: string };
  course: { title: string; workloadHours: number | null };
}

const WITH_RELATIONS = {
  user: { select: { name: true, email: true } },
  course: { select: { title: true, workloadHours: true } },
};

/**
 * Nome impresso no diploma. Cai no inicio do e-mail apenas se o perfil ainda
 * nao tem nome — mesma regra do `displayName` do front, para o aluno nao ver
 * duas grafias diferentes de si mesmo.
 */
function displayName(user: { name: string | null; email: string }): string {
  return user.name?.trim() || user.email.split('@')[0];
}

function toStudentCertificate(row: CertificateRow): StudentCertificate {
  return {
    code: row.code,
    hash: row.hash,
    studentName: displayName(row.user),
    courseTitle: row.course.title,
    workloadHours: row.course.workloadHours,
    issuedAt: row.issuedAt,
    status: row.status as StudentCertificate['status'],
  };
}

function toPublicCertificate(row: CertificateRow): PublicCertificate {
  return {
    code: row.code,
    studentName: displayName(row.user),
    courseTitle: row.course.title,
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
 */
@Injectable()
export class CertificatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly progress: ProgressService,
    private readonly users: UsersService,
    private readonly config: ConfigService,
  ) {}

  /** Certificado do proprio aluno, ou nulo se ainda nao foi emitido. */
  async findForUser(user: AuthUser): Promise<StudentCertificate | null> {
    const course = await this.requireCourse();

    const certificate = await this.prisma.certificate.findUnique({
      where: { userId_courseId: { userId: user.uid, courseId: course.id } },
      include: WITH_RELATIONS,
    });

    return certificate ? toStudentCertificate(certificate as CertificateRow) : null;
  }

  /**
   * Emite o certificado do curso concluido. Idempotente: chamar de novo
   * devolve o mesmo diploma, porque reemitir mudaria o codigo que o aluno ja
   * pode ter mandado para um recrutador.
   */
  async issueForUser(user: AuthUser): Promise<StudentCertificate> {
    const course = await this.requireCourse();

    const existing = await this.prisma.certificate.findUnique({
      where: { userId_courseId: { userId: user.uid, courseId: course.id } },
      include: WITH_RELATIONS,
    });

    if (existing) {
      if (existing.status === 'REVOKED') {
        throw new ConflictException(
          'Este certificado foi revogado. Fale com o suporte para regularizar a emissao.',
        );
      }

      return toStudentCertificate(existing as CertificateRow);
    }

    const progress = await this.progress.findForUser(user);

    if (!progress.completed) {
      throw new ConflictException(
        `Conclua todos os modulos da trilha para emitir o certificado (${progress.percentage}% concluido).`,
      );
    }

    // O guard autentica, mas nao cria o registro do aluno no banco.
    await this.users.findOrCreate(user);

    // `issuedAt` e definido aqui, e nao pelo default do banco, porque entra no
    // hash: e preciso conhecer a data antes de assinar.
    const issuedAt = new Date();
    const code = generateCode();

    const created = await this.prisma.certificate.create({
      data: {
        userId: user.uid,
        courseId: course.id,
        code,
        issuedAt,
        hash: certificateHash(hashSecret(this.config), {
          code,
          userId: user.uid,
          courseId: course.id,
          issuedAt,
        }),
      },
      include: WITH_RELATIONS,
    });

    return toStudentCertificate(created as CertificateRow);
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
      issuedAt: certificate.issuedAt,
    });

    if (!hashMatches(expected, certificate.hash)) {
      return { status: 'invalid', reason: 'tampered' };
    }

    return { status: 'valid', certificate: toPublicCertificate(certificate) };
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
