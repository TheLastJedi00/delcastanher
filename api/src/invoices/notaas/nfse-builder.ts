import type { FiscalConfig, IbsCbsConfig } from '../../config/invoice.config';

/** O que o `NfseBuilder` precisa do pedido: valor, modulos e tomador. */
export interface NfseOrder {
  id: string;
  amountCents: number;
  paidAt: Date | null;
  payerDocument: string | null;
  payerName: string | null;
  payerZip: string | null;
  payerStreet: string | null;
  payerNumber: string | null;
  payerComplement: string | null;
  payerDistrict: string | null;
  payerCity: string | null;
  payerState: string | null;
  items: { titleSnapshot: string; priceCents: number }[];
}

/** Endereco do tomador; a Notaas resolve o IBGE pelo nome da cidade. */
export interface NfseAddress {
  logradouro: string;
  numero: string;
  complemento?: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
}

/** Corpo de `POST /emitir` (documentacao da Notaas, 2026-10), no que usamos. */
export interface NfseBody {
  tomador: {
    cpf?: string;
    cnpj?: string;
    nome: string;
    endereco?: NfseAddress;
  };
  servico: {
    codigo: string;
    descricao: string;
    nbs?: string;
    informacoesComplementares?: string;
  };
  valores: {
    total: number;
    aliquotaIss: number;
    tribISSQN?: number;
    ibscbs?: IbsCbsConfig & { consumidorFinal: true };
  };
  competencia: string;
  referencia: string;
}

/** Pedido sem documento ou sem nome: a NFS-e nao sai (decisao N2). */
export class MissingRecipientError extends Error {
  constructor() {
    super('Pedido sem CPF/CNPJ ou sem nome do tomador: a NFS-e exige os dois.');
    this.name = 'MissingRecipientError';
  }
}

/**
 * Centavos para reais em `number`, como a Notaas espera. Arredondado em duas
 * casas: rateios nao podem levar o erro de ponto flutuante para um documento
 * fiscal.
 */
function reais(cents: number): number {
  return Math.round(cents) / 100;
}

/** `AAAA-MM` do instante no fuso de Sao Paulo, onde a empresa recolhe o ISS. */
function competencia(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date);
  const part = (type: string) => parts.find((p) => p.type === type)?.value;

  return `${part('year')}-${part('month')}`;
}

/** Endereco so quando completo: a NFS-e nao o exige (decisao N2). */
function address(order: NfseOrder): NfseAddress | null {
  const { payerStreet, payerNumber, payerDistrict, payerCity, payerState, payerZip } = order;

  if (!payerStreet || !payerNumber || !payerDistrict || !payerCity || !payerState || !payerZip) {
    return null;
  }

  return {
    logradouro: payerStreet,
    numero: payerNumber,
    ...(order.payerComplement ? { complemento: order.payerComplement } : {}),
    bairro: payerDistrict,
    cidade: payerCity,
    uf: payerState.toUpperCase(),
    cep: payerZip.replace(/\D/g, ''),
  };
}

/**
 * `order -> corpo de POST /emitir` (Spec 024.2, decisao N2).
 *
 * Uma NFS-e por pedido, com um servico so: a descricao da configuracao
 * seguida dos modulos comprados. Todo codigo fiscal vem da configuracao.
 * **Sem `tomador.email`**: o e-mail da nota e nosso (Spec 023, decisao A8), e
 * a Notaas mandaria um segundo.
 */
export function buildNfse(order: NfseOrder, fiscal: FiscalConfig): NfseBody {
  const document = (order.payerDocument ?? '').replace(/\D/g, '');
  const name = order.payerName?.trim();

  if ((document.length !== 11 && document.length !== 14) || !name) {
    throw new MissingRecipientError();
  }

  const endereco = address(order);
  const modules = order.items.map((item) => item.titleSnapshot).join('; ');

  return {
    tomador: {
      ...(document.length === 11 ? { cpf: document } : { cnpj: document }),
      nome: name,
      ...(endereco ? { endereco } : {}),
    },
    servico: {
      codigo: fiscal.codigoServico,
      descricao: modules ? `${fiscal.descricao}: ${modules}.` : fiscal.descricao,
      ...(fiscal.nbs ? { nbs: fiscal.nbs } : {}),
      ...(fiscal.informacoesComplementares
        ? { informacoesComplementares: fiscal.informacoesComplementares }
        : {}),
    },
    valores: {
      total: reais(order.amountCents),
      aliquotaIss: fiscal.aliquotaIss,
      ...(fiscal.tribIssqn ? { tribISSQN: fiscal.tribIssqn } : {}),
      ...(fiscal.ibscbs ? { ibscbs: { ...fiscal.ibscbs, consumidorFinal: true as const } } : {}),
    },
    competencia: competencia(order.paidAt ?? new Date()),
    referencia: order.id,
  };
}
