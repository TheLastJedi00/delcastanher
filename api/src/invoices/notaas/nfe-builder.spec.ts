import { FiscalConfig } from '../../config/invoice.config';
import { buildNfe, MissingRecipientError, NfeOrder } from './nfe-builder';

/** Dados fiscais do contador, como a configuracao os entrega (decisao A1). */
const FISCAL: FiscalConfig = {
  naturezaOperacao: 'Venda de livro digital',
  ncm: '49019900',
  cfopInterno: '5102',
  cfopInterestadual: '6108',
  csosn: '300',
  cst: null,
  cstPis: '07',
  cstCofins: '07',
  presencaComprador: 2,
  indicadorIntermediador: 0,
  infCpl: 'Livro digital imune de ICMS (CF, art. 150, VI, d).',
  emitenteUf: 'SP',
  ibscbs: null,
};

const ORDER: NfeOrder = {
  id: 'ord-1',
  amountCents: 39800,
  method: 'PIX',
  payerDocument: '19119119100',
  payerName: 'Ana Souza',
  payerZip: '01310100',
  payerStreet: 'Avenida Paulista',
  payerNumber: '1000',
  payerComplement: 'Conj. 12',
  payerDistrict: 'Bela Vista',
  payerCity: 'São Paulo',
  payerCityIbge: '3550308',
  payerState: 'SP',
  items: [
    { moduleId: 'mod-1', titleSnapshot: 'Fundamentos', priceCents: 19900 },
    { moduleId: 'mod-2', titleSnapshot: 'Pratica', priceCents: 19900 },
  ],
};

/** Spec 023, decisao A1: `order -> corpo de POST /nfe/emitir`. */
describe('buildNfe', () => {
  it('monta o cabecalho de NF-e de venda a consumidor final pela internet', () => {
    expect(buildNfe(ORDER, FISCAL)).toMatchObject({
      modelo: 55,
      naturezaOperacao: 'Venda de livro digital',
      finalidade: 1,
      consumidorFinal: 1,
      presencaComprador: 2,
      indicadorIntermediador: 0,
      transporte: { modalidadeFrete: 9 },
      infCpl: 'Livro digital imune de ICMS (CF, art. 150, VI, d).',
    });
  });

  it('monta o destinatario com CPF, nome, endereco e nao contribuinte', () => {
    expect(buildNfe(ORDER, FISCAL).dest).toEqual({
      cpf: '19119119100',
      nome: 'Ana Souza',
      indicadorIE: 9,
      endereco: {
        logradouro: 'Avenida Paulista',
        numero: '1000',
        complemento: 'Conj. 12',
        bairro: 'Bela Vista',
        codigoMunicipio: 3550308,
        cidade: 'São Paulo',
        uf: 'SP',
        cep: '01310100',
      },
    });
  });

  // O e-mail da nota e nosso (decisao A8): com `dest.email` a Notaas mandaria
  // um segundo.
  it('nao manda dest.email', () => {
    expect(buildNfe(ORDER, FISCAL).dest).not.toHaveProperty('email');
  });

  it('omite o complemento ausente', () => {
    const body = buildNfe({ ...ORDER, payerComplement: null }, FISCAL);

    expect(body.dest.endereco).not.toHaveProperty('complemento');
  });

  it('monta um item por modulo, com os codigos fiscais da configuracao', () => {
    expect(buildNfe(ORDER, FISCAL).items).toEqual([
      {
        codigo: 'mod-1',
        descricao: 'Fundamentos',
        ncm: '49019900',
        cfop: '5102',
        quantidade: 1,
        valorTotal: 199,
        csosn: '300',
        cstPis: '07',
        cstCofins: '07',
      },
      {
        codigo: 'mod-2',
        descricao: 'Pratica',
        ncm: '49019900',
        cfop: '5102',
        quantidade: 1,
        valorTotal: 199,
        csosn: '300',
        cstPis: '07',
        cstCofins: '07',
      },
    ]);
  });

  it('usa o CFOP interestadual quando a UF do comprador e outra', () => {
    const body = buildNfe({ ...ORDER, payerState: 'RJ' }, FISCAL);

    expect(body.items.every((item) => item.cfop === '6108')).toBe(true);
  });

  it('usa o CST, e nao o CSOSN, no regime normal', () => {
    const [item] = buildNfe(ORDER, { ...FISCAL, csosn: null, cst: '41' }).items;

    expect(item.cst).toBe('41');
    expect(item).not.toHaveProperty('csosn');
  });

  it('inclui o grupo IBS/CBS quando o contador o definiu', () => {
    const [item] = buildNfe(ORDER, { ...FISCAL, ibscbs: { cst: '410', cClassTrib: '410999' } }).items;

    expect(item.ibscbs).toEqual({ cst: '410', cClassTrib: '410999' });
  });

  it('paga com PIX (17) ou cartao de credito (03), pelo valor do pedido', () => {
    expect(buildNfe(ORDER, FISCAL).pagamentos).toEqual([{ tipoPagamento: '17', valor: 398 }]);
    expect(buildNfe({ ...ORDER, method: 'CREDIT_CARD' }, FISCAL).pagamentos).toEqual([
      { tipoPagamento: '03', valor: 398 },
    ]);
  });

  // Rateio do pacote (Spec 019): 59000 em 12 partes nao divide exato, e o
  // valor em reais nao pode errar por ponto flutuante.
  it('converte centavos em reais com duas casas, sem erro de ponto flutuante', () => {
    const body = buildNfe(
      { ...ORDER, amountCents: 1999, items: [{ moduleId: 'm', titleSnapshot: 'M', priceCents: 1999 }] },
      FISCAL,
    );

    expect(body.items[0].valorTotal).toBe(19.99);
    expect(body.pagamentos[0].valor).toBe(19.99);
  });

  // Decisao A3: pedido anterior a spec nao tem endereco.
  it('recusa pedido sem CPF ou sem endereco do destinatario', () => {
    expect(() => buildNfe({ ...ORDER, payerZip: null }, FISCAL)).toThrow(MissingRecipientError);
    expect(() => buildNfe({ ...ORDER, payerDocument: null }, FISCAL)).toThrow(MissingRecipientError);
  });
});
