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

const FIREBASE_ADMIN: AuthUser = { ...FIREBASE_USER, uid: 'uid-admin', role: 'admin' };

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
        update: { email: 'aluno@delcastanher.com', role: 'aluno', lastSeenAt: expect.any(Date) },
        create: {
          id: 'uid-123',
          email: 'aluno@delcastanher.com',
          name: 'Aluno do Firebase',
          role: 'aluno',
          lastSeenAt: expect.any(Date),
        },
      });
    });

    // Spec 013, decisao 3: a coluna e espelho de leitura do custom claim, que
    // continua sendo a fonte da autorizacao. Quem entra com claim de admin
    // precisa aparecer como admin na listagem do painel.
    it('espelha o papel admin vindo do custom claim do token', async () => {
      const { service, upsert } = await build(jest.fn().mockResolvedValue({ id: 'uid-admin' }));

      await service.findOrCreate(FIREBASE_ADMIN);

      expect(upsert.mock.calls[0][0].update.role).toBe('admin');
      expect(upsert.mock.calls[0][0].create.role).toBe('admin');
    });

    // Spec 013, decisao 4: o claim pode ser trocado fora do painel (console do
    // Firebase, `npm run role`). O espelho converge na entrada seguinte, sem
    // job de sincronizacao.
    it('reconcilia o espelho quando o claim muda fora do painel', async () => {
      const { service, upsert } = await build(jest.fn().mockResolvedValue({ id: 'uid-123' }));

      await service.findOrCreate({ ...FIREBASE_USER, role: 'admin' });
      await service.findOrCreate(FIREBASE_USER);

      expect(upsert.mock.calls[0][0].update.role).toBe('admin');
      expect(upsert.mock.calls[1][0].update.role).toBe('aluno');
    });

    // Spec 013, decisao 5: `GET /users/me` e o evento "a pessoa abriu a
    // plataforma" — e o unico lugar onde o carimbo e escrito.
    it('carimba lastSeenAt na entrada, avancando a cada acesso', async () => {
      const { service, upsert } = await build(jest.fn().mockResolvedValue({ id: 'uid-123' }));
      const before = Date.now();

      await service.findOrCreate(FIREBASE_USER);

      const seen = upsert.mock.calls[0][0].update.lastSeenAt as Date;

      expect(seen.getTime()).toBeGreaterThanOrEqual(before);
      expect(seen.getTime()).toBeLessThanOrEqual(Date.now());
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

    // O papel nao entra no `update` do perfil: quem edita bio e telefone nao
    // deve poder mexer, nem por acidente, na coluna que o painel lista.
    it('nao toca no papel nem no carimbo ao gravar o perfil', async () => {
      const { service, upsert } = await build(jest.fn().mockResolvedValue({ id: 'uid-123' }));

      await service.update(FIREBASE_USER, ONBOARDING);

      expect(upsert.mock.calls[0][0].update).not.toHaveProperty('role');
      expect(upsert.mock.calls[0][0].update).not.toHaveProperty('lastSeenAt');
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
