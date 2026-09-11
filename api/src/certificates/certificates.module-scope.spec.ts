import { ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { ProgressService } from '../progress/progress.service';
import { UsersService } from '../users/users.service';
import { certificateHash } from './certificate-code';
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

const MODULE = { id: 'mod-1', order: 1, title: 'Fundamentos do RH', courseId: 'course-1' };

const PROFILE = {
  id: 'uid-123',
  email: 'aluno@delcastanher.com',
  name: 'Aluno Teste',
  phone: '(11) 90000-0000',
  bio: 'Analista de RH.',
  linkedin: null,
};

const ISSUED_AT = new Date('2026-09-11T12:00:00.000Z');

/** Certificado de modulo como o Prisma devolve, com as relacoes incluidas. */
function moduleRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cert-mod-1',
    userId: 'uid-123',
    courseId: 'course-1',
    moduleId: 'mod-1',
    code: 'DELC-MODU-2345',
    hash: 'hash-gravado',
    status: 'ACTIVE',
    issuedAt: ISSUED_AT,
    revokedAt: null,
    user: PROFILE,
    course: COURSE,
    module: { title: MODULE.title, order: MODULE.order },
    ...overrides,
  };
}

/** Certificado do curso: `moduleId` nulo e `module` ausente. */
function courseRow(overrides: Record<string, unknown> = {}) {
  return {
    ...moduleRow(),
    id: 'cert-curso-1',
    moduleId: null,
    module: null,
    code: 'DELC-ABCD-2345',
    ...overrides,
  };
}

interface Mocks {
  findCourse: jest.Mock;
  findModule: jest.Mock;
  findUniqueCertificate: jest.Mock;
  findFirstCertificate: jest.Mock;
  findManyCertificates: jest.Mock;
  createCertificate: jest.Mock;
  findModuleProgress: jest.Mock;
}

async function build(overrides: Partial<Mocks> = {}) {
  const mocks: Mocks = {
    findCourse: jest.fn().mockResolvedValue(COURSE),
    findModule: jest.fn().mockResolvedValue(MODULE),
    findUniqueCertificate: jest.fn().mockResolvedValue(null),
    findFirstCertificate: jest.fn().mockResolvedValue(null),
    findManyCertificates: jest.fn().mockResolvedValue([]),
    createCertificate: jest.fn().mockImplementation(({ data }) => ({ ...moduleRow(), ...data })),
    findModuleProgress: jest.fn().mockResolvedValue({ moduleId: 'mod-1' }),
    ...overrides,
  };

  const moduleRef = await Test.createTestingModule({
    providers: [
      CertificatesService,
      {
        provide: PrismaService,
        useValue: {
          course: { findUnique: mocks.findCourse },
          module: { findUnique: mocks.findModule },
          moduleProgress: { findUnique: mocks.findModuleProgress },
          certificate: {
            findUnique: mocks.findUniqueCertificate,
            findFirst: mocks.findFirstCertificate,
            findMany: mocks.findManyCertificates,
            create: mocks.createCertificate,
          },
        },
      },
      { provide: ProgressService, useValue: { findForUser: jest.fn() } },
      { provide: UsersService, useValue: { findOrCreate: jest.fn().mockResolvedValue(PROFILE) } },
      { provide: ConfigService, useValue: { get: () => 'segredo-de-teste' } },
    ],
  }).compile();

  return { service: moduleRef.get(CertificatesService), mocks };
}

describe('CertificatesService (escopo modulo)', () => {
  describe('issueForModule', () => {
    it('recusa a emissao com o modulo ainda em aberto', async () => {
      const { service, mocks } = await build({
        findModuleProgress: jest.fn().mockResolvedValue(null),
      });

      await expect(service.issueForModule(USER, 'mod-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(mocks.createCertificate).not.toHaveBeenCalled();
    });

    it('emite o diploma do modulo concluido', async () => {
      const { service, mocks } = await build();

      const certificate = await service.issueForModule(USER, 'mod-1');

      expect(mocks.createCertificate).toHaveBeenCalledTimes(1);
      expect(certificate).toMatchObject({
        scope: 'module',
        moduleTitle: 'Fundamentos do RH',
        studentName: 'Aluno Teste',
      });
    });

    it('gera code e hash no servidor, e o hash inclui o modulo', async () => {
      const { service, mocks } = await build();

      await service.issueForModule(USER, 'mod-1');

      const { data } = mocks.createCertificate.mock.calls[0][0];

      expect(data.code).toMatch(/^DELC(-[0-9A-Z]{4}){2}$/);
      expect(data.hash).toMatch(/^[0-9a-f]{64}$/);
      expect(data.moduleId).toBe('mod-1');
    });

    it('e idempotente: o mesmo modulo nao gera um segundo diploma', async () => {
      const existing = moduleRow();
      const { service, mocks } = await build({
        findUniqueCertificate: jest.fn().mockResolvedValue(existing),
      });

      const certificate = await service.issueForModule(USER, 'mod-1');

      expect(mocks.createCertificate).not.toHaveBeenCalled();
      expect(certificate).toMatchObject({ code: existing.code });
    });

    it('responde 409 para um diploma de modulo revogado', async () => {
      const { service, mocks } = await build({
        findUniqueCertificate: jest
          .fn()
          .mockResolvedValue(moduleRow({ status: 'REVOKED', revokedAt: new Date() })),
      });

      await expect(service.issueForModule(USER, 'mod-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(mocks.createCertificate).not.toHaveBeenCalled();
    });

    it('recusa modulo inexistente', async () => {
      const { service } = await build({ findModule: jest.fn().mockResolvedValue(null) });

      await expect(service.issueForModule(USER, 'nao-existe')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('nao toca no certificado do curso: sao emissoes independentes', async () => {
      const { service, mocks } = await build();

      await service.issueForModule(USER, 'mod-1');

      const { data } = mocks.createCertificate.mock.calls[0][0];
      // Um diploma por modulo convive com o diploma do curso (decisao 11).
      expect(data.moduleId).not.toBeNull();
      expect(data.courseId).toBe('course-1');
    });
  });

  describe('findModuleCertificates', () => {
    it('lista os diplomas de modulo do aluno, sem o do curso', async () => {
      const findManyCertificates = jest.fn().mockResolvedValue([moduleRow()]);
      const { service } = await build({ findManyCertificates });

      const certificates = await service.findModuleCertificates(USER);

      expect(certificates).toHaveLength(1);
      expect(certificates[0]).toMatchObject({ scope: 'module', moduleId: 'mod-1' });

      const { where } = findManyCertificates.mock.calls[0][0];
      expect(where).toMatchObject({ userId: 'uid-123' });
      expect(where.moduleId).toEqual({ not: null });
    });

    it('devolve lista vazia quando ainda nao ha diploma de modulo', async () => {
      const { service } = await build();

      await expect(service.findModuleCertificates(USER)).resolves.toEqual([]);
    });
  });

  describe('verify com os dois escopos', () => {
    /** Emite de verdade para obter um hash coerente com o segredo de teste. */
    async function issuedModuleRow() {
      const { service, mocks } = await build();
      await service.issueForModule(USER, 'mod-1');
      const { data } = mocks.createCertificate.mock.calls[0][0];

      return moduleRow({ code: data.code, hash: data.hash, issuedAt: data.issuedAt });
    }

    it('devolve scope "module" e o titulo do modulo', async () => {
      const issued = await issuedModuleRow();
      const { service } = await build({
        findUniqueCertificate: jest.fn().mockResolvedValue(issued),
      });

      const result = await service.verify(issued.code);

      expect(result).toMatchObject({ status: 'valid' });
      expect(result.status === 'valid' && result.certificate).toMatchObject({
        scope: 'module',
        moduleTitle: 'Fundamentos do RH',
        courseTitle: 'Imersão RH Estratégico',
      });
    });

    it('devolve scope "course" e moduleTitle nulo no diploma do curso', async () => {
      // O hash do diploma de curso continua o da Spec 008, sem o modulo: a
      // Spec 010 nao pode invalidar um diploma ja emitido (decisao 11).
      const semModulo = courseRow({
        hash: certificateHash('segredo-de-teste', {
          code: 'DELC-ABCD-2345',
          userId: 'uid-123',
          courseId: 'course-1',
          issuedAt: ISSUED_AT,
        }),
      });
      const { service } = await build({
        findUniqueCertificate: jest.fn().mockResolvedValue(semModulo),
      });

      const result = await service.verify(semModulo.code);

      expect(result).toMatchObject({ status: 'valid' });
      expect(result.status === 'valid' && result.certificate).toMatchObject({
        scope: 'course',
        moduleTitle: null,
      });
    });

    it('nao expoe e-mail, telefone nem id interno em nenhum dos escopos', async () => {
      const issued = await issuedModuleRow();
      const { service } = await build({
        findUniqueCertificate: jest.fn().mockResolvedValue(issued),
      });

      const exposed = JSON.stringify(await service.verify(issued.code));

      expect(exposed).not.toContain('aluno@delcastanher.com');
      expect(exposed).not.toContain('90000-0000');
      expect(exposed).not.toContain('uid-123');
      expect(exposed).not.toContain('cert-mod-1');
      // O id do modulo tambem e interno: o portal mostra o titulo.
      expect(exposed).not.toContain('mod-1');
    });

    it('devolve invalid quando o hash de um diploma de modulo foi adulterado', async () => {
      const { service } = await build({
        findUniqueCertificate: jest
          .fn()
          .mockResolvedValue(moduleRow({ hash: 'hash-adulterado' })),
      });

      await expect(service.verify('DELC-MODU-2345')).resolves.toMatchObject({
        status: 'invalid',
        reason: 'tampered',
      });
    });

    it('devolve invalid para diploma de modulo revogado', async () => {
      const issued = await issuedModuleRow();
      const { service } = await build({
        findUniqueCertificate: jest
          .fn()
          .mockResolvedValue({ ...issued, status: 'REVOKED', revokedAt: new Date() }),
      });

      await expect(service.verify(issued.code)).resolves.toMatchObject({
        status: 'invalid',
        reason: 'revoked',
      });
    });
  });
});
