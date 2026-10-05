import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { AuthUser } from '../auth/auth.types';
import type { CampaignStatus, EmailSegment } from '../generated/prisma/client';
import { renderEmail, unsubscribeHeaders } from '../mail/email-content';
import { MailMessage, MailService, RESEND_BATCH_LIMIT } from '../mail/mail.service';
import { UnsubscribeService } from '../mail/unsubscribe.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CampaignDraftDto } from './dto/campaign.dto';
import { SEGMENTS, segmentWhere } from './segments';

/** Segmento com quantas pessoas recebem hoje (decisao B2). */
export interface SegmentView {
  id: EmailSegment;
  label: string;
  count: number;
}

/** Uma linha do historico (decisao B6). */
export interface CampaignView {
  id: string;
  subject: string;
  segment: EmailSegment;
  createdByEmail: string;
  status: CampaignStatus;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  createdAt: Date;
  finishedAt: Date | null;
}

/** Entrega pendente, como o envio a le. */
interface PendingDelivery {
  id: string;
  userId: string;
  email: string;
}

/**
 * Campanhas da aba "Disparos de E-mail" (Spec 023, Parte B).
 *
 * O disparo **congela** a lista: uma linha `EmailDelivery` por destinatario,
 * gravada antes do primeiro envio. Dai em diante, a verdade de "quem ja
 * recebeu" e o `resendId` de cada linha — e retomar envia so as sem id, para
 * que ninguem receba duas vezes (decisao B4).
 */
@Injectable()
export class CampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly unsubscribe: UnsubscribeService,
  ) {}

  /** Os tres segmentos, com a contagem que a confirmacao mostra. */
  async segments(now: Date = new Date()): Promise<SegmentView[]> {
    return Promise.all(
      SEGMENTS.map(async (segment) => ({
        ...segment,
        count: await this.prisma.user.count({ where: segmentWhere(segment.id, now) }),
      })),
    );
  }

  /** "Enviar teste": so para o admin logado, com `[TESTE]`, sem gravar nada. */
  async sendTest(admin: AuthUser, draft: CampaignDraftDto): Promise<{ sentTo: string }> {
    await this.mail.send({ ...this.message(admin.uid, admin.email, draft), subject: `[TESTE] ${draft.subject}` });

    return { sentTo: admin.email };
  }

  /** "Disparar campanha": grava, congela os destinatarios e envia. */
  async create(admin: AuthUser, draft: CampaignDraftDto): Promise<CampaignView> {
    const recipients = await this.prisma.user.findMany({
      where: segmentWhere(draft.segment),
      select: { id: true, email: true },
      orderBy: { createdAt: 'asc' },
    });

    if (recipients.length === 0) {
      throw new BadRequestException('Nenhum aluno neste segmento recebe e-mail hoje.');
    }

    const campaign = await this.prisma.$transaction(async (tx) => {
      const created = await tx.emailCampaign.create({
        data: {
          subject: draft.subject,
          body: draft.body,
          segment: draft.segment,
          createdById: admin.uid,
          createdByEmail: admin.email,
          recipientCount: recipients.length,
        },
      });

      await tx.emailDelivery.createMany({
        data: recipients.map((user) => ({ campaignId: created.id, userId: user.id, email: user.email })),
      });

      return created;
    });

    await this.deliver(campaign.id, draft);

    return this.view(campaign.id);
  }

  /** "Retomar envio": so as entregas sem `resendId` (decisao B4). */
  async resume(campaignId: string): Promise<CampaignView> {
    const campaign = await this.prisma.emailCampaign.findUnique({ where: { id: campaignId } });

    if (!campaign) {
      throw new NotFoundException('Campanha nao encontrada.');
    }

    await this.deliver(campaign.id, { subject: campaign.subject, body: campaign.body });

    return this.view(campaign.id);
  }

  /** Historico, da mais recente para a mais antiga (decisao B6). */
  async list(): Promise<CampaignView[]> {
    const campaigns = await this.prisma.emailCampaign.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    const ids = campaigns.map((campaign) => campaign.id);

    const [sent, failed] = await Promise.all([
      this.prisma.emailDelivery.groupBy({
        by: ['campaignId'],
        where: { campaignId: { in: ids }, resendId: { not: null } },
        _count: { _all: true },
      }),
      this.prisma.emailDelivery.groupBy({
        by: ['campaignId'],
        where: { campaignId: { in: ids }, resendId: null, error: { not: null } },
        _count: { _all: true },
      }),
    ]);

    const countOf = (rows: { campaignId: string; _count: { _all: number } }[], id: string) =>
      rows.find((row) => row.campaignId === id)?._count._all ?? 0;

    return campaigns.map((campaign) => ({
      id: campaign.id,
      subject: campaign.subject,
      segment: campaign.segment,
      createdByEmail: campaign.createdByEmail,
      status: campaign.status,
      recipientCount: campaign.recipientCount,
      sentCount: countOf(sent, campaign.id),
      failedCount: countOf(failed, campaign.id),
      createdAt: campaign.createdAt,
      finishedAt: campaign.finishedAt,
    }));
  }

  /**
   * Envia as entregas sem id em lotes de 100 e grava o desfecho de cada uma.
   * A chave de idempotencia do lote e derivada das entregas dele: reenviar o
   * mesmo lote dentro da janela do Resend nao entrega duas vezes.
   */
  private async deliver(campaignId: string, draft: Pick<CampaignDraftDto, 'subject' | 'body'>): Promise<void> {
    const pending = (await this.prisma.emailDelivery.findMany({
      where: { campaignId, resendId: null },
      select: { id: true, userId: true, email: true },
      orderBy: { id: 'asc' },
    })) as PendingDelivery[];

    if (pending.length > 0) {
      const messages = pending.map((delivery) => this.message(delivery.userId, delivery.email, draft));
      const keys = this.batchKeys(campaignId, pending);
      const results = await this.mail.sendBatch(messages, (index) => keys[index]);
      const now = new Date();

      for (const [index, delivery] of pending.entries()) {
        const result = results[index];

        await this.prisma.emailDelivery.update({
          where: { id: delivery.id },
          data:
            result && 'id' in result
              ? { resendId: result.id, sentAt: now, error: null }
              : { error: result?.error ?? 'Sem resposta do envio.' },
        });
      }
    }

    const missing = await this.prisma.emailDelivery.count({ where: { campaignId, resendId: null } });

    await this.prisma.emailCampaign.update({
      where: { id: campaignId },
      data: { status: missing === 0 ? 'SENT' : 'PARTIAL', finishedAt: new Date() },
    });
  }

  /** Mensagem de campanha de um aluno: layout, rodape e cabecalhos (B3 e B5). */
  private message(userId: string, email: string, draft: Pick<CampaignDraftDto, 'subject' | 'body'>): MailMessage {
    const links = this.unsubscribe.linksFor(userId);
    const content = renderEmail({ body: draft.body, preheader: draft.subject, unsubscribeUrl: links.pageUrl });

    return {
      to: email,
      subject: draft.subject,
      html: content.html,
      text: content.text,
      headers: unsubscribeHeaders(links.oneClickUrl),
    };
  }

  private batchKeys(campaignId: string, pending: PendingDelivery[]): string[] {
    const keys: string[] = [];

    for (let start = 0; start < pending.length; start += RESEND_BATCH_LIMIT) {
      const ids = pending
        .slice(start, start + RESEND_BATCH_LIMIT)
        .map((delivery) => delivery.id)
        .join(',');

      keys.push(`campanha-${campaignId}-${createHash('sha256').update(ids).digest('hex').slice(0, 24)}`);
    }

    return keys;
  }

  private async view(campaignId: string): Promise<CampaignView> {
    const found = (await this.list()).find((campaign) => campaign.id === campaignId);

    if (!found) {
      throw new NotFoundException('Campanha nao encontrada.');
    }

    return found;
  }
}
