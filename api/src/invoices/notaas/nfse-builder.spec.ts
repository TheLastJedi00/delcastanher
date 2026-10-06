import { FiscalConfig } from '../../config/invoice.config';
import { buildNfse, MissingRecipientError, NfseOrder } from './nfse-builder';

/** Dados fiscais da contadora, como a configuracao os entrega (decisao N2). */
const FISCAL: FiscalConfig = {
  codigoServico: '080201',
  aliquotaIss: 2,
  descricao: 'Treinamento educacional on-line Imersão RH Estratégico',
  tribIssqn: null,
  nbs: null,
  informacoesComplementares: null,
  ibscbs: null,
};

const ORDER: NfseOrder = {
  id: 'ord-1',
  amountCents: 39800,
  paidAt: new Date('2026-10-06T15:00:00.000Z'),
  payerDocument: '19119119100',
  payerName: 'Ana Souza',
  payerZip: '01310100',
  payerStreet: 'Avenida Paulista',
  payerNumber: '1000',
  payerComplement: 'Conj. 12',
  payerDistrict: 'Bela Vista',
  payerCity: 'São Paulo',
  payerState: 'SP',
  items: [
    { titleSnapshot: 'Fundamentos', priceCents: 19900 },
    { titleSnapshot: 'Pratica', priceCents: 19900 },
  ],
};

/** Spec 024.2, decisao N2: `order -> corpo de POST /emitir`. */
describe('buildNfse', () => {
  it('monta o tomador com CPF, nome e endereco, sem e-mail', () => {
    expect(buildNfse(ORDER, FISCAL).tomador).toEqual({
      cpf: '19119119100',
      nome: 'Ana Souza',
      endereco: {
        logradouro: 'Avenida Paulista',
        numero: '1000',
        complemento: 'Conj. 12',
        bairro: 'Bela Vista',
        cidade: 'São Paulo',
        uf: 'SP',
        cep: '01310100',
      },
    });
  });

  // Spec 023, decisao A8: o e-mail da nota e nosso.
  it('nao manda tomador.email', () => {
    expect(buildNfse(ORDER, FISCAL).tomador).not.toHaveProperty('email');
  });

  it('documento de 14 digitos vai como CNPJ', () => {
    const { tomador } = buildNfse({ ...ORDER, payerDocument: '12345678000195' }, FISCAL);

    expect(tomador.cnpj).toBe('12345678000195');
    expect(tomador).not.toHaveProperty('cpf');
  });

  it('documento com pontuacao vai so com os digitos', () => {
    expect(buildNfse({ ...ORDER, payerDocument: '191.191.191-00' }, FISCAL).tomador.cpf).toBe(
      '19119119100',
    );
  });

  it('omite o complemento ausente', () => {
    const { tomador } = buildNfse({ ...ORDER, payerComplement: null }, FISCAL);

    expect(tomador.endereco).not.toHaveProperty('complemento');
  });

  // Decisao N2: a NFS-e nao exige endereco, e pedido antigo nao tem.
  it('pedido sem endereco completo sai sem endereco', () => {
    const { tomador } = buildNfse({ ...ORDER, payerZip: null }, FISCAL);

    expect(tomador).toEqual({ cpf: '19119119100', nome: 'Ana Souza' });
  });

  it('recusa pedido sem documento ou sem nome do tomador', () => {
    expect(() => buildNfse({ ...ORDER, payerDocument: null }, FISCAL)).toThrow(MissingRecipientError);
    expect(() => buildNfse({ ...ORDER, payerName: '  ' }, FISCAL)).toThrow(MissingRecipientError);
    expect(() => buildNfse({ ...ORDER, payerDocument: '123' }, FISCAL)).toThrow(MissingRecipientError);
  });

  it('monta um servico so, com o codigo da configuracao e os modulos na descricao', () => {
    expect(buildNfse(ORDER, FISCAL).servico).toEqual({
      codigo: '080201',
      descricao: 'Treinamento educacional on-line Imersão RH Estratégico: Fundamentos; Pratica.',
    });
  });

  it('inclui NBS e informacoes complementares quando definidos', () => {
    const { servico } = buildNfse(ORDER, {
      ...FISCAL,
      nbs: '122051900',
      informacoesComplementares: 'Acesso por 6 meses.',
    });

    expect(servico).toMatchObject({ nbs: '122051900', informacoesComplementares: 'Acesso por 6 meses.' });
  });

  it('valores: total do pedido e aliquota de ISS, sem tribISSQN por padrao', () => {
    expect(buildNfse(ORDER, FISCAL).valores).toEqual({ total: 398, aliquotaIss: 2 });
  });

  it('tribISSQN entra quando definido', () => {
    expect(buildNfse(ORDER, { ...FISCAL, tribIssqn: 1 }).valores.tribISSQN).toBe(1);
  });

  it('o grupo IBS/CBS so entra quando definido, e com consumidor final', () => {
    expect(buildNfse(ORDER, FISCAL).valores).not.toHaveProperty('ibscbs');
    expect(buildNfse(ORDER, { ...FISCAL, ibscbs: { cst: '000' } }).valores.ibscbs).toEqual({
      cst: '000',
      consumidorFinal: true,
    });
  });

  // Rateio do pacote (Spec 019): o valor em reais nao pode errar por ponto
  // flutuante.
  it('converte centavos em reais com duas casas, sem erro de ponto flutuante', () => {
    expect(buildNfse({ ...ORDER, amountCents: 1999 }, FISCAL).valores.total).toBe(19.99);
  });

  it('competencia e o mes do pagamento no fuso de Sao Paulo', () => {
    expect(buildNfse(ORDER, FISCAL).competencia).toBe('2026-10');
    // 01/11 01:00 UTC ainda e 31/10 em Sao Paulo.
    expect(buildNfse({ ...ORDER, paidAt: new Date('2026-11-01T01:00:00.000Z') }, FISCAL).competencia).toBe(
      '2026-10',
    );
  });

  // Decisao N3.
  it('manda o id do pedido como referencia', () => {
    expect(buildNfse(ORDER, FISCAL).referencia).toBe('ord-1');
  });
});
