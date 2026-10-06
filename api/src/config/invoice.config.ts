import { InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { optionalEnv, requiredEnv } from './media.config';

/**
 * Nota fiscal pela Notaas: NFS-e de treinamento (Spec 024.2, sobre a Parte A
 * da Spec 023).
 *
 * **Nenhum codigo fiscal fica fixo no codigo** (Spec 023, decisao A1): codigo
 * do servico, aliquota de ISS, NBS e IBS/CBS sao decisao da contadora, e vem
 * daqui. A chave da API e o segredo do webhook nunca saem deste arquivo.
 */

/** `producao` ou `homologacao` (decisao N4). */
export type NfseEnvironment = 'producao' | 'homologacao';

/** Grupo IBS/CBS da reforma tributaria, com o que a contadora definir. */
export interface IbsCbsConfig {
  cst?: string;
  classificacaoTributaria?: string;
  indicadorOperacao?: string;
}

/** Os dados fiscais do servico (decisao N2). */
export interface FiscalConfig {
  /** cTribNac da LC 116, 6 digitos. */
  codigoServico: string;
  /** Aliquota de ISS em %. */
  aliquotaIss: number;
  /** Inicio da descricao: os modulos do pedido vem depois. */
  descricao: string;
  /** 1 tributavel, 2 imune, 3 exportacao, 4 nao incidencia; nulo usa o projeto. */
  tribIssqn: number | null;
  nbs: string | null;
  informacoesComplementares: string | null;
  ibscbs: IbsCbsConfig | null;
}

/**
 * Ambiente fiscal esperado (decisao N4). Qualquer valor que nao seja
 * `producao` e homologacao: uma variavel esquecida nunca emite nota real.
 */
export function nfseEnvironment(config: ConfigService): NfseEnvironment {
  return optionalEnv(config, 'NFSE_ENV') === 'producao' ? 'producao' : 'homologacao';
}

/**
 * Se a emissao esta ligada. Sem a chave da Notaas — no preview e em
 * desenvolvimento, por exemplo — nenhuma nota e criada, e a venda segue igual.
 */
export function invoicesEnabled(config: ConfigService): boolean {
  return !!optionalEnv(config, 'NOTAAS_API_KEY');
}

/** Chave da API do projeto da Notaas. */
export function notaasApiKey(config: ConfigService): string {
  return requiredEnv(config, 'NOTAAS_API_KEY');
}

/** Secret do endpoint de webhook do projeto (Spec 023, decisao A5). */
export function notaasWebhookSecret(config: ConfigService): string {
  return requiredEnv(config, 'NOTAAS_WEBHOOK_SECRET');
}

/** Prazo de cancelamento da NFS-e, em horas (decisao N7). */
export function nfseCancelWindowHours(config: ConfigService): number {
  const value = Number(optionalEnv(config, 'NFSE_CANCEL_WINDOW_HOURS') ?? 24);

  return Number.isFinite(value) && value > 0 ? value : 24;
}

/** Vencimento do certificado A1 (Spec 023, decisao A10). */
export function certificateExpiresAt(config: ConfigService): Date | null {
  const raw = optionalEnv(config, 'NFSE_CERT_EXPIRES_AT');
  const date = raw ? new Date(raw) : null;

  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function invalid(name: string, rule: string): InternalServerErrorException {
  return new InternalServerErrorException(`${name} invalida: ${rule}.`);
}

function aliquotaIss(config: ConfigService): number {
  const raw = requiredEnv(config, 'NFSE_ALIQUOTA_ISS');
  const value = Number(raw.replace(',', '.'));

  // A LC 116 limita o ISS a 5%; 0 e imunidade ou exportacao.
  if (!Number.isFinite(value) || value < 0 || value > 5) {
    throw invalid('NFSE_ALIQUOTA_ISS', 'percentual de 0 a 5');
  }

  return value;
}

function tribIssqn(config: ConfigService): number | null {
  const raw = optionalEnv(config, 'NFSE_TRIB_ISSQN');

  if (raw === null) {
    return null;
  }

  if (!['1', '2', '3', '4'].includes(raw)) {
    throw invalid('NFSE_TRIB_ISSQN', 'de 1 a 4');
  }

  return Number(raw);
}

function ibscbs(config: ConfigService): IbsCbsConfig | null {
  const group: IbsCbsConfig = {};
  const cst = optionalEnv(config, 'NFSE_IBSCBS_CST');
  const classificacao = optionalEnv(config, 'NFSE_IBSCBS_CCLASSTRIB');
  const indicador = optionalEnv(config, 'NFSE_IBSCBS_INDOP');

  if (cst) group.cst = cst;
  if (classificacao) group.classificacaoTributaria = classificacao;
  if (indicador) group.indicadorOperacao = indicador;

  return Object.keys(group).length ? group : null;
}

/**
 * Os dados fiscais da contadora (Task 1.1). Codigo do servico, aliquota e
 * descricao sao obrigatorios **aqui**, embora a Notaas aceite omitir o
 * codigo: assim nenhuma nota sai antes de a contadora definir (decisao N2).
 */
export function fiscalConfig(config: ConfigService): FiscalConfig {
  const codigoServico = requiredEnv(config, 'NFSE_CODIGO_SERVICO');

  if (!/^\d{6}$/.test(codigoServico)) {
    throw invalid('NFSE_CODIGO_SERVICO', 'cTribNac de 6 digitos, como 080201');
  }

  return {
    codigoServico,
    aliquotaIss: aliquotaIss(config),
    descricao: requiredEnv(config, 'NFSE_DESCRICAO'),
    tribIssqn: tribIssqn(config),
    nbs: optionalEnv(config, 'NFSE_NBS'),
    informacoesComplementares: optionalEnv(config, 'NFSE_INFORMACOES_COMPLEMENTARES'),
    ibscbs: ibscbs(config),
  };
}
