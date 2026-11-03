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
  /** NBS, 9 digitos sem pontos: obrigatorio desde a Spec 031 (decisao 7). */
  nbs: string;
  informacoesComplementares: string | null;
  ibscbs: IbsCbsConfig | null;
}

/**
 * Se o processo roda no deploy de producao da Vercel. Ausente (ambiente local)
 * ou qualquer outro valor (`preview`, `development`) conta como fora dela.
 */
export function isProductionDeploy(config: ConfigService): boolean {
  return optionalEnv(config, 'VERCEL_ENV') === 'production';
}

/**
 * Se a emissao esta ligada (Spec 031, decisao 1): so no deploy de producao
 * **e** com a chave da Notaas. A Notaas nao recebe o ambiente no corpo da
 * emissao — quem decide se a nota e real e a chave —, entao uma chave no
 * preview ou no `.env` local emitiria nota real. Fora da producao a chave e
 * ignorada, nenhuma nota e criada, e a venda segue igual.
 */
export function invoicesEnabled(config: ConfigService): boolean {
  return isProductionDeploy(config) && !!optionalEnv(config, 'NOTAAS_API_KEY');
}

/**
 * Ambiente da nota (Spec 031, decisao 2): vem do deploy, e nao de uma variavel
 * solta. `producao` com a emissao ligada; `homologacao` so rotula linhas
 * antigas e o painel com a emissao desligada. O `NFSE_ENV` nao e mais lido.
 */
export function nfseEnvironment(config: ConfigService): NfseEnvironment {
  return invoicesEnabled(config) ? 'producao' : 'homologacao';
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

function nbs(config: ConfigService): string {
  const value = requiredEnv(config, 'NFSE_NBS');

  if (!/^\d{9}$/.test(value)) {
    throw invalid('NFSE_NBS', 'NBS de 9 digitos, sem pontos, como 118064000');
  }

  return value;
}

/**
 * Os dados fiscais da contadora (Task 1.1). Codigo do servico, aliquota,
 * descricao e NBS sao obrigatorios **aqui**, embora a Notaas aceite omitir o
 * codigo e o NBS: assim nenhuma nota sai sem o que a contadora definiu
 * (decisao N2; NBS pela Spec 031, decisao 7).
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
    nbs: nbs(config),
    informacoesComplementares: optionalEnv(config, 'NFSE_INFORMACOES_COMPLEMENTARES'),
    ibscbs: ibscbs(config),
  };
}
