import { ConfigService } from '@nestjs/config';
import {
  certificateExpiresAt,
  expectedTpAmb,
  fiscalConfig,
  invoicesEnabled,
  nfeCancelWindowHours,
  nfeEnvironment,
} from './invoice.config';

function config(values: Record<string, string>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

const FISCAL_ENV = {
  NFE_NATUREZA_OPERACAO: 'Venda de livro digital',
  NFE_NCM: '49019900',
  NFE_CFOP_INTERNO: '5102',
  NFE_CFOP_INTERESTADUAL: '6108',
  NFE_CSOSN: '300',
  NFE_CST_PIS: '07',
  NFE_CST_COFINS: '07',
  NFE_PRESENCA_COMPRADOR: '2',
  NFE_INDICADOR_INTERMEDIADOR: '0',
  NFE_INF_CPL: 'Livro digital imune.',
  NFE_EMITENTE_UF: 'SP',
};

/** Spec 023, decisoes A1, A6, A7 e A10. */
describe('invoice.config', () => {
  // Decisao A6: uma variavel esquecida nunca emite nota real.
  it('sem NFE_ENV, o ambiente e homologacao', () => {
    expect(nfeEnvironment(config({}))).toBe('homologacao');
    expect(nfeEnvironment(config({ NFE_ENV: 'qualquer' }))).toBe('homologacao');
    expect(nfeEnvironment(config({ NFE_ENV: 'producao' }))).toBe('producao');
  });

  it('o tpAmb esperado e 1 em producao e 2 em homologacao', () => {
    expect(expectedTpAmb('producao')).toBe(1);
    expect(expectedTpAmb('homologacao')).toBe(2);
  });

  it('a emissao so liga com a chave da Notaas', () => {
    expect(invoicesEnabled(config({}))).toBe(false);
    expect(invoicesEnabled(config({ NOTAAS_API_KEY: 'k' }))).toBe(true);
  });

  it('le os dados fiscais da configuracao, sem codigo fixo', () => {
    expect(fiscalConfig(config(FISCAL_ENV))).toEqual({
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
      infCpl: 'Livro digital imune.',
      emitenteUf: 'SP',
      ibscbs: null,
    });
  });

  it('falta de dado fiscal falha com o nome da variavel', () => {
    const { NFE_NCM: _ncm, ...semNcm } = FISCAL_ENV;

    expect(() => fiscalConfig(config(semNcm))).toThrow('NFE_NCM');
  });

  it('exige exatamente um entre NFE_CSOSN e NFE_CST', () => {
    const { NFE_CSOSN: _csosn, ...semNenhum } = FISCAL_ENV;

    expect(() => fiscalConfig(config(semNenhum))).toThrow('NFE_CSOSN');
    expect(() => fiscalConfig(config({ ...FISCAL_ENV, NFE_CST: '41' }))).toThrow('NFE_CSOSN');
  });

  it('o grupo IBS/CBS so entra com CST e cClassTrib', () => {
    expect(
      fiscalConfig(config({ ...FISCAL_ENV, NFE_IBSCBS_CST: '410', NFE_IBSCBS_CCLASSTRIB: '410999' }))
        .ibscbs,
    ).toEqual({ cst: '410', cClassTrib: '410999' });
    expect(fiscalConfig(config({ ...FISCAL_ENV, NFE_IBSCBS_CST: '410' })).ibscbs).toBeNull();
  });

  it('o prazo de cancelamento e 24 horas por padrao', () => {
    expect(nfeCancelWindowHours(config({}))).toBe(24);
    expect(nfeCancelWindowHours(config({ NFE_CANCEL_WINDOW_HOURS: '12' }))).toBe(12);
  });

  it('le o vencimento do certificado, e ignora data invalida', () => {
    expect(certificateExpiresAt(config({ NFE_CERT_EXPIRES_AT: '2027-09-30' }))?.toISOString()).toBe(
      '2027-09-30T00:00:00.000Z',
    );
    expect(certificateExpiresAt(config({ NFE_CERT_EXPIRES_AT: 'amanha' }))).toBeNull();
    expect(certificateExpiresAt(config({}))).toBeNull();
  });
});
