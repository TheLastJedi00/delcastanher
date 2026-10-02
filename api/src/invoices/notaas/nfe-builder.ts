import type { FiscalConfig } from '../../config/invoice.config';
import type { PaymentMethodKind } from '../../generated/prisma/client';

/** O que o `NfeBuilder` precisa do pedido: valores, itens e destinatario. */
export interface NfeOrder {
  id: string;
  amountCents: number;
  method: PaymentMethodKind;
  payerDocument: string | null;
  payerName: string | null;
  payerZip: string | null;
  payerStreet: string | null;
  payerNumber: string | null;
  payerComplement: string | null;
  payerDistrict: string | null;
  payerCity: string | null;
  payerCityIbge: string | null;
  payerState: string | null;
  items: { moduleId: string; titleSnapshot: string; priceCents: number }[];
}

/** Item de `POST /nfe/emitir`, no que esta plataforma usa. */
export interface NfeItem {
  codigo: string;
  descricao: string;
  ncm: string;
  cfop: string;
  quantidade: number;
  valorTotal: number;
  csosn?: string;
  cst?: string;
  cstPis: string;
  cstCofins: string;
  ibscbs?: { cst: string; cClassTrib: string };
}

/** Corpo de `POST /nfe/emitir` (documentacao da Notaas, 2026-10). */
export interface NfeBody {
  modelo: 55;
  naturezaOperacao: string;
  finalidade: 1;
  consumidorFinal: 1;
  presencaComprador: number;
  indicadorIntermediador: number;
  dest: {
    cpf: string;
    nome: string;
    indicadorIE: 9;
    endereco: {
      logradouro: string;
      numero: string;
      complemento?: string;
      bairro: string;
      codigoMunicipio: number;
      cidade: string;
      uf: string;
      cep: string;
    };
  };
  items: NfeItem[];
  pagamentos: { tipoPagamento: '17' | '03'; valor: number }[];
  transporte: { modalidadeFrete: 9 };
  infCpl: string;
}

/** Pedido sem CPF ou sem endereco: a NF-e nao sai (decisao A3). */
export class MissingRecipientError extends Error {
  constructor() {
    super('Pedido sem CPF ou sem endereço do destinatário: a NF-e exige os dois.');
    this.name = 'MissingRecipientError';
  }
}

/**
 * Centavos para reais em `number`, como a Notaas espera. Arredondado em duas
 * casas: `1999 / 100` ja e `19.99`, mas somas e rateios nao podem levar o erro
 * de ponto flutuante para um documento fiscal.
 */
function reais(cents: number): number {
  return Math.round(cents) / 100;
}

/**
 * `order -> corpo de POST /nfe/emitir` (Spec 023, decisao A1).
 *
 * NF-e de venda a consumidor final nao contribuinte, pela internet, sem frete
 * (produto digital), com **um item por modulo**. Todo codigo fiscal vem da
 * configuracao. **Sem `dest.email`**: o e-mail da nota e nosso (decisao A8),
 * e a Notaas mandaria um segundo.
 */
export function buildNfe(order: NfeOrder, fiscal: FiscalConfig): NfeBody {
  const required = [
    order.payerDocument,
    order.payerName,
    order.payerZip,
    order.payerStreet,
    order.payerNumber,
    order.payerDistrict,
    order.payerCity,
    order.payerCityIbge,
    order.payerState,
  ];

  if (required.some((value) => !value)) {
    throw new MissingRecipientError();
  }

  const state = (order.payerState as string).toUpperCase();
  const cfop = state === fiscal.emitenteUf ? fiscal.cfopInterno : fiscal.cfopInterestadual;

  return {
    modelo: 55,
    naturezaOperacao: fiscal.naturezaOperacao,
    finalidade: 1,
    consumidorFinal: 1,
    presencaComprador: fiscal.presencaComprador,
    indicadorIntermediador: fiscal.indicadorIntermediador,
    dest: {
      cpf: order.payerDocument as string,
      nome: order.payerName as string,
      indicadorIE: 9,
      endereco: {
        logradouro: order.payerStreet as string,
        numero: order.payerNumber as string,
        ...(order.payerComplement ? { complemento: order.payerComplement } : {}),
        bairro: order.payerDistrict as string,
        codigoMunicipio: Number(order.payerCityIbge),
        cidade: order.payerCity as string,
        uf: state,
        cep: order.payerZip as string,
      },
    },
    items: order.items.map((item) => ({
      codigo: item.moduleId,
      descricao: item.titleSnapshot,
      ncm: fiscal.ncm,
      cfop,
      quantidade: 1,
      valorTotal: reais(item.priceCents),
      ...(fiscal.csosn ? { csosn: fiscal.csosn } : { cst: fiscal.cst as string }),
      cstPis: fiscal.cstPis,
      cstCofins: fiscal.cstCofins,
      ...(fiscal.ibscbs ? { ibscbs: fiscal.ibscbs } : {}),
    })),
    pagamentos: [
      { tipoPagamento: order.method === 'PIX' ? '17' : '03', valor: reais(order.amountCents) },
    ],
    transporte: { modalidadeFrete: 9 },
    infCpl: fiscal.infCpl,
  };
}
