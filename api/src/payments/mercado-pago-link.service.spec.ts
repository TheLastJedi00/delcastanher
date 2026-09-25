import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { MercadoPagoConnectionService } from './mercado-pago-connection.service';
import { MercadoPagoLinkService } from './mercado-pago-link.service';
import { MercadoPagoOAuthService, OAuthGrantError } from './mercado-pago-oauth.service';

const NOW = new Date('2026-09-25T12:00:00.000Z');
const HOUR = 60 * 60 * 1000;
const ADMIN = { id: 'uid-admin', email: 'admin@delcastanher.com' };
const FRONT = 'https://www.delcastanher.srv.br';

interface StateRow {
  id: string;
  state: string;
  codeVerifier: string;
  createdById: string;
  createdByEmail: string;
  expiresAt: Date;
  usedAt: Date | null;
}

function stateRow(overrides: Partial<StateRow> = {}): StateRow {
  return {
    id: 'st-1',
    state: 'estado-valido',
    codeVerifier: 'verifier-1',
    createdById: ADMIN.id,
    createdByEmail: ADMIN.email,
    expiresAt: new Date(NOW.getTime() + 20 * HOUR),
    usedAt: null,
    ...overrides,
  };
}

/** Banco em memoria para `mercado_pago_oauth_states`. */
function fakePrisma(states: StateRow[] = []) {
  const client = {
    states,
    mercadoPagoOAuthState: {
      create: jest.fn(async ({ data }: { data: Omit<StateRow, 'id' | 'usedAt'> }) => {
        const row = { id: `st-${states.length + 1}`, usedAt: null, ...data };
        states.push(row);

        return row;
      }),
      findUnique: jest.fn(async ({ where }: { where: { state: string } }) =>
        states.find((row) => row.state === where.state) ?? null,
      ),
      updateMany: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id?: string; usedAt: null; expiresAt?: { gt: Date } };
          data: Partial<StateRow>;
        }) => {
          const hit = states.filter(
            (row) =>
              (where.id === undefined || row.id === where.id) &&
              row.usedAt === null &&
              (!where.expiresAt || row.expiresAt > where.expiresAt.gt),
          );
          hit.forEach((row) => Object.assign(row, data));

          return { count: hit.length };
        },
      ),
      deleteMany: jest.fn(async ({ where }: { where: { expiresAt: { lt: Date } } }) => {
        const before = states.length;
        const kept = states.filter((row) => row.expiresAt >= where.expiresAt.lt);
        states.splice(0, states.length, ...kept);

        return { count: before - kept.length };
      }),
    },
    $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(client)),
  };

  return client;
}

const TOKENS = {
  accessToken: 'APP_USR-acesso',
  refreshToken: 'TG-refresh',
  mpUserId: '123',
  scope: 'offline_access read write',
  liveMode: true,
  expiresAt: new Date(NOW.getTime() + 180 * 24 * HOUR),
};

function build(options: { states?: StateRow[]; exchange?: jest.Mock } = {}) {
  const prisma = fakePrisma(options.states ?? []);
  const oauth = {
    pkcePair: jest.fn().mockReturnValue({ verifier: 'verifier-novo', challenge: 'desafio-novo' }),
    authorizationUrl: jest.fn(
      (state: string, challenge: string) =>
        `https://auth.mercadopago.com/authorization?state=${state}&code_challenge=${challenge}`,
    ),
    exchangeCode: options.exchange ?? jest.fn().mockResolvedValue(TOKENS),
    fetchAccount: jest.fn().mockResolvedValue({ nickname: 'LIDIANE', email: 'l@exemplo.com' }),
  };
  const connections = { connect: jest.fn().mockResolvedValue({ id: 'conn-1' }) };
  const config = { get: jest.fn((name: string) => (name === 'FRONTEND_URL' ? FRONT : undefined)) };

  const service = new MercadoPagoLinkService(
    prisma as unknown as PrismaService,
    oauth as unknown as MercadoPagoOAuthService,
    connections as unknown as MercadoPagoConnectionService,
    config as unknown as ConfigService,
  );

  return { service, prisma, oauth, connections };
}

describe('MercadoPagoLinkService (Spec 020, decisao 5)', () => {
  describe('gerar link', () => {
    it('grava state, verifier, autor e validade de 24 horas', async () => {
      const { service, prisma } = build();

      const link = await service.createLink(ADMIN, NOW);

      const saved = prisma.states[0];
      expect(saved.state).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(saved).toMatchObject({
        codeVerifier: 'verifier-novo',
        createdById: ADMIN.id,
        createdByEmail: ADMIN.email,
        expiresAt: new Date(NOW.getTime() + 24 * HOUR),
      });
      expect(link).toEqual({
        url: `https://auth.mercadopago.com/authorization?state=${saved.state}&code_challenge=desafio-novo`,
        expiresAt: new Date(NOW.getTime() + 24 * HOUR).toISOString(),
      });
    });

    it('nao devolve o verifier na resposta', async () => {
      const { service } = build();

      const link = await service.createLink(ADMIN, NOW);

      expect(JSON.stringify(link)).not.toContain('verifier-novo');
    });

    // Um link esquecido num chat nao pode continuar valendo depois de o admin
    // gerar outro.
    it('invalida os links anteriores ainda nao usados', async () => {
      const { service, prisma } = build({ states: [stateRow()] });

      await service.createLink(ADMIN, NOW);

      expect(prisma.states[0].expiresAt).toEqual(NOW);
      expect(prisma.states[1].expiresAt).toEqual(new Date(NOW.getTime() + 24 * HOUR));
    });

    it('apaga estados vencidos ha mais de 7 dias na limpeza', async () => {
      const { service, prisma } = build({
        states: [
          stateRow({ id: 'velho', state: 'a', expiresAt: new Date(NOW.getTime() - 8 * 24 * HOUR) }),
          stateRow({ id: 'recente', state: 'b', expiresAt: new Date(NOW.getTime() - 2 * 24 * HOUR) }),
        ],
      });

      await expect(service.purgeStates(NOW)).resolves.toBe(1);
      expect(prisma.states.map((row) => row.id)).toEqual(['recente']);
    });
  });

  describe('retorno do Mercado Pago', () => {
    const result = (query: string) => `${FRONT}/conexao-mercado-pago?${query}`;

    it('conecta, consome o state e manda para a pagina de sucesso', async () => {
      const { service, prisma, oauth, connections } = build({ states: [stateRow()] });

      const redirect = await service.complete({ code: 'TG-code', state: 'estado-valido' }, NOW);

      expect(oauth.exchangeCode).toHaveBeenCalledWith('TG-code', 'verifier-1', NOW);
      expect(connections.connect).toHaveBeenCalledWith(
        TOKENS,
        { nickname: 'LIDIANE', email: 'l@exemplo.com' },
        { id: ADMIN.id, email: ADMIN.email },
        NOW,
        prisma,
      );
      expect(prisma.states[0].usedAt).toEqual(NOW);
      expect(redirect).toBe(result('resultado=ok'));
    });

    it('state inexistente vira "expirado", sem chamar o Mercado Pago', async () => {
      const { service, oauth } = build();

      await expect(service.complete({ code: 'TG-code', state: 'inventado' }, NOW)).resolves.toBe(
        result('resultado=erro&motivo=expirado'),
      );
      expect(oauth.exchangeCode).not.toHaveBeenCalled();
    });

    it('state vencido vira "expirado", sem chamar o Mercado Pago', async () => {
      const { service, oauth } = build({ states: [stateRow({ expiresAt: new Date(NOW.getTime() - 1) })] });

      await expect(service.complete({ code: 'TG-code', state: 'estado-valido' }, NOW)).resolves.toBe(
        result('resultado=erro&motivo=expirado'),
      );
      expect(oauth.exchangeCode).not.toHaveBeenCalled();
    });

    it('state ja usado vira "usado", sem chamar o Mercado Pago', async () => {
      const { service, oauth } = build({ states: [stateRow({ usedAt: new Date(NOW.getTime() - HOUR) })] });

      await expect(service.complete({ code: 'TG-code', state: 'estado-valido' }, NOW)).resolves.toBe(
        result('resultado=erro&motivo=usado'),
      );
      expect(oauth.exchangeCode).not.toHaveBeenCalled();
    });

    it('conecta uma vez so com o mesmo state duas vezes', async () => {
      const { service, connections } = build({ states: [stateRow()] });

      await service.complete({ code: 'TG-code', state: 'estado-valido' }, NOW);
      const second = await service.complete({ code: 'TG-code', state: 'estado-valido' }, NOW);

      expect(connections.connect).toHaveBeenCalledTimes(1);
      expect(second).toBe(result('resultado=erro&motivo=usado'));
    });

    // Dois retornos quase simultaneos: os dois passam pela leitura do state,
    // mas so um consegue marca-lo como usado dentro da transacao.
    it('recusa quem perde a corrida pelo state', async () => {
      const { service, prisma, connections } = build({ states: [stateRow()] });
      prisma.mercadoPagoOAuthState.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(service.complete({ code: 'TG-code', state: 'estado-valido' }, NOW)).resolves.toBe(
        result('resultado=erro&motivo=usado'),
      );
      expect(connections.connect).not.toHaveBeenCalled();
    });

    it('vendedor que nega a autorizacao vira "negado"', async () => {
      const { service, oauth } = build({ states: [stateRow()] });

      await expect(
        service.complete({ error: 'access_denied', state: 'estado-valido' }, NOW),
      ).resolves.toBe(result('resultado=erro&motivo=negado'));
      expect(oauth.exchangeCode).not.toHaveBeenCalled();
    });

    // Sem offline_access nao ha renovacao: melhor falhar na conexao do que
    // fechar a loja 180 dias depois (decisao 8).
    it('recusa token sem offline_access', async () => {
      const { service, connections } = build({
        states: [stateRow()],
        exchange: jest.fn().mockResolvedValue({ ...TOKENS, scope: 'read write' }),
      });

      await expect(service.complete({ code: 'TG-code', state: 'estado-valido' }, NOW)).resolves.toBe(
        result('resultado=erro&motivo=sem_offline_access'),
      );
      expect(connections.connect).not.toHaveBeenCalled();
    });

    it('falha na troca vira "falha", sem a mensagem do Mercado Pago na URL', async () => {
      const { service, connections } = build({
        states: [stateRow()],
        exchange: jest.fn().mockRejectedValue(new OAuthGrantError('invalid_grant')),
      });

      const redirect = await service.complete({ code: 'TG-code', state: 'estado-valido' }, NOW);

      expect(redirect).toBe(result('resultado=erro&motivo=falha'));
      expect(redirect).not.toContain('invalid_grant');
      expect(connections.connect).not.toHaveBeenCalled();
    });

    it('retorno sem code vira "falha"', async () => {
      const { service } = build({ states: [stateRow()] });

      await expect(service.complete({ state: 'estado-valido' }, NOW)).resolves.toBe(
        result('resultado=erro&motivo=falha'),
      );
    });
  });
});
