import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuthUser } from '../auth/auth.types';
import { AccessService } from '../payments/access.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProgressService } from '../progress/progress.service';
import { CertificatesService } from './certificates.service';

const ALUNO: AuthUser = {
  uid: 'uid-aluno',
  email: 'aluno@delcastanher.com',
  name: 'Aluno',
  role: 'aluno',
};

const COURSE = { id: 'course-1', slug: 'imersao-rh', title: 'Imersao RH', workloadHours: null };

/** Trilha inteira concluida: o que separa os casos abaixo e so o acesso. */
const COMPLETED_PROGRESS = {
  course: { slug: 'imersao-rh', title: 'Imersao RH', workloadHours: null },
  modules: [
    { id: 'mod-1', order: 1, title: 'Fundamentos', completed: true, totalCount: 2, completedCount: 2 },
    { id: 'mod-2', order: 2, title: 'Pratica', completed: true, totalCount: 2, completedCount: 2 },
  ],
  completedCount: 4,
  totalCount: 4,
  percentage: 100,
  completed: true,
};

function build(access: Partial<Record<keyof AccessService, jest.Mock>>) {
  const prisma = {
    course: { findUnique: jest.fn().mockResolvedValue(COURSE) },
    module: {
      findUnique: jest.fn().mockResolvedValue({ id: 'mod-1', courseId: 'course-1' }),
      findMany: jest.fn().mockResolvedValue([{ id: 'mod-1' }, { id: 'mod-2' }]),
      count: jest.fn().mockResolvedValue(2),
    },
    certificate: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
    },
  };

  const progress = { findForUser: jest.fn().mockResolvedValue(COMPLETED_PROGRESS) };

  return Test.createTestingModule({
    providers: [
      CertificatesService,
      { provide: PrismaService, useValue: prisma },
      { provide: ProgressService, useValue: progress },
      { provide: AccessService, useValue: access },
    ],
  })
    .compile()
    .then((moduleRef) => ({
      service: moduleRef.get(CertificatesService),
      prisma,
      progress,
    }));
}

/**
 * Certificado e compra (Spec 014, decisao 18).
 *
 * A regra de conclusao das Specs 008 e 012 continua valendo e ganha uma
 * condicao: so emite quem comprou. O diploma ja **emitido**, esse, nao expira
 * com o acesso — ele atesta um fato passado, e revoga-lo por vencimento seria
 * mentir sobre o que aconteceu.
 */
describe('Certificados sob o portao de acesso', () => {
  describe('issueForModule', () => {
    it('emite o diploma do modulo concluido e com acesso ativo', async () => {
      const { service, prisma } = await build({
        requireForModule: jest.fn().mockResolvedValue(undefined),
        hasActive: jest.fn().mockResolvedValue(true),
      });

      await service.issueForModule(ALUNO, 'mod-1').catch(() => undefined);

      expect(prisma.certificate.create).toHaveBeenCalled();
    });

    it('recusa com 403 o diploma de modulo sem acesso, mesmo concluido', async () => {
      const { service, prisma } = await build({
        requireForModule: jest.fn().mockRejectedValue(new ForbiddenException('sem acesso')),
        hasActive: jest.fn().mockResolvedValue(false),
      });

      await expect(service.issueForModule(ALUNO, 'mod-1')).rejects.toMatchObject({ status: 403 });
      expect(prisma.certificate.create).not.toHaveBeenCalled();
    });
  });

  describe('issueForUser', () => {
    // O diploma do curso afirma o curso inteiro: emiti-lo para quem comprou
    // metade da trilha seria emitir um documento falso.
    it('recusa o diploma do curso quando falta acesso a algum modulo', async () => {
      const { service, prisma } = await build({
        activeMap: jest.fn().mockResolvedValue(new Map([['mod-1', new Date('2027-03-17')]])),
      });

      await expect(service.issueForUser(ALUNO)).rejects.toMatchObject({ status: 403 });
      expect(prisma.certificate.create).not.toHaveBeenCalled();
    });

    it('emite o diploma do curso para quem tem acesso a todos os modulos', async () => {
      const { service, prisma } = await build({
        activeMap: jest
          .fn()
          .mockResolvedValue(
            new Map([
              ['mod-1', new Date('2027-03-17')],
              ['mod-2', new Date('2027-03-17')],
            ]),
          ),
      });

      await service.issueForUser(ALUNO).catch(() => undefined);

      expect(prisma.certificate.create).toHaveBeenCalled();
    });
  });

  /**
   * Decisao 18: o acesso vence, o diploma nao. Quem concluiu dentro dos 6 meses
   * fica com o documento — e o portal publico de validacao continua dizendo que
   * ele vale.
   */
  describe('leitura de diploma emitido', () => {
    it('lista os diplomas do aluno sem consultar acesso nenhum', async () => {
      const activeMap = jest.fn();
      const { service } = await build({ activeMap });

      await service.findModuleCertificates(ALUNO);

      expect(activeMap).not.toHaveBeenCalled();
    });
  });
});
