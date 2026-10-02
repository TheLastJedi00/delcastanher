import { Test } from '@nestjs/testing';
import { AuthUser } from '../auth/auth.types';
import { BatchResult, MailService } from '../mail/mail.service';
import { UnsubscribeService } from '../mail/unsubscribe.service';
import { PrismaService } from '../prisma/prisma.service';
import { CampaignsService } from './campaigns.service';

const ADMIN: AuthUser = { uid: 'uid-admin', email: 'admin@delcastanher.com', name: 'Admin', role: 'admin' };

const DRAFT = { segment: 'ALL_ACTIVE' as const, subject: 'Aula nova', body: 'Ola!\n\nVeja a aula nova.' };

interface Delivery {
  id: string;
  campaignId: string;
  userId: string;
  email: string;
  resendId: string | null;
  error: string | null;
  sentAt: Date | null;
}

function students(count: number) {
  return Array.from({ length: count }, (_, i) => ({ id: `uid-${i}`, email: `aluno${i}@exemplo.com` }));
}

/** Banco em memoria para campanha e entregas, no que o servico usa. */
function fakeDb(recipients: { id: string; email: string }[]) {
  const campaigns: Record<string, unknown>[] = [];
  const deliveries: Delivery[] = [];

  const prisma = {
    user: {
      count: jest.fn().mockResolvedValue(recipients.length),
      findMany: jest.fn().mockResolvedValue(recipients),
    },
    emailCampaign: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `cmp-${campaigns.length + 1}`, status: 'SENDING', createdAt: new Date(), finishedAt: null, ...data };

        campaigns.push(row);

        return row;
      }),
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) =>
        campaigns.find((row) => row.id === where.id) ?? null,
      ),
      findMany: jest.fn(async () => [...campaigns].reverse()),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = campaigns.find((c) => c.id === where.id) as Record<string, unknown>;

        Object.assign(row, data);

        return row;
      }),
    },
    emailDelivery: {
      createMany: jest.fn(async ({ data }: { data: Omit<Delivery, 'id' | 'resendId' | 'error' | 'sentAt'>[] }) => {
        data.forEach((row) =>
          deliveries.push({ id: `dlv-${deliveries.length + 1}`, resendId: null, error: null, sentAt: null, ...row }),
        );

        return { count: data.length };
      }),
      findMany: jest.fn(async ({ where }: { where: { campaignId: string; resendId: null } }) =>
        deliveries.filter((d) => d.campaignId === where.campaignId && d.resendId === null).map((d) => ({ ...d })),
      ),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Partial<Delivery> }) => {
        const row = deliveries.find((d) => d.id === where.id) as Delivery;

        Object.assign(row, data);

        return row;
      }),
      count: jest.fn(async ({ where }: { where: { campaignId: string; resendId?: unknown } }) =>
        deliveries.filter(
          (d) => d.campaignId === where.campaignId && (where.resendId === null ? d.resendId === null : true),
        ).length,
      ),
      // Duas perguntas, como o servico as faz: enviadas (`resendId` preenchido)
      // e com falha (sem `resendId`, com `error`).
      groupBy: jest.fn(async ({ where }: { where: { resendId: unknown } }) => {
        const sent = where.resendId !== null;
        const counts = new Map<string, number>();

        for (const d of deliveries) {
          const hit = sent ? d.resendId !== null : d.resendId === null && d.error !== null;

          if (hit) counts.set(d.campaignId, (counts.get(d.campaignId) ?? 0) + 1);
        }

        return [...counts.entries()].map(([campaignId, all]) => ({ campaignId, _count: { _all: all } }));
      }),
    },
    $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
  };

  return { prisma, campaigns, deliveries };
}

async function build(recipients = students(3)) {
  const db = fakeDb(recipients);

  const mail = {
    send: jest.fn().mockResolvedValue({ id: 're-teste' }),
    sendBatch: jest.fn(
      async (messages: unknown[], _keyOf?: (index: number) => string): Promise<BatchResult[]> =>
        messages.map((_, i) => ({ id: `re-${i}` })),
    ),
  };

  const unsubscribe = {
    linksFor: jest.fn((userId: string) => ({
      pageUrl: `https://www.delcastanher.srv.br/descadastro?token=t-${userId}`,
      oneClickUrl: `https://api.delcastanher.srv.br/email/unsubscribe?token=t-${userId}`,
    })),
  };

  const moduleRef = await Test.createTestingModule({
    providers: [
      CampaignsService,
      { provide: PrismaService, useValue: db.prisma },
      { provide: MailService, useValue: mail },
      { provide: UnsubscribeService, useValue: unsubscribe },
    ],
  }).compile();

  return { service: moduleRef.get(CampaignsService), mail, unsubscribe, ...db };
}

describe('CampaignsService', () => {
  describe('segments (decisao B2)', () => {
    it('devolve os tres segmentos com a contagem de destinatarios', async () => {
      const { service, prisma } = await build(students(7));

      const segments = await service.segments();

      expect(segments.map((s) => [s.id, s.count])).toEqual([
        ['ALL_ACTIVE', 7],
        ['INACTIVE_7D', 7],
        ['COMPLETED', 7],
      ]);
      expect(prisma.user.count).toHaveBeenCalledTimes(3);
      expect(prisma.user.count.mock.calls[0][0].where).toMatchObject({
        blockedAt: null,
        marketingOptOutAt: null,
        role: 'aluno',
      });
    });
  });

  describe('sendTest (decisao B4)', () => {
    it('manda so para o admin logado, com [TESTE] no assunto, e nao grava campanha', async () => {
      const { service, mail, prisma } = await build();

      await service.sendTest(ADMIN, DRAFT);

      expect(mail.send).toHaveBeenCalledTimes(1);
      expect(mail.send.mock.calls[0][0]).toMatchObject({
        to: 'admin@delcastanher.com',
        subject: '[TESTE] Aula nova',
      });
      expect(mail.sendBatch).not.toHaveBeenCalled();
      expect(prisma.emailCampaign.create).not.toHaveBeenCalled();
      expect(prisma.user.findMany).not.toHaveBeenCalled();
    });

    it('o teste sai com o layout e o rodape de descadastro, como a campanha', async () => {
      const { service, mail } = await build();

      await service.sendTest(ADMIN, DRAFT);

      expect(mail.send.mock.calls[0][0].html).toContain('Cancelar inscrição');
      expect(mail.send.mock.calls[0][0].text).toContain('Veja a aula nova.');
    });
  });

  describe('create — o disparo (decisao B4)', () => {
    it('grava a campanha com o autor e congela uma entrega por destinatario', async () => {
      const { service, campaigns, deliveries } = await build(students(3));

      await service.create(ADMIN, DRAFT);

      expect(campaigns[0]).toMatchObject({
        subject: 'Aula nova',
        segment: 'ALL_ACTIVE',
        createdById: 'uid-admin',
        createdByEmail: 'admin@delcastanher.com',
        recipientCount: 3,
      });
      expect(deliveries.map((d) => [d.userId, d.email])).toEqual([
        ['uid-0', 'aluno0@exemplo.com'],
        ['uid-1', 'aluno1@exemplo.com'],
        ['uid-2', 'aluno2@exemplo.com'],
      ]);
    });

    it('a lista vem do segmento calculado no servidor', async () => {
      const { service, prisma } = await build();

      await service.create(ADMIN, { ...DRAFT, segment: 'COMPLETED' });

      expect(prisma.user.findMany.mock.calls[0][0].where).toMatchObject({
        certificates: { some: { status: 'ACTIVE' } },
        marketingOptOutAt: null,
      });
    });

    it('envia pelo lote, e grava o id do Resend em cada entrega', async () => {
      const { service, mail, deliveries, campaigns } = await build(students(3));

      await service.create(ADMIN, DRAFT);

      expect(mail.sendBatch).toHaveBeenCalledTimes(1);
      expect(deliveries.map((d) => d.resendId)).toEqual(['re-0', 're-1', 're-2']);
      expect(deliveries.every((d) => d.sentAt instanceof Date)).toBe(true);
      expect(campaigns[0]).toMatchObject({ status: 'SENT', finishedAt: expect.any(Date) });
    });

    // Decisao B5: cada destinatario tem o proprio link e os cabecalhos.
    it('cada e-mail leva o link e os cabecalhos de descadastro do proprio aluno', async () => {
      const { service, mail } = await build(students(2));

      await service.create(ADMIN, DRAFT);

      const [messages] = mail.sendBatch.mock.calls[0] as unknown as [
        { to: string; html: string; headers: Record<string, string> }[],
      ];

      expect(messages[1].to).toBe('aluno1@exemplo.com');
      expect(messages[1].html).toContain('descadastro?token=t-uid-1');
      expect(messages[1].headers).toEqual({
        'List-Unsubscribe': '<https://api.delcastanher.srv.br/email/unsubscribe?token=t-uid-1>',
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      });
    });

    // Decisao B3: o corpo e texto, e sai escapado.
    it('o corpo com <script> sai escapado no HTML', async () => {
      const { service, mail } = await build(students(1));

      await service.create(ADMIN, { ...DRAFT, body: '<script>alert(1)</script>' });

      const [[message]] = mail.sendBatch.mock.calls[0] as unknown as [[{ html: string }]];

      expect(message.html).not.toContain('<script>');
      expect(message.html).toContain('&lt;script&gt;');
    });

    it('entrega que falhou fica sem id, com o erro, e a campanha fica PARTIAL', async () => {
      const { service, mail, deliveries, campaigns } = await build(students(3));

      mail.sendBatch.mockResolvedValueOnce([{ id: 're-0' }, { error: 'Resend respondeu 422' }, { id: 're-2' }]);

      await service.create(ADMIN, DRAFT);

      expect(deliveries[1]).toMatchObject({ resendId: null, error: 'Resend respondeu 422' });
      expect(campaigns[0].status).toBe('PARTIAL');
    });

    it('recusa o disparo para segmento sem ninguem', async () => {
      const { service, prisma } = await build([]);

      await expect(service.create(ADMIN, DRAFT)).rejects.toMatchObject({ status: 400 });
      expect(prisma.emailCampaign.create).not.toHaveBeenCalled();
    });

    it('usa uma chave de idempotencia por lote, ligada as entregas dele', async () => {
      const { service, mail } = await build(students(3));

      await service.create(ADMIN, DRAFT);

      const keyOf = mail.sendBatch.mock.calls[0][1] as unknown as (index: number) => string;

      expect(keyOf(0)).toMatch(/^campanha-cmp-1-/);
    });
  });

  describe('resume (decisao B4)', () => {
    it('retomar envia so as entregas sem resendId: ninguem recebe duas vezes', async () => {
      const { service, mail, deliveries, campaigns } = await build(students(3));

      mail.sendBatch.mockResolvedValueOnce([{ id: 're-a' }, { error: 'caiu' }, { error: 'caiu' }]);
      await service.create(ADMIN, DRAFT);

      mail.sendBatch.mockResolvedValueOnce([{ id: 're-b' }, { id: 're-c' }]);
      await service.resume('cmp-1');

      const [resent] = mail.sendBatch.mock.calls[1] as unknown as [{ to: string }[]];

      expect(resent.map((m) => m.to)).toEqual(['aluno1@exemplo.com', 'aluno2@exemplo.com']);
      expect(deliveries.map((d) => d.resendId)).toEqual(['re-a', 're-b', 're-c']);
      expect(campaigns[0].status).toBe('SENT');
    });

    it('retomar campanha sem pendencia nao envia nada', async () => {
      const { service, mail } = await build(students(2));

      await service.create(ADMIN, DRAFT);
      await service.resume('cmp-1');

      expect(mail.sendBatch).toHaveBeenCalledTimes(1);
    });

    it('campanha inexistente da 404', async () => {
      const { service } = await build();

      await expect(service.resume('cmp-x')).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('list — historico (decisao B6)', () => {
    it('lista com autor, segmento e totais de enviados e com falha', async () => {
      const { service, mail } = await build(students(3));

      mail.sendBatch.mockResolvedValueOnce([{ id: 're-0' }, { error: 'x' }, { id: 're-2' }]);
      await service.create(ADMIN, DRAFT);

      const [item] = await service.list();

      expect(item).toMatchObject({
        id: 'cmp-1',
        subject: 'Aula nova',
        segment: 'ALL_ACTIVE',
        createdByEmail: 'admin@delcastanher.com',
        status: 'PARTIAL',
        recipientCount: 3,
        sentCount: 2,
        failedCount: 1,
      });
    });
  });
});
