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
  NFSE_NBS: '118064000',
};

/** Spec 024.2, decisoes N2, N4, N7 e N9 (sobre a Spec 023, A1, A6, A7 e A10). */
describe('invoice.config', () => {
  // Spec 031, decisao 1: quem decide se a nota e real e a chave, e ela so vale
  // no deploy de producao.
  describe('emissao so no deploy de producao (Spec 031)', () => {
    it('liga so com VERCEL_ENV=production e a chave da Notaas', () => {
      expect(invoicesEnabled(config({ VERCEL_ENV: 'production', NOTAAS_API_KEY: 'k' }))).toBe(true);
    });

    it.each<Record<string, string>>([{ VERCEL_ENV: 'preview' }, { VERCEL_ENV: 'development' }, {}])(
      'com a chave e %p, fica desligada',
      (env) => {
        expect(invoicesEnabled(config({ ...env, NOTAAS_API_KEY: 'k' }))).toBe(false);
      },
    );

    it('em producao sem a chave, fica desligada', () => {
      expect(invoicesEnabled(config({ VERCEL_ENV: 'production' }))).toBe(false);
    });
  });

  // Spec 031, decisao 2: o ambiente vem do deploy, e o NFSE_ENV nao vale mais.
  describe('ambiente da nota (Spec 031)', () => {
    it('e producao quando a emissao esta ligada', () => {
      expect(nfseEnvironment(config({ VERCEL_ENV: 'production', NOTAAS_API_KEY: 'k' }))).toBe('producao');
    });

    it('e homologacao quando a emissao esta desligada', () => {
      expect(nfseEnvironment(config({}))).toBe('homologacao');
      expect(nfseEnvironment(config({ VERCEL_ENV: 'preview', NOTAAS_API_KEY: 'k' }))).toBe('homologacao');
    });

    it('ignora o NFSE_ENV, inclusive NFSE_ENV=producao no preview', () => {
      expect(
        nfseEnvironment(config({ VERCEL_ENV: 'preview', NOTAAS_API_KEY: 'k', NFSE_ENV: 'producao' })),
      ).toBe('homologacao');
      expect(nfseEnvironment(config({ NFSE_ENV: 'producao' }))).toBe('homologacao');
      expect(
        nfseEnvironment(config({ VERCEL_ENV: 'production', NOTAAS_API_KEY: 'k', NFSE_ENV: 'homologacao' })),
      ).toBe('producao');
    });

    // Decisao N9 da Spec 024.2: a variavel da NF-e tambem nao vale.
    it('ignora o NFE_ENV antigo', () => {
      expect(nfseEnvironment(config({ NFE_ENV: 'producao' }))).toBe('homologacao');
    });
  });

  it('le os dados fiscais obrigatorios, sem codigo fixo', () => {
    expect(fiscalConfig(config(FISCAL_ENV))).toEqual({
      codigoServico: '080201',
      aliquotaIss: 2,
      descricao: 'Treinamento educacional on-line Imersão RH Estratégico',
      tribIssqn: null,
      nbs: '118064000',
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
        NFSE_INFORMACOES_COMPLEMENTARES: 'Acesso por 6 meses.',
      }),
    );

    expect(fiscal).toMatchObject({
      aliquotaIss: 2.5,
      tribIssqn: 1,
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

  // Spec 031, decisao 7: o NBS 1.1806.40.00 da contadora, sem pontos.
  it.each(['1.1806.40.00', '11806400', '1180640000', 'abcdefghi'])(
    'o NBS tem 9 digitos, sem pontos: %s e recusado',
    (nbs) => {
      expect(() => fiscalConfig(config({ ...FISCAL_ENV, NFSE_NBS: nbs }))).toThrow('NFSE_NBS');
    },
  );

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
