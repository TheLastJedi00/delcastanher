import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MercadoPagoConnectionService } from './mercado-pago-connection.service';
import { MercadoPagoOAuthService, OAuthGrantError, OAuthTokens } from './mercado-pago-oauth.service';
import { TokenCipher } from './token-cipher';

const NOW = new Date('2026-09-25T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const ADMIN = { id: 'uid-admin', email: 'admin@delcastanher.com' };

interface Row {
  id: string;
  mpUserId: string;
  nickname: string | null;
  email: string | null;
  accessTokenEncrypted: string;
  refreshTokenEncrypted: string;
  scope: string;
  liveMode: boolean;
  expiresAt: Date;
  connectedAt: Date;
  connectedById: string;
  connectedByEmail: string;
  disconnectedAt: Date | null;
  disconnectReason: string | null;
  lastRefreshedAt: Date | null;
}

function tokens(overrides: Partial<OAuthTokens> = {}): OAuthTokens {
  return {
    accessToken: 'APP_USR-acesso-1',
    refreshToken: 'TG-refresh-1',
    mpUserId: '123',
    scope: 'offline_access read write',
    liveMode: true,
    expiresAt: new Date(NOW.getTime() + 180 * DAY),
    ...overrides,
  };
}

function matches(row: Row, where: Record<string, unknown> = {}): boolean {
  return Object.entries(where).every(([key, value]) => row[key as keyof Row] === value);
}

/**
 * Banco em memoria com as operacoes que o servico usa. O `$transaction`
 * serializa as chamadas numa fila — e o efeito do `SELECT … FOR UPDATE` que
 * importa aqui: a segunda renovacao so le a linha depois de a primeira gravar.
 */
function fakePrisma(rows: Row[] = []) {
  let queue: Promise<unknown> = Promise.resolve();
  let sequence = rows.length;

  const client = {
    rows,
    $queryRaw: jest.fn().mockResolvedValue([]),
    mercadoPagoConnection: {
      findFirst: jest.fn(
        async ({ where, orderBy }: { where?: Record<string, unknown>; orderBy?: unknown }) => {
          const found = rows.filter((row) => matches(row, where));

          if (orderBy) {
            found.sort((a, b) => b.connectedAt.getTime() - a.connectedAt.getTime());
          }

          return found[0] ?? null;
        },
      ),
      findMany: jest.fn(async ({ where }: { where?: Record<string, unknown> }) =>
        rows.filter((row) => matches(row, where)),
      ),
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) =>
        rows.find((row) => row.id === where.id) ?? null,
      ),
      create: jest.fn(async ({ data }: { data: Partial<Row> }) => {
        const row = {
          id: `conn-${++sequence}`,
          nickname: null,
          email: null,
          connectedAt: NOW,
          disconnectedAt: null,
          disconnectReason: null,
          lastRefreshedAt: null,
          ...data,
        } as Row;

        // O indice unico parcial da migration: uma ativa por ambiente.
        if (rows.some((other) => !other.disconnectedAt && other.liveMode === row.liveMode)) {
          throw new Error('unique violation: mercado_pago_connections_single_active');
        }

        rows.push(row);

        return row;
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
        const row = rows.find((candidate) => candidate.id === where.id) as Row;
        Object.assign(row, data);

        return row;
      }),
      updateMany: jest.fn(
        async ({ where, data }: { where: Record<string, unknown>; data: Partial<Row> }) => {
          const hit = rows.filter((row) => matches(row, where));
          hit.forEach((row) => Object.assign(row, data));

          return { count: hit.length };
        },
      ),
    },
    $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) => {
      const run = queue.then(() => fn(client));
      queue = run.catch(() => undefined);

      return run;
    }),
  };

  return client;
}

function build(options: { rows?: Row[]; sandbox?: boolean; refresh?: jest.Mock } = {}) {
  const key = randomBytes(32).toString('base64');
  const values: Record<string, string> = {
    MP_TOKEN_ENCRYPTION_KEY: key,
    MP_ACCESS_TOKEN: 'APP_USR-token-da-plataforma',
    MP_SANDBOX: options.sandbox ? 'true' : 'false',
  };
  const config = { get: jest.fn((name: string) => values[name]) } as unknown as ConfigService;
  const cipher = new TokenCipher(config);
  const prisma = fakePrisma(options.rows ?? []);
  const oauth = {
    refresh:
      options.refresh ??
      jest.fn().mockResolvedValue(
        tokens({ accessToken: 'APP_USR-acesso-2', refreshToken: 'TG-refresh-2' }),
      ),
  };

  const service = new MercadoPagoConnectionService(
    prisma as unknown as PrismaService,
    cipher,
    oauth as unknown as MercadoPagoOAuthService,
    config,
  );

  return { service, prisma, oauth, cipher };
}

/** Linha de conexao ja gravada, com os tokens cifrados pela chave do teste. */
function row(cipher: TokenCipher, overrides: Partial<Row> = {}): Row {
  return {
    id: 'conn-1',
    mpUserId: '123',
    nickname: 'LIDIANE',
    email: 'l@exemplo.com',
    accessTokenEncrypted: cipher.encrypt('APP_USR-acesso-1'),
    refreshTokenEncrypted: cipher.encrypt('TG-refresh-1'),
    scope: 'offline_access read write',
    liveMode: true,
    expiresAt: new Date(NOW.getTime() + 120 * DAY),
    connectedAt: new Date(NOW.getTime() - 60 * DAY),
    connectedById: ADMIN.id,
    connectedByEmail: ADMIN.email,
    disconnectedAt: null,
    disconnectReason: null,
    lastRefreshedAt: null,
    ...overrides,
  };
}

/** Monta o servico e ja grava linhas cifradas com a chave dele. */
function buildWith(make: (cipher: TokenCipher) => Row[], options: { sandbox?: boolean; refresh?: jest.Mock } = {}) {
  const built = build(options);
  make(built.cipher).forEach((entry) => built.prisma.rows.push(entry));

  return built;
}

describe('MercadoPagoConnectionService (Spec 020)', () => {
  describe('conectar (decisao 3)', () => {
    it('grava a conexao com os tokens cifrados, a conta e o autor', async () => {
      const { service, prisma, cipher } = build();

      await service.connect(tokens(), { nickname: 'LIDIANE', email: 'l@exemplo.com' }, ADMIN, NOW);

      const saved = prisma.rows[0];
      expect(saved).toMatchObject({
        mpUserId: '123',
        nickname: 'LIDIANE',
        email: 'l@exemplo.com',
        liveMode: true,
        connectedById: ADMIN.id,
        connectedByEmail: ADMIN.email,
        disconnectedAt: null,
      });
      expect(saved.accessTokenEncrypted).not.toContain('APP_USR-acesso-1');
      expect(cipher.decrypt(saved.accessTokenEncrypted)).toBe('APP_USR-acesso-1');
      expect(cipher.decrypt(saved.refreshTokenEncrypted)).toBe('TG-refresh-1');
    });

    it('desconecta a conta anterior do mesmo ambiente como substituida', async () => {
      const { service, prisma } = buildWith((cipher) => [row(cipher)]);

      await service.connect(tokens({ mpUserId: '999' }), { nickname: null, email: null }, ADMIN, NOW);

      expect(prisma.rows.find((entry) => entry.id === 'conn-1')).toMatchObject({
        disconnectedAt: NOW,
        disconnectReason: 'replaced',
      });
      expect(prisma.rows.filter((entry) => !entry.disconnectedAt)).toHaveLength(1);
    });

    // Decisao 13: preview e producao dividem o banco. Conectar o vendedor de
    // teste no preview nao pode derrubar o recebedor de producao.
    it('nao toca na conexao do outro ambiente', async () => {
      const { service, prisma } = buildWith((cipher) => [row(cipher, { liveMode: true })], {
        sandbox: true,
      });

      await service.connect(tokens({ liveMode: false }), { nickname: null, email: null }, ADMIN, NOW);

      expect(prisma.rows.find((entry) => entry.id === 'conn-1')?.disconnectedAt).toBeNull();
      expect(prisma.rows.filter((entry) => !entry.disconnectedAt)).toHaveLength(2);
    });

    // O ambiente e o da branch, e nao o que o token declara: a conexao feita no
    // preview e sempre a do preview.
    it('grava o ambiente de onde a conexao foi feita', async () => {
      const { service, prisma } = build({ sandbox: true });

      await service.connect(tokens({ liveMode: true }), { nickname: null, email: null }, ADMIN, NOW);

      expect(prisma.rows[0].liveMode).toBe(false);
    });
  });

  describe('credencial para uma order nova (decisao 7)', () => {
    it('devolve o token em claro e o id da conexao ativa do ambiente', async () => {
      const { service } = buildWith((cipher) => [row(cipher)]);

      await expect(service.activeCredential(NOW)).resolves.toEqual({
        connectionId: 'conn-1',
        accessToken: 'APP_USR-acesso-1',
      });
    });

    it('devolve nulo sem conexao ativa', async () => {
      const { service } = buildWith((cipher) => [
        row(cipher, { disconnectedAt: NOW, disconnectReason: 'manual' }),
      ]);

      await expect(service.activeCredential(NOW)).resolves.toBeNull();
    });

    it('ignora a conexao do outro ambiente', async () => {
      const { service } = buildWith((cipher) => [row(cipher, { liveMode: false })]);

      await expect(service.activeCredential(NOW)).resolves.toBeNull();
    });

    it('abre a loja so com conta ativa e token no prazo, sem renovar', async () => {
      const valid = buildWith((cipher) => [row(cipher)]);
      await expect(valid.service.hasActive(NOW)).resolves.toBe(true);

      const expired = buildWith((cipher) => [row(cipher, { expiresAt: new Date(NOW.getTime() - DAY) })]);
      await expect(expired.service.hasActive(NOW)).resolves.toBe(false);
      expect(expired.oauth.refresh).not.toHaveBeenCalled();

      await expect(build().service.hasActive(NOW)).resolves.toBe(false);
    });
  });

  describe('credencial para consultar um pedido (decisao 6)', () => {
    it('usa o token da conexao do pedido, mesmo desconectada', async () => {
      const { service } = buildWith((cipher) => [
        row(cipher, { disconnectedAt: NOW, disconnectReason: 'replaced' }),
      ]);

      await expect(service.accessTokenFor('conn-1', NOW)).resolves.toBe('APP_USR-acesso-1');
    });

    it('usa o token da plataforma no pedido anterior a Spec 020', async () => {
      const { service } = build();

      await expect(service.accessTokenFor(null, NOW)).resolves.toBe('APP_USR-token-da-plataforma');
    });
  });

  describe('renovacao (decisao 8)', () => {
    it('nao renova com mais de 30 dias de validade', async () => {
      const { service, oauth } = buildWith((cipher) => [row(cipher)]);

      await service.activeCredential(NOW);

      expect(oauth.refresh).not.toHaveBeenCalled();
    });

    it('renova na janela de 30 dias e grava o par novo', async () => {
      const { service, oauth, prisma, cipher } = buildWith((c) => [
        row(c, { expiresAt: new Date(NOW.getTime() + 10 * DAY) }),
      ]);

      const credential = await service.activeCredential(NOW);

      expect(oauth.refresh).toHaveBeenCalledWith('TG-refresh-1', NOW);
      expect(credential?.accessToken).toBe('APP_USR-acesso-2');
      expect(cipher.decrypt(prisma.rows[0].refreshTokenEncrypted)).toBe('TG-refresh-2');
      expect(prisma.rows[0].lastRefreshedAt).toEqual(NOW);
    });

    // O refresh_token troca a cada uso: duas renovacoes com o mesmo token
    // fariam a segunda falhar e poderiam perder o par novo.
    it('renova uma vez so com duas chamadas simultaneas', async () => {
      const { service, oauth } = buildWith((cipher) => [
        row(cipher, { expiresAt: new Date(NOW.getTime() + 10 * DAY) }),
      ]);

      const [first, second] = await Promise.all([
        service.activeCredential(NOW),
        service.activeCredential(NOW),
      ]);

      expect(oauth.refresh).toHaveBeenCalledTimes(1);
      expect(first?.accessToken).toBe('APP_USR-acesso-2');
      expect(second?.accessToken).toBe('APP_USR-acesso-2');
    });

    it('desconecta como revogada quando o Mercado Pago recusa a renovacao', async () => {
      const { service, prisma } = buildWith(
        (cipher) => [row(cipher, { expiresAt: new Date(NOW.getTime() + 10 * DAY) })],
        { refresh: jest.fn().mockRejectedValue(new OAuthGrantError('invalid_grant')) },
      );

      await expect(service.activeCredential(NOW)).resolves.toBeNull();
      expect(prisma.rows[0]).toMatchObject({ disconnectedAt: NOW, disconnectReason: 'revoked' });
    });

    // Rede fora do ar nao e revogacao: o token atual ainda vale, e a loja nao
    // fecha por um soluco do Mercado Pago.
    it('continua com o token atual se a renovacao falhar por rede', async () => {
      const { service, prisma } = buildWith(
        (cipher) => [row(cipher, { expiresAt: new Date(NOW.getTime() + 10 * DAY) })],
        { refresh: jest.fn().mockRejectedValue(new Error('ECONNRESET')) },
      );

      await expect(service.activeCredential(NOW)).resolves.toEqual({
        connectionId: 'conn-1',
        accessToken: 'APP_USR-acesso-1',
      });
      expect(prisma.rows[0].disconnectedAt).toBeNull();
    });

    it('nao entrega token vencido', async () => {
      const { service } = buildWith(
        (cipher) => [row(cipher, { expiresAt: new Date(NOW.getTime() - DAY) })],
        { refresh: jest.fn().mockRejectedValue(new Error('ECONNRESET')) },
      );

      await expect(service.activeCredential(NOW)).resolves.toBeNull();
    });

    it('renova as conexoes ativas dos dois ambientes na rotina diaria', async () => {
      const { service, oauth } = buildWith((cipher) => [
        row(cipher, { id: 'conn-1', liveMode: true, expiresAt: new Date(NOW.getTime() + 5 * DAY) }),
        row(cipher, { id: 'conn-2', liveMode: false, expiresAt: new Date(NOW.getTime() + 5 * DAY) }),
        row(cipher, {
          id: 'conn-3',
          liveMode: true,
          disconnectedAt: NOW,
          expiresAt: new Date(NOW.getTime() + 5 * DAY),
        }),
      ]);

      await expect(service.refreshDue(NOW)).resolves.toEqual({ checked: 2 });
      expect(oauth.refresh).toHaveBeenCalledTimes(2);
    });
  });

  describe('desconectar e painel (decisao 12)', () => {
    it('desconecta a conexao ativa do ambiente como manual', async () => {
      const { service, prisma } = buildWith((cipher) => [row(cipher)]);

      await service.disconnect(NOW);

      expect(prisma.rows[0]).toMatchObject({ disconnectedAt: NOW, disconnectReason: 'manual' });
    });

    it('mostra a conta conectada sem nenhum token', async () => {
      const { service } = buildWith((cipher) => [row(cipher)]);

      const view = await service.view(NOW);

      expect(view).toMatchObject({
        status: 'connected',
        environment: 'production',
        account: { mpUserId: '123', nickname: 'LIDIANE', email: 'l@exemplo.com' },
        connectedByEmail: ADMIN.email,
        expiringSoon: false,
      });
      expect(JSON.stringify(view)).not.toMatch(/APP_USR|TG-refresh|v1\./);
    });

    it('mostra o motivo da ultima desconexao quando nao ha conta ativa', async () => {
      const { service } = buildWith((cipher) => [
        row(cipher, { disconnectedAt: NOW, disconnectReason: 'revoked' }),
      ]);

      await expect(service.view(NOW)).resolves.toMatchObject({
        status: 'revoked',
        account: { nickname: 'LIDIANE' },
      });
    });

    it('diz que nunca houve conexao no ambiente', async () => {
      const { service } = build();

      await expect(service.view(NOW)).resolves.toMatchObject({ status: 'never', account: null });
    });

    it('avisa com menos de 15 dias de validade', async () => {
      const { service } = buildWith((cipher) => [
        row(cipher, { expiresAt: new Date(NOW.getTime() + 10 * DAY) }),
      ]);

      await expect(service.view(NOW)).resolves.toMatchObject({ expiringSoon: true });
    });
  });
});
