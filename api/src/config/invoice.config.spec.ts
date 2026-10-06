import { ConfigService } from '@nestjs/config';
import {
  certificateExpiresAt,
  fiscalConfig,
  invoicesEnabled,
  nfseCancelWindowHours,
  nfseEnvironment,
} from './invoice.config';

function config(values: Record<string, string>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

const FISCAL_ENV = {
  NFSE_CODIGO_SERVICO: '080201',
  NFSE_ALIQUOTA_ISS: '2',
  NFSE_DESCRICAO: 'Treinamento educacional on-line Imersão RH Estratégico',
};

/** Spec 024.2, decisoes N2, N4, N7 e N9 (sobre a Spec 023, A1, A6, A7 e A10). */
describe('invoice.config', () => {
  // Decisao N4: uma variavel esquecida nunca emite nota real.
  it('sem NFSE_ENV, o ambiente e homologacao', () => {
    expect(nfseEnvironment(config({}))).toBe('homologacao');
    expect(nfseEnvironment(config({ NFSE_ENV: 'qualquer' }))).toBe('homologacao');
    expect(nfseEnvironment(config({ NFSE_ENV: 'producao' }))).toBe('producao');
  });

  // Decisao N9: a variavel da NF-e nao vale mais.
  it('ignora o NFE_ENV antigo', () => {
    expect(nfseEnvironment(config({ NFE_ENV: 'producao' }))).toBe('homologacao');
  });

  it('a emissao so liga com a chave da Notaas', () => {
    expect(invoicesEnabled(config({}))).toBe(false);
    expect(invoicesEnabled(config({ NOTAAS_API_KEY: 'k' }))).toBe(true);
  });

  it('le os dados fiscais obrigatorios, sem codigo fixo', () => {
    expect(fiscalConfig(config(FISCAL_ENV))).toEqual({
      codigoServico: '080201',
      aliquotaIss: 2,
      descricao: 'Treinamento educacional on-line Imersão RH Estratégico',
      tribIssqn: null,
      nbs: null,
      informacoesComplementares: null,
      ibscbs: null,
    });
  });

  it('le os opcionais quando definidos', () => {
    const fiscal = fiscalConfig(
      config({
        ...FISCAL_ENV,
        NFSE_ALIQUOTA_ISS: '2.5',
        NFSE_TRIB_ISSQN: '1',
        NFSE_NBS: '122051900',
        NFSE_INFORMACOES_COMPLEMENTARES: 'Acesso por 6 meses.',
      }),
    );

    expect(fiscal).toMatchObject({
      aliquotaIss: 2.5,
      tribIssqn: 1,
      nbs: '122051900',
      informacoesComplementares: 'Acesso por 6 meses.',
    });
  });

  // Decisao N2: sem os dois, nenhuma nota sai antes da contadora.
  it('falta de dado fiscal obrigatorio falha com o nome da variavel', () => {
    for (const name of Object.keys(FISCAL_ENV)) {
      const partial = { ...FISCAL_ENV } as Record<string, string>;

      delete partial[name];

      expect(() => fiscalConfig(config(partial))).toThrow(name);
    }
  });

  it('o codigo de servico tem 6 digitos', () => {
    expect(() => fiscalConfig(config({ ...FISCAL_ENV, NFSE_CODIGO_SERVICO: '8.02' }))).toThrow(
      'NFSE_CODIGO_SERVICO',
    );
  });

  it('a aliquota de ISS e um numero entre 0 e 5', () => {
    expect(() => fiscalConfig(config({ ...FISCAL_ENV, NFSE_ALIQUOTA_ISS: 'dois' }))).toThrow(
      'NFSE_ALIQUOTA_ISS',
    );
    expect(() => fiscalConfig(config({ ...FISCAL_ENV, NFSE_ALIQUOTA_ISS: '6' }))).toThrow(
      'NFSE_ALIQUOTA_ISS',
    );
    expect(fiscalConfig(config({ ...FISCAL_ENV, NFSE_ALIQUOTA_ISS: '0' })).aliquotaIss).toBe(0);
  });

  it('a tributacao do ISSQN e de 1 a 4', () => {
    expect(() => fiscalConfig(config({ ...FISCAL_ENV, NFSE_TRIB_ISSQN: '7' }))).toThrow('NFSE_TRIB_ISSQN');
  });

  it('o grupo IBS/CBS entra com o que estiver definido', () => {
    expect(
      fiscalConfig(
        config({
          ...FISCAL_ENV,
          NFSE_IBSCBS_CST: '000',
          NFSE_IBSCBS_CCLASSTRIB: '000001',
          NFSE_IBSCBS_INDOP: '100301',
        }),
      ).ibscbs,
    ).toEqual({ cst: '000', classificacaoTributaria: '000001', indicadorOperacao: '100301' });

    expect(fiscalConfig(config({ ...FISCAL_ENV, NFSE_IBSCBS_CST: '000' })).ibscbs).toEqual({
      cst: '000',
    });
  });

  it('o prazo de cancelamento e 24 horas por padrao', () => {
    expect(nfseCancelWindowHours(config({}))).toBe(24);
    expect(nfseCancelWindowHours(config({ NFSE_CANCEL_WINDOW_HOURS: '12' }))).toBe(12);
  });

  it('le o vencimento do certificado, e ignora data invalida', () => {
    expect(certificateExpiresAt(config({ NFSE_CERT_EXPIRES_AT: '2027-09-30' }))?.toISOString()).toBe(
      '2027-09-30T00:00:00.000Z',
    );
    expect(certificateExpiresAt(config({ NFSE_CERT_EXPIRES_AT: 'amanha' }))).toBeNull();
    expect(certificateExpiresAt(config({}))).toBeNull();
  });
});
