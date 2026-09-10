import { ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { ProgressService } from '../progress/progress.service';
import { UsersService } from '../users/users.service';
import { CertificatesService } from './certificates.service';

const USER: AuthUser = {
  uid: 'uid-123',
  email: 'aluno@delcastanher.com',
  name: 'Aluno Teste',
  role: 'aluno',
};

const COURSE = {
  id: 'course-1',
  slug: 'imersao-rh',
  title: 'Imersão RH Estratégico',
  workloadHours: null,
};

const PROFILE = {
  id: 'uid-123',
  email: 'aluno@delcastanher.com',
  name: 'Aluno Teste',
  phone: '(11) 90000-0000',
  bio: 'Analista de RH.',
  linkedin: null,
};

const ISSUED_AT = new Date('2026-09-10T12:00:00.000Z');

/** Certificado como o Prisma devolve, com aluno e curso incluidos. */
function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cert-1',
    userId: 'uid-123',
    courseId: 'course-1',
    code: 'DELC-ABCD-2345',
    hash: 'hash-gravado',
    status: 'ACTIVE',
    issuedAt: ISSUED_AT,
    revokedAt: null,
    user: PROFILE,
    course: COURSE,
    ...overrides,
  };
}

interface Mocks {
  findCourse: jest.Mock;
  findCertificate: jest.Mock;
  findByCode: jest.Mock;
  createCertificate: jest.Mock;
  findProgress: jest.Mock;
  findOrCreateUser: jest.Mock;
}

async function build(overrides: Partial<Mocks> = {}) {
  const mocks: Mocks = {
    findCourse: jest.fn().mockResolvedValue(COURSE),
    findCertificate: jest.fn().mockResolvedValue(null),
    findByCode: jest.fn().mockResolvedValue(null),
    createCertificate: jest.fn().mockImplementation(({ data }) => ({ ...row(), ...data })),
    findProgress: jest.fn().mockResolvedValue({ completed: true, percentage: 100, totalCount: 12 }),
    findOrCreateUser: jest.fn().mockResolvedValue(PROFILE),
    ...overrides,
  };

  const moduleRef = await Test.createTestingModule({
    providers: [
      CertificatesService,
      {
        provide: PrismaService,
        useValue: {
          course: { findUnique: mocks.findCourse },
          certificate: {
            findUnique: jest
              .fn()
              .mockImplementation(({ where }: { where: { code?: string } }) =>
                where.code === undefined ? mocks.findCertificate() : mocks.findByCode(where.code),
              ),
            create: mocks.createCertificate,
          },
        },
      },
      { provide: ProgressService, useValue: { findForUser: mocks.findProgress } },
      { provide: UsersService, useValue: { findOrCreate: mocks.findOrCreateUser } },
      { provide: ConfigService, useValue: { get: () => 'segredo-de-teste' } },
    ],
  }).compile();

  return { service: moduleRef.get(CertificatesService), mocks };
}

describe('CertificatesService', () => {
  describe('issueForUser', () => {
    it('recusa a emissao com a trilha incompleta', async () => {
      const { service, mocks } = await build({
        findProgress: jest.fn().mockResolvedValue({ completed: false, percentage: 75 }),
      });

      await expect(service.issueForUser(USER)).rejects.toBeInstanceOf(ConflictException);
      expect(mocks.createCertificate).not.toHaveBeenCalled();
    });

    it('emite o certificado quando a trilha esta 100% concluida', async () => {
      const { service, mocks } = await build();

      const certificate = await service.issueForUser(USER);

      expect(mocks.createCertificate).toHaveBeenCalledTimes(1);
      expect(certificate).toMatchObject({
        studentName: 'Aluno Teste',
        courseTitle: 'Imersão RH Estratégico',
        workloadHours: null,
      });
    });

    it('gera o code e o hash no servidor, sem receber nada do cliente', async () => {
      const { service, mocks } = await build();

      await service.issueForUser(USER);

      const { data } = mocks.createCertificate.mock.calls[0][0];

      expect(data.code).toMatch(/^DELC(-[0-9A-Z]{4}){2}$/);
      expect(data.hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('nao copia nome, titulo nem carga horaria para dentro da linha do certificado', async () => {
      const { service, mocks } = await build();

      await service.issueForUser(USER);

      const { data } = mocks.createCertificate.mock.calls[0][0];

      expect(data).not.toHaveProperty('studentName');
      expect(data).not.toHaveProperty('courseTitle');
      expect(data).not.toHaveProperty('workloadHours');
    });

    it('e idempotente: o mesmo aluno concluido nao gera um segundo certificado', async () => {
      const existing = row();
      const { service, mocks } = await build({
        findCertificate: jest.fn().mockResolvedValue(existing),
      });

      const certificate = await service.issueForUser(USER);

      expect(mocks.createCertificate).not.toHaveBeenCalled();
      expect(certificate).toMatchObject({ code: existing.code });
    });

    it('nao reemite um certificado revogado — a revogacao e um ato deliberado', async () => {
      const { service, mocks } = await build({
        findCertificate: jest
          .fn()
          .mockResolvedValue(row({ status: 'REVOKED', revokedAt: new Date() })),
      });

      await expect(service.issueForUser(USER)).rejects.toBeInstanceOf(ConflictException);
      expect(mocks.createCertificate).not.toHaveBeenCalled();
    });

    it('garante o registro do aluno antes de emitir, para nao esbarrar na FK', async () => {
      const { service, mocks } = await build();

      await service.issueForUser(USER);

      expect(mocks.findOrCreateUser).toHaveBeenCalledWith(USER);
    });

    it('falha de forma explicita quando o curso nao foi semeado', async () => {
      const { service } = await build({ findCourse: jest.fn().mockResolvedValue(null) });

      await expect(service.issueForUser(USER)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('findForUser', () => {
    it('devolve nulo quando o aluno ainda nao tem certificado', async () => {
      const { service } = await build();

      await expect(service.findForUser(USER)).resolves.toBeNull();
    });

    it('devolve o certificado do aluno com os dados do diploma', async () => {
      const { service } = await build({ findCertificate: jest.fn().mockResolvedValue(row()) });

      await expect(service.findForUser(USER)).resolves.toMatchObject({
        code: 'DELC-ABCD-2345',
        studentName: 'Aluno Teste',
        courseTitle: 'Imersão RH Estratégico',
        issuedAt: ISSUED_AT,
      });
    });
  });

  describe('verify', () => {
    /** Emite de verdade para obter um hash coerente com o segredo de teste. */
    async function issuedRow() {
      const { service, mocks } = await build();
      await service.issueForUser(USER);
      const { data } = mocks.createCertificate.mock.calls[0][0];

      return row({ code: data.code, hash: data.hash, issuedAt: data.issuedAt });
    }

    it('devolve not_found para um codigo que nao existe', async () => {
      const { service } = await build();

      await expect(service.verify('DELC-ZZZZ-9999')).resolves.toEqual({ status: 'not_found' });
    });

    it('devolve valid com os dados do diploma quando o hash confere', async () => {
      const issued = await issuedRow();
      const { service } = await build({ findByCode: jest.fn().mockResolvedValue(issued) });

      const result = await service.verify(issued.code);

      expect(result.status).toBe('valid');
      expect(result.certificate).toMatchObject({
        studentName: 'Aluno Teste',
        courseTitle: 'Imersão RH Estratégico',
        code: issued.code,
      });
    });

    it('nao expoe e-mail, telefone nem id interno do aluno', async () => {
      const issued = await issuedRow();
      const { service } = await build({ findByCode: jest.fn().mockResolvedValue(issued) });

      const result = await service.verify(issued.code);
      const exposed = JSON.stringify(result);

      expect(exposed).not.toContain('aluno@delcastanher.com');
      expect(exposed).not.toContain('90000-0000');
      expect(exposed).not.toContain('uid-123');
      expect(exposed).not.toContain('cert-1');
    });

    it('devolve invalid quando o certificado foi revogado', async () => {
      const issued = await issuedRow();
      const { service } = await build({
        findByCode: jest
          .fn()
          .mockResolvedValue({ ...issued, status: 'REVOKED', revokedAt: new Date() }),
      });

      await expect(service.verify(issued.code)).resolves.toMatchObject({
        status: 'invalid',
        reason: 'revoked',
      });
    });

    it('devolve invalid quando o hash nao confere com os dados gravados', async () => {
      const { service } = await build({
        findByCode: jest.fn().mockResolvedValue(row({ hash: 'hash-adulterado' })),
      });

      await expect(service.verify('DELC-ABCD-2345')).resolves.toMatchObject({
        status: 'invalid',
        reason: 'tampered',
      });
    });

    it('aceita o codigo em minusculas, com espacos ou sem hifens', async () => {
      const issued = await issuedRow();
      const findByCode = jest.fn().mockResolvedValue(issued);
      const { service } = await build({ findByCode });

      const digits = issued.code.replace(/-/g, '').toLowerCase();

      await expect(service.verify(`  ${digits}  `)).resolves.toMatchObject({ status: 'valid' });
      expect(findByCode).toHaveBeenCalledWith(issued.code);
    });

    it('devolve not_found para um codigo vazio, sem consultar o banco', async () => {
      const { service, mocks } = await build();

      await expect(service.verify('   ')).resolves.toEqual({ status: 'not_found' });
      expect(mocks.findByCode).not.toHaveBeenCalled();
    });
  });
});
