import { Test } from '@nestjs/testing';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

const FIREBASE_USER: AuthUser = {
  uid: 'uid-123',
  email: 'aluno@delcastanher.com',
  name: 'Aluno do Firebase',
  role: 'aluno',
};

const ONBOARDING: UpdateUserDto = {
  name: 'Aluno Completo',
  bio: 'Analista de RH ha 8 anos.',
  phone: '(11) 90000-0000',
  linkedin: 'https://linkedin.com/in/aluno',
};

async function build(upsert = jest.fn()) {
  const moduleRef = await Test.createTestingModule({
    providers: [UsersService, { provide: PrismaService, useValue: { user: { upsert } } }],
  }).compile();

  return { service: moduleRef.get(UsersService), upsert };
}

describe('UsersService', () => {
  describe('findOrCreate', () => {
    it('cria o registro no primeiro acesso usando o UID do Firebase como id', async () => {
      const { service, upsert } = await build(jest.fn().mockResolvedValue({ id: 'uid-123' }));

      await service.findOrCreate(FIREBASE_USER);

      expect(upsert).toHaveBeenCalledWith({
        where: { id: 'uid-123' },
        update: { email: 'aluno@delcastanher.com' },
        create: {
          id: 'uid-123',
          email: 'aluno@delcastanher.com',
          name: 'Aluno do Firebase',
        },
      });
    });

    it('devolve o registro ja existente sem exigir onboarding refeito', async () => {
      const existing = { id: 'uid-123', onboardingCompleted: true };
      const { service } = await build(jest.fn().mockResolvedValue(existing));

      await expect(service.findOrCreate(FIREBASE_USER)).resolves.toBe(existing);
    });
  });

  describe('update', () => {
    it('grava o perfil e conclui o onboarding quando os obrigatorios vem preenchidos', async () => {
      const { service, upsert } = await build(jest.fn().mockResolvedValue({ id: 'uid-123' }));

      await service.update(FIREBASE_USER, ONBOARDING);

      expect(upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'uid-123' },
          update: {
            name: 'Aluno Completo',
            bio: 'Analista de RH ha 8 anos.',
            phone: '(11) 90000-0000',
            linkedin: 'https://linkedin.com/in/aluno',
            onboardingCompleted: true,
          },
        }),
      );
    });

    it('completa o protocolo do linkedin informado sem https', async () => {
      const { service, upsert } = await build(jest.fn().mockResolvedValue({ id: 'uid-123' }));

      await service.update(FIREBASE_USER, { ...ONBOARDING, linkedin: 'linkedin.com/in/aluno' });

      expect(upsert.mock.calls[0][0].update.linkedin).toBe('https://linkedin.com/in/aluno');
    });

    it('normaliza o linkedin ausente para null em vez de undefined', async () => {
      const { service, upsert } = await build(jest.fn().mockResolvedValue({ id: 'uid-123' }));

      await service.update(FIREBASE_USER, { ...ONBOARDING, linkedin: undefined });

      expect(upsert.mock.calls[0][0].update.linkedin).toBeNull();
    });

    it('nao conclui o onboarding quando um obrigatorio chega vazio', async () => {
      const { service, upsert } = await build(jest.fn().mockResolvedValue({ id: 'uid-123' }));

      await service.update(FIREBASE_USER, { ...ONBOARDING, bio: '  ' });

      expect(upsert.mock.calls[0][0].update.onboardingCompleted).toBe(false);
    });

    it('cria o registro quando o usuario ainda nao existe no banco', async () => {
      const { service, upsert } = await build(jest.fn().mockResolvedValue({ id: 'uid-123' }));

      await service.update(FIREBASE_USER, ONBOARDING);

      expect(upsert.mock.calls[0][0].create).toEqual({
        id: 'uid-123',
        email: 'aluno@delcastanher.com',
        name: 'Aluno Completo',
        bio: 'Analista de RH ha 8 anos.',
        phone: '(11) 90000-0000',
        linkedin: 'https://linkedin.com/in/aluno',
        onboardingCompleted: true,
      });
    });
  });
});
