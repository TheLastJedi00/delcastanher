import { BadRequestException, Injectable } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import {
  AdminLegalDocumentsView,
  AdminLegalDraft,
  LEGAL_DOCUMENT_KINDS,
  LegalDocumentKind,
  LegalVersionRow,
  PublishChangeKind,
  toAdminDraft,
  toAdminVersion,
} from './legal.types';

/**
 * A data do dia **em Brasilia**, `AAAA-MM-DD`: uma publicacao as 22h de 28/09
 * e dia 29 em UTC, e a versao tem de ser a data que quem publicou tem em mente.
 *
 * Nao reusa o `bucketKey` do financeiro de proposito: aquele modulo depende do
 * de usuarios, que depende deste, e a importacao fecharia um ciclo.
 */
export function saoPauloDate(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * A proxima versao da politica numa **nova versao** (decisao 3): a data do
 * dia, e `AAAA-MM-DD.2`, `.3`... quando ja houve publicacao com essa data.
 */
export function nextPolicyVersion(latest: string | null, today: string): string {
  if (!latest || latest.split('.')[0] !== today) {
    return today;
  }

  const suffix = Number(latest.split('.')[1] ?? '1');

  return `${today}.${suffix + 1}`;
}

/** A ultima publicada primeiro; o id desempata duas no mesmo milissegundo. */
const LATEST_FIRST = [{ publishedAt: 'desc' as const }, { id: 'desc' as const }];

/**
 * Documentos legais no banco (Spec 022).
 *
 * Versao publicada e imutavel (decisao 2): este servico so cria versoes, e
 * nao tem metodo que altere ou apague uma. O que se edita e o rascunho, um por
 * documento.
 */
@Injectable()
export class LegalDocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  /** A versao vigente do documento, ou nula sem publicacao. */
  current(kind: LegalDocumentKind): Promise<LegalVersionRow | null> {
    return this.prisma.legalDocumentVersion.findFirst({ where: { kind }, orderBy: LATEST_FIRST });
  }

  /**
   * A versao da politica vigente: a da ultima publicacao de **qualquer**
   * documento, porque o aceite do onboarding cobre os tres (decisao 3).
   */
  async policyVersion(): Promise<string | null> {
    const latest = await this.prisma.legalDocumentVersion.findFirst({ orderBy: LATEST_FIRST });

    return latest?.policyVersion ?? null;
  }

  /** Os tres documentos, com vigente e rascunho, para a aba do painel. */
  async adminList(): Promise<AdminLegalDocumentsView> {
    const [versions, drafts] = await Promise.all([
      Promise.all(LEGAL_DOCUMENT_KINDS.map((kind) => this.current(kind))),
      this.prisma.legalDocumentDraft.findMany(),
    ]);

    const latest = versions
      .filter((row): row is LegalVersionRow => row !== null)
      .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())[0];

    return {
      policyVersion: latest?.policyVersion ?? null,
      documents: LEGAL_DOCUMENT_KINDS.map((kind, index) => {
        const current = versions[index];
        const draft = drafts.find((row) => row.kind === kind);

        return {
          kind,
          current: current ? toAdminVersion(current) : null,
          draft: draft ? toAdminDraft(draft) : null,
        };
      }),
    };
  }

  /** Historico do documento, da mais recente para a mais antiga. */
  async versions(kind: LegalDocumentKind) {
    const rows = await this.prisma.legalDocumentVersion.findMany({
      where: { kind },
      orderBy: LATEST_FIRST,
    });

    return rows.map(toAdminVersion);
  }

  /** Salva o rascunho, sobrescrevendo o anterior. Autor vem do token. */
  async saveDraft(user: AuthUser, kind: LegalDocumentKind, content: string): Promise<AdminLegalDraft> {
    const author = { content, updatedById: user.uid, updatedByEmail: user.email };
    const row = await this.prisma.legalDocumentDraft.upsert({
      where: { kind },
      create: { kind, ...author },
      update: author,
    });

    return toAdminDraft(row);
  }

  /** Descarta o rascunho. Sem rascunho, nao ha o que fazer, e nao e erro. */
  async discardDraft(kind: LegalDocumentKind): Promise<void> {
    await this.prisma.legalDocumentDraft.deleteMany({ where: { kind } });
  }

  /**
   * Publica o rascunho como versao nova.
   *
   * Roda numa transacao: trava, le o rascunho e a ultima versao, calcula a
   * versao da politica, grava e apaga o rascunho. A trava e um advisory lock
   * de transacao, e nao `FOR UPDATE` numa linha: na primeira publicacao de
   * todas nao ha linha para travar, e duas publicacoes simultaneas no mesmo dia
   * nao podem sair com a mesma versao.
   */
  async publish(
    user: AuthUser,
    kind: LegalDocumentKind,
    requested: PublishChangeKind,
    now: Date = new Date(),
  ) {
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 AS "locked" FROM pg_advisory_xact_lock(hashtext('legal_document_versions'))`;

      const draft = await tx.legalDocumentDraft.findUnique({ where: { kind } });

      if (!draft || draft.content.trim() === '') {
        throw new BadRequestException('Não há rascunho com texto para publicar.');
      }

      const latest = await tx.legalDocumentVersion.findFirst({ orderBy: LATEST_FIRST });
      const current = await tx.legalDocumentVersion.findFirst({ where: { kind }, orderBy: LATEST_FIRST });

      // Sem versao deste documento, correcao nao existe: quem aceitou antes
      // aceitou sem este texto. E o caso da primeira publicacao dos Termos.
      const changeKind: PublishChangeKind = current && latest ? requested : 'NEW_VERSION';
      const policyVersion =
        changeKind === 'CORRECTION' && latest
          ? latest.policyVersion
          : nextPolicyVersion(latest?.policyVersion ?? null, saoPauloDate(now));

      const created = await tx.legalDocumentVersion.create({
        data: {
          kind,
          content: draft.content,
          policyVersion,
          changeKind,
          publishedAt: now,
          publishedById: user.uid,
          publishedByEmail: user.email,
        },
      });

      await tx.legalDocumentDraft.deleteMany({ where: { kind } });

      return created;
    });

    return toAdminVersion(row);
  }
}
