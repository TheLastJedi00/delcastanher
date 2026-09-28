import { Test } from '@nestjs/testing';
import { AuthService } from '../auth/auth.service';
import { FirebaseService } from '../firebase/firebase.service';
import { PrismaService } from '../prisma/prisma.service';
import { AdminUsersService } from './users.admin.service';

/**
 * Adicionar administrador pelo painel (Spec 021). Uma rota por e-mail que
 * resolve conta nova e conta existente (decisao 1), na ordem conta -> claim ->
 * Postgres -> e-mail (decisao 4).
 */

interface Fake {
  /** Conta que o `ensureAccount` devolve. */
  account?: { uid: string; email?: string; disabled?: boolean; customClaims?: Record<string, unknown> };
  /** Se o `ensureAccount` acabou de criar a conta. */
  created?: boolean;
}

async function build(fake: Fake = {}) {
  const account = fake.account ?? { uid: 'uid-nova', email: 'nova@empresa.com', disabled: false };

  const auth = {
    ensureAccount: jest.fn().mockResolvedValue({ account, created: fake.created ?? true }),
    sendPasswordSetupEmail: jest.fn().mockResolvedValue({}),
  };
  const firebaseAuth = { setCustomUserClaims: jest.fn().mockResolvedValue(undefined) };
  const upsert = jest.fn().mockResolvedValue({});

  const moduleRef = await Test.createTestingModule({
    providers: [
      AdminUsersService,
      { provide: PrismaService, useValue: { user: { upsert } } },
      { provide: FirebaseService, useValue: { auth: firebaseAuth } },
      { provide: AuthService, useValue: auth },
    ],
  }).compile();

  return { service: moduleRef.get(AdminUsersService), auth, firebaseAuth, upsert };
}

describe('AdminUsersService.addAdmin', () => {
  describe('e-mail sem conta', () => {
    it('garante a conta pelo mesmo fluxo do "Criar nova conta"', async () => {
      const { service, auth } = await build();

      await service.addAdmin('nova@empresa.com');

      expect(auth.ensureAccount).toHaveBeenCalledWith('nova@empresa.com');
    });

    it('grava o claim admin na conta criada', async () => {
      const { service, firebaseAuth } = await build();

      await service.addAdmin('nova@empresa.com');

      expect(firebaseAuth.setCustomUserClaims).toHaveBeenCalledWith('uid-nova', { role: 'admin' });
    });

    it('cria a linha no Postgres como admin, sem nome e sem ultimo acesso (decisao 5)', async () => {
      const { service, upsert } = await build();

      await service.addAdmin('nova@empresa.com');

      expect(upsert).toHaveBeenCalledWith({
        where: { id: 'uid-nova' },
        update: { email: 'nova@empresa.com', role: 'admin' },
        create: { id: 'uid-nova', email: 'nova@empresa.com', role: 'admin' },
      });
    });

    it('envia o e-mail de definicao de senha por ultimo', async () => {
      const { service, auth, firebaseAuth, upsert } = await build();

      await service.addAdmin('nova@empresa.com');

      expect(auth.sendPasswordSetupEmail).toHaveBeenCalledWith('nova@empresa.com');
      const sent = auth.sendPasswordSetupEmail.mock.invocationCallOrder[0];
      expect(firebaseAuth.setCustomUserClaims.mock.invocationCallOrder[0]).toBeLessThan(sent);
      expect(upsert.mock.invocationCallOrder[0]).toBeLessThan(sent);
    });

    it('responde que a conta foi criada e o convite enviado', async () => {
      const { service } = await build();

      await expect(service.addAdmin('nova@empresa.com')).resolves.toEqual({
        userId: 'uid-nova',
        email: 'nova@empresa.com',
        outcome: 'created',
        inviteEmailSent: true,
      });
    });
  });

  describe('conta existente', () => {
    const ALUNA = {
      uid: 'uid-aluna',
      email: 'aluna@empresa.com',
      disabled: false,
      customClaims: { role: 'aluno', plano: 'pacote' },
    };

    it('promove preservando os claims que ja existiam', async () => {
      const { service, firebaseAuth } = await build({ account: ALUNA, created: false });

      await service.addAdmin('aluna@empresa.com');

      expect(firebaseAuth.setCustomUserClaims).toHaveBeenCalledWith('uid-aluna', {
        role: 'admin',
        plano: 'pacote',
      });
    });

    it('faz upsert no Postgres, cobrindo a conta que ainda nao tem linha no banco', async () => {
      const { service, upsert } = await build({ account: ALUNA, created: false });

      await service.addAdmin('aluna@empresa.com');

      expect(upsert).toHaveBeenCalledWith({
        where: { id: 'uid-aluna' },
        update: { email: 'aluna@empresa.com', role: 'admin' },
        create: { id: 'uid-aluna', email: 'aluna@empresa.com', role: 'admin' },
      });
    });

    it('nao envia e-mail de definicao de senha para quem ja tem senha (decisao 6)', async () => {
      const { service, auth } = await build({ account: ALUNA, created: false });

      const result = await service.addAdmin('aluna@empresa.com');

      expect(auth.sendPasswordSetupEmail).not.toHaveBeenCalled();
      expect(result).toEqual({
        userId: 'uid-aluna',
        email: 'aluna@empresa.com',
        outcome: 'promoted',
        inviteEmailSent: false,
      });
    });
  });

  describe('casos de borda', () => {
    it('quem ja e admin e no-op: nenhuma escrita no Firebase, so o espelho reconciliado (decisao 7)', async () => {
      const { service, firebaseAuth, upsert, auth } = await build({
        account: { uid: 'uid-adm', email: 'adm@empresa.com', customClaims: { role: 'admin' } },
        created: false,
      });

      const result = await service.addAdmin('adm@empresa.com');

      expect(firebaseAuth.setCustomUserClaims).not.toHaveBeenCalled();
      expect(auth.sendPasswordSetupEmail).not.toHaveBeenCalled();
      expect(upsert).toHaveBeenCalledTimes(1);
      expect(result.outcome).toBe('already-admin');
    });

    it('conta bloqueada recebe 409 sem tocar claim nem banco (decisao 8)', async () => {
      const { service, firebaseAuth, upsert } = await build({
        account: { uid: 'uid-bloq', email: 'bloq@empresa.com', disabled: true, customClaims: {} },
        created: false,
      });

      await expect(service.addAdmin('bloq@empresa.com')).rejects.toMatchObject({
        status: 409,
        message: expect.stringMatching(/bloqueada/i),
      });
      expect(firebaseAuth.setCustomUserClaims).not.toHaveBeenCalled();
      expect(upsert).not.toHaveBeenCalled();
    });

    it('falha do setCustomUserClaims nao grava o Postgres nem envia e-mail (decisao 4)', async () => {
      const { service, firebaseAuth, upsert, auth } = await build();
      firebaseAuth.setCustomUserClaims.mockRejectedValue(new Error('firebase fora'));

      await expect(service.addAdmin('nova@empresa.com')).rejects.toThrow('firebase fora');
      expect(upsert).not.toHaveBeenCalled();
      expect(auth.sendPasswordSetupEmail).not.toHaveBeenCalled();
    });

    it('falha so do envio do e-mail devolve sucesso com inviteEmailSent false (decisao 4)', async () => {
      const { service, auth, upsert } = await build();
      auth.sendPasswordSetupEmail.mockRejectedValue(new Error('smtp'));

      const result = await service.addAdmin('nova@empresa.com');

      expect(upsert).toHaveBeenCalled();
      expect(result).toMatchObject({ outcome: 'created', inviteEmailSent: false });
    });

    it('e-mail com maiusculas e espacos cai na mesma conta (decisao 9)', async () => {
      const { service, auth } = await build();

      const result = await service.addAdmin('  Nova@Empresa.COM ');

      expect(auth.ensureAccount).toHaveBeenCalledWith('nova@empresa.com');
      expect(result.email).toBe('nova@empresa.com');
    });
  });
});
