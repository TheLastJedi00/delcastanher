import { InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { optionalEnv, requiredEnv } from './media.config';

/**
 * Nota fiscal pela Notaas (Spec 023, Parte A).
 *
 * **Nenhum codigo fiscal fica fixo no codigo** (decisao A1): NCM, CFOP,
 * CSOSN/CST, PIS, COFINS e o texto da imunidade sao decisao do contador, e
 * vem daqui. A chave da API e o segredo do webhook nunca saem deste arquivo.
 */

/** `producao` ou `homologacao` (decisao A6). */
export type NfeEnvironment = 'producao' | 'homologacao';

/** Grupo IBS/CBS da reforma tributaria, quando o contador o definir. */
export interface IbsCbsConfig {
  cst: string;
  cClassTrib: string;
}

/** Os dados fiscais do item "livro digital" e da operacao. */
export interface FiscalConfig {
  naturezaOperacao: string;
  ncm: string;
  cfopInterno: string;
  cfopInterestadual: string;
  /** Exatamente um dos dois: CSOSN no Simples, CST no regime normal. */
  csosn: string | null;
  cst: string | null;
  cstPis: string;
  cstCofins: string;
  presencaComprador: number;
  indicadorIntermediador: number;
  infCpl: string;
  /** UF do emitente: e ela que separa o CFOP interno do interestadual. */
  emitenteUf: string;
  ibscbs: IbsCbsConfig | null;
}

/**
 * Ambiente fiscal esperado (decisao A6). Qualquer valor que nao seja
 * `producao` e homologacao: uma variavel esquecida nunca emite nota real.
 */
export function nfeEnvironment(config: ConfigService): NfeEnvironment {
  return optionalEnv(config, 'NFE_ENV') === 'producao' ? 'producao' : 'homologacao';
}

/** O `tpAmb` que a Notaas devolve: 1 em producao, 2 em homologacao. */
export function expectedTpAmb(environment: NfeEnvironment): number {
  return environment === 'producao' ? 1 : 2;
}

/**
 * Se a emissao esta ligada. Sem a chave da Notaas — em desenvolvimento, por
 * exemplo — nenhuma nota e criada, e a venda segue igual.
 */
export function invoicesEnabled(config: ConfigService): boolean {
  return !!optionalEnv(config, 'NOTAAS_API_KEY');
}

/** Chave da API do projeto da Notaas deste ambiente (decisao A6). */
export function notaasApiKey(config: ConfigService): string {
  return requiredEnv(config, 'NOTAAS_API_KEY');
}

/** Secret do endpoint de webhook do projeto deste ambiente (decisao A5). */
export function notaasWebhookSecret(config: ConfigService): string {
  return requiredEnv(config, 'NOTAAS_WEBHOOK_SECRET');
}

/** Prazo de cancelamento da NF-e, em horas (decisao A7). */
export function nfeCancelWindowHours(config: ConfigService): number {
  const value = Number(optionalEnv(config, 'NFE_CANCEL_WINDOW_HOURS') ?? 24);

  return Number.isFinite(value) && value > 0 ? value : 24;
}

/** Vencimento do certificado A1, quando a Notaas nao avisa (decisao A10). */
export function certificateExpiresAt(config: ConfigService): Date | null {
  const raw = optionalEnv(config, 'NFE_CERT_EXPIRES_AT');
  const date = raw ? new Date(raw) : null;

  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function integer(config: ConfigService, name: string): number {
  const value = Number(requiredEnv(config, name));

  if (!Number.isInteger(value)) {
    throw new InternalServerErrorException(`${name} precisa ser um numero inteiro.`);
  }

  return value;
}

/** Os dados fiscais do contador (Task 1.1). Falta de um deles nao emite. */
export function fiscalConfig(config: ConfigService): FiscalConfig {
  const csosn = optionalEnv(config, 'NFE_CSOSN');
  const cst = optionalEnv(config, 'NFE_CST');

  if (!csosn === !cst) {
    throw new InternalServerErrorException(
      'Configure exatamente um entre NFE_CSOSN (Simples Nacional) e NFE_CST (regime normal).',
    );
  }

  const ibsCst = optionalEnv(config, 'NFE_IBSCBS_CST');
  const ibsClass = optionalEnv(config, 'NFE_IBSCBS_CCLASSTRIB');

  return {
    naturezaOperacao: requiredEnv(config, 'NFE_NATUREZA_OPERACAO'),
    ncm: requiredEnv(config, 'NFE_NCM'),
    cfopInterno: requiredEnv(config, 'NFE_CFOP_INTERNO'),
    cfopInterestadual: requiredEnv(config, 'NFE_CFOP_INTERESTADUAL'),
    csosn,
    cst,
    cstPis: requiredEnv(config, 'NFE_CST_PIS'),
    cstCofins: requiredEnv(config, 'NFE_CST_COFINS'),
    presencaComprador: integer(config, 'NFE_PRESENCA_COMPRADOR'),
    indicadorIntermediador: integer(config, 'NFE_INDICADOR_INTERMEDIADOR'),
    infCpl: requiredEnv(config, 'NFE_INF_CPL'),
    emitenteUf: requiredEnv(config, 'NFE_EMITENTE_UF').toUpperCase(),
    ibscbs: ibsCst && ibsClass ? { cst: ibsCst, cClassTrib: ibsClass } : null,
  };
}
