import { BadRequestException } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { LegalDocumentsService, nextPolicyVersion } from './legal-documents.service';
import type { LegalDocumentKind, LegalVersionRow } from './legal.types';

const ADMIN: AuthUser = {
  uid: 'uid-admin',
  email: 'lidiane@delcastanher.srv.br',
  name: 'Lidiane',
  role: 'admin',
};

/** 28/09/2026 as 22h de Brasilia: ja e dia 29 em UTC. */
const NOW = new Date('2026-09-29T01:00:00.000Z');

function version(
  kind: LegalDocumentKind,
  policyVersion: string,
  publishedAt: string,
  extra: Partial<LegalVersionRow> = {},
): LegalVersionRow {
  return {
    id: `${kind}-${policyVersion}-${publishedAt}`,
    kind,
    content: `## ${kind}\n\nTexto ${policyVersion}.`,
    policyVersion,
    changeKind: 'INITIAL',
    publishedAt: new Date(publishedAt),
    publishedById: null,
    publishedByEmail: null,
    ...extra,
  };
}

type DraftRow = {
  kind: LegalDocumentKind;
  content: string;
  updatedAt: Date;
  updatedById: string;
  updatedByEmail: string;
};

/**
 * Banco em memoria com o que o servico usa. As versoes so crescem: o double
 * nem tem `update` ou `delete` de versao, e e isso que a decisao 2 exige.
 */
function fakePrisma(initial: { versions?: LegalVersionRow[]; drafts?: DraftRow[] } = {}) {
  const versions = [...(initial.versions ?? [])];
  const drafts = new Map((initial.drafts ?? []).map((draft) => [draft.kind, draft]));

  const latestFirst = () =>
    [...versions].sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());

  const client = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    legalDocumentVersion: {
      findFirst: jest.fn(async (args?: { where?: { kind?: LegalDocumentKind } }) => {
        const kind = args?.where?.kind;

        return latestFirst().find((row) => !kind || row.kind === kind) ?? null;
      }),
      findMany: jest.fn(async (args?: { where?: { kind?: LegalDocumentKind } }) => {
        const kind = args?.where?.kind;

        return latestFirst().filter((row) => !kind || row.kind === kind);
      }),
      create: jest.fn(async ({ data }: { data: Omit<LegalVersionRow, 'id' | 'publishedAt'> & { publishedAt?: Date } }) => {
        const row: LegalVersionRow = {
          id: `v${versions.length + 1}`,
          publishedAt: data.publishedAt ?? NOW,
          publishedById: null,
          publishedByEmail: null,
          ...data,
        } as LegalVersionRow;
        versions.push(row);

        return row;
      }),
    },
    legalDocumentDraft: {
      findUnique: jest.fn(async ({ where }: { where: { kind: LegalDocumentKind } }) => drafts.get(where.kind) ?? null),
      findMany: jest.fn(async () => [...drafts.values()]),
      upsert: jest.fn(
        async ({ where, create }: { where: { kind: LegalDocumentKind }; create: Omit<DraftRow, 'updatedAt'> }) => {
          const row = { ...create, updatedAt: NOW };
          drafts.set(where.kind, row);

          return row;
        },
      ),
      deleteMany: jest.fn(async ({ where }: { where: { kind: LegalDocumentKind } }) => {
        const count = drafts.delete(where.kind) ? 1 : 0;

        return { count };
      }),
    },
  };

  // A trava do banco, simulada: o `$queryRaw` de uma transacao espera a
  // anterior terminar. Sem ele, duas publicacoes leem a mesma ultima versao.
  let tail = Promise.resolve();

  const $transaction = jest.fn(async (fn: (tx: typeof client) => unknown) => {
    let release = () => undefined as void;
    let held = false;

    const tx = {
      ...client,
      $queryRaw: jest.fn(async (...args: unknown[]) => {
        const previous = tail;
        tail = new Promise<void>((resolve) => (release = resolve));
        held = true;
        await previous;

        return client.$queryRaw(...args);
      }),
    };

    try {
      return await fn(tx);
    } finally {
      if (held) {
        release();
      }
    }
  });

  return { ...client, $transaction, versions, drafts };
}

function build(initial?: Parameters<typeof fakePrisma>[0]) {
  const prisma = fakePrisma(initial);
  const service = new LegalDocumentsService(prisma as unknown as PrismaService);

  return { prisma, service };
}

/** Carga inicial (decisao 10): Privacidade e Cookies publicadas, Termos nao. */
const INITIAL = [
  version('PRIVACY', '2026-09-13', '2026-09-13T12:00:00.000Z'),
  version('COOKIES', '2026-09-13', '2026-09-13T12:00:00.000Z'),
];

function draft(kind: LegalDocumentKind, content = '## Titulo\n\nTexto novo.'): DraftRow {
  return { kind, content, updatedAt: NOW, updatedById: ADMIN.uid, updatedByEmail: ADMIN.email };
}

/** Spec 022, decisoes 2 e 3. */
describe('LegalDocumentsService', () => {
  describe('vigente', () => {
    it('devolve a ultima versao publicada de cada documento', async () => {
      const { service } = build({
        versions: [
          ...INITIAL,
          version('PRIVACY', '2026-09-13', '2026-09-20T12:00:00.000Z', { changeKind: 'CORRECTION' }),
        ],
      });

      const current = await service.current('PRIVACY');

      expect(current?.publishedAt).toEqual(new Date('2026-09-20T12:00:00.000Z'));
      expect(current?.changeKind).toBe('CORRECTION');
    });

    it('devolve nulo para os Termos sem publicacao', async () => {
      const { service } = build({ versions: INITIAL });

      await expect(service.current('TERMS')).resolves.toBeNull();
    });

    it('a versao da politica e a da ultima publicacao de qualquer documento', async () => {
      const { service } = build({
        versions: [...INITIAL, version('TERMS', '2026-09-28', '2026-09-28T15:00:00.000Z')],
      });

      await expect(service.policyVersion()).resolves.toBe('2026-09-28');
    });

    it('sem publicacao nenhuma, a versao da politica e nula', async () => {
      const { service } = build();

      await expect(service.policyVersion()).resolves.toBeNull();
    });
  });

  describe('rascunho', () => {
    it('salva com o autor do token', async () => {
      const { service, prisma } = build({ versions: INITIAL });

      await service.saveDraft(ADMIN, 'PRIVACY', 'Texto novo.');

      expect(prisma.drafts.get('PRIVACY')).toEqual(
        expect.objectContaining({
          content: 'Texto novo.',
          updatedById: ADMIN.uid,
          updatedByEmail: ADMIN.email,
        }),
      );
    });

    it('sobrescreve o rascunho anterior: ha um so por documento', async () => {
      const { service, prisma } = build({ versions: INITIAL });

      await service.saveDraft(ADMIN, 'PRIVACY', 'Primeiro.');
      await service.saveDraft(ADMIN, 'PRIVACY', 'Segundo.');

      expect(prisma.drafts.size).toBe(1);
      expect(prisma.drafts.get('PRIVACY')?.content).toBe('Segundo.');
    });

    it('descarta o rascunho sem tocar na versao publicada', async () => {
      const { service, prisma } = build({ versions: INITIAL, drafts: [draft('PRIVACY')] });

      await service.discardDraft('PRIVACY');

      expect(prisma.drafts.has('PRIVACY')).toBe(false);
      expect(prisma.versions).toHaveLength(2);
    });
  });

  describe('publicacao', () => {
    it('nova versao usa a data do dia em Brasilia, com o autor do token', async () => {
      const { service, prisma } = build({ versions: INITIAL, drafts: [draft('PRIVACY')] });

      const published = await service.publish(ADMIN, 'PRIVACY', 'NEW_VERSION', NOW);

      expect(published.policyVersion).toBe('2026-09-28');
      expect(published.changeKind).toBe('NEW_VERSION');
      expect(published.publishedByEmail).toBe(ADMIN.email);
      // O UID fica gravado, mas nao sai na resposta do painel.
      expect(prisma.versions.at(-1)?.publishedById).toBe(ADMIN.uid);
      expect(published).not.toHaveProperty('publishedById');
    });

    it('a segunda nova versao do mesmo dia ganha o sufixo .2, e a terceira .3', async () => {
      const { service } = build({
        versions: [
          ...INITIAL,
          version('PRIVACY', '2026-09-28', '2026-09-28T13:00:00.000Z', { changeKind: 'NEW_VERSION' }),
        ],
        drafts: [draft('COOKIES')],
      });

      const segunda = await service.publish(ADMIN, 'COOKIES', 'NEW_VERSION', NOW);
      expect(segunda.policyVersion).toBe('2026-09-28.2');

      await service.saveDraft(ADMIN, 'PRIVACY', 'Outra.');
      const terceira = await service.publish(ADMIN, 'PRIVACY', 'NEW_VERSION', NOW);
      expect(terceira.policyVersion).toBe('2026-09-28.3');
    });

    it('correcao repete a versao vigente', async () => {
      const { service } = build({ versions: INITIAL, drafts: [draft('PRIVACY')] });

      const published = await service.publish(ADMIN, 'PRIVACY', 'CORRECTION', NOW);

      expect(published.policyVersion).toBe('2026-09-13');
      expect(published.changeKind).toBe('CORRECTION');
    });

    it('a primeira publicacao dos Termos e sempre nova versao', async () => {
      const { service } = build({ versions: INITIAL, drafts: [draft('TERMS')] });

      const published = await service.publish(ADMIN, 'TERMS', 'CORRECTION', NOW);

      expect(published.changeKind).toBe('NEW_VERSION');
      expect(published.policyVersion).toBe('2026-09-28');
    });

    it('publica o conteudo do rascunho e apaga o rascunho', async () => {
      const { service, prisma } = build({
        versions: INITIAL,
        drafts: [draft('PRIVACY', '## 1. Objetivo\n\nTexto corrigido.')],
      });

      const published = await service.publish(ADMIN, 'PRIVACY', 'CORRECTION', NOW);

      expect(published.content).toBe('## 1. Objetivo\n\nTexto corrigido.');
      expect(prisma.drafts.has('PRIVACY')).toBe(false);
    });

    it('recusa sem rascunho', async () => {
      const { service } = build({ versions: INITIAL });

      await expect(service.publish(ADMIN, 'PRIVACY', 'CORRECTION', NOW)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('recusa rascunho vazio', async () => {
      const { service, prisma } = build({ versions: INITIAL, drafts: [draft('PRIVACY', '  \n\n ')] });

      await expect(service.publish(ADMIN, 'PRIVACY', 'NEW_VERSION', NOW)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.versions).toHaveLength(2);
    });

    it('trava a leitura da ultima versao dentro da transacao', async () => {
      const { service, prisma } = build({ versions: INITIAL, drafts: [draft('PRIVACY')] });

      await service.publish(ADMIN, 'PRIVACY', 'NEW_VERSION', NOW);

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.$queryRaw).toHaveBeenCalled();
      // A trava vem antes da leitura que calcula a versao.
      expect(prisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.legalDocumentVersion.findFirst.mock.invocationCallOrder[0],
      );
    });

    it('duas publicacoes em sequencia no mesmo dia nao repetem a versao', async () => {
      const { service } = build({
        versions: INITIAL,
        drafts: [draft('PRIVACY'), draft('COOKIES')],
      });

      const [a, b] = await Promise.all([
        service.publish(ADMIN, 'PRIVACY', 'NEW_VERSION', NOW),
        service.publish(ADMIN, 'COOKIES', 'NEW_VERSION', NOW),
      ]);

      expect(new Set([a.policyVersion, b.policyVersion]).size).toBe(2);
    });
  });

  describe('painel', () => {
    it('lista os tres documentos, com vigente, rascunho e a versao da politica', async () => {
      const { service } = build({ versions: INITIAL, drafts: [draft('COOKIES')] });

      const result = await service.adminList();

      expect(result.policyVersion).toBe('2026-09-13');
      expect(result.documents.map((doc) => doc.kind)).toEqual(['TERMS', 'PRIVACY', 'COOKIES']);
      expect(result.documents[0]).toEqual({ kind: 'TERMS', current: null, draft: null });
      expect(result.documents[1].current?.policyVersion).toBe('2026-09-13');
      expect(result.documents[2].draft?.updatedByEmail).toBe(ADMIN.email);
    });

    it('lista o historico da mais recente para a mais antiga', async () => {
      const { service } = build({
        versions: [
          ...INITIAL,
          version('PRIVACY', '2026-09-13', '2026-09-20T12:00:00.000Z', { changeKind: 'CORRECTION' }),
        ],
      });

      const history = await service.versions('PRIVACY');

      expect(history.map((row) => row.changeKind)).toEqual(['CORRECTION', 'INITIAL']);
    });
  });
});

describe('nextPolicyVersion', () => {
  it('usa a data quando a ultima versao e de outro dia', () => {
    expect(nextPolicyVersion('2026-09-13', '2026-09-28')).toBe('2026-09-28');
    expect(nextPolicyVersion(null, '2026-09-28')).toBe('2026-09-28');
  });

  it('acrescenta ou incrementa o sufixo no mesmo dia', () => {
    expect(nextPolicyVersion('2026-09-28', '2026-09-28')).toBe('2026-09-28.2');
    expect(nextPolicyVersion('2026-09-28.2', '2026-09-28')).toBe('2026-09-28.3');
    expect(nextPolicyVersion('2026-09-28.10', '2026-09-28')).toBe('2026-09-28.11');
  });
});
