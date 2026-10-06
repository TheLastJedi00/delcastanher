import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { INVOICE_GATEWAY, ProviderInvoice } from './invoice-gateway';
import { InvoicesService, REFUND_CANCEL_REASON } from './invoices.service';
import { FakeOrder, fakeInvoiceDb } from './invoices.testing';

/** `chNFSe`, o codigo de verificacao da NFS-e nacional (50 digitos). */
const KEY = '42024042258216042000144000000000000126104238271855';

const ENV: Record<string, string> = {
  NOTAAS_API_KEY: 'chave-homologacao',
  NFSE_CODIGO_SERVICO: '080201',
  NFSE_ALIQUOTA_ISS: '2',
  NFSE_DESCRICAO: 'Treinamento educacional on-line Imersão RH Estratégico',
};

function order(overrides: Partial<FakeOrder> = {}): FakeOrder {
  return {
    id: 'ord-1',
    status: 'PAID',
    amountCents: 19900,
    method: 'PIX',
    paidAt: new Date('2026-10-06T15:00:00.000Z'),
    payerDocument: '19119119100',
    payerName: 'Ana Souza',
    payerZip: '01310100',
    payerStreet: 'Avenida Paulista',
    payerNumber: '1000',
    payerComplement: null,
    payerDistrict: 'Bela Vista',
    payerCity: 'São Paulo',
    payerCityIbge: '3550308',
    payerState: 'SP',
    items: [{ moduleId: 'mod-1', titleSnapshot: 'Fundamentos', priceCents: 19900 }],
    user: { email: 'aluno@delcastanher.com', name: 'Ana Souza' },
    ...overrides,
  };
}

function issued(overrides: Partial<ProviderInvoice> = {}): ProviderInvoice {
  return {
    providerInvoiceId: 'nts-1',
    status: 'issued',
    environment: 'homologacao',
    number: '42',
    series: null,
    accessKey: KEY,
    protocol: null,
    issuedAt: new Date(),
    cancelledAt: null,
    errorDetail: null,
    ...overrides,
  };
}

interface BuildOptions {
  orders?: FakeOrder[];
  env?: Record<string, string>;
}

async function build(options: BuildOptions = {}) {
  const orders = options.orders ?? [order()];
  const db = fakeInvoiceDb(orders);
  const env = options.env ?? ENV;

  const gateway = {
    emit: jest.fn().mockResolvedValue({ kind: 'queued', providerInvoiceId: 'nts-1' }),
    status: jest.fn().mockResolvedValue(issued()),
    cancel: jest.fn().mockResolvedValue({ kind: 'accepted' }),
    downloadPdf: jest.fn().mockResolvedValue(Buffer.from('%PDF')),
    downloadXml: jest.fn().mockResolvedValue(Buffer.from('<NFSe/>')),
  };

  const files = new Map<string, Buffer>();
  const storage = {
    saveFile: jest.fn(async (path: string, content: Buffer) => void files.set(path, content)),
    readFile: jest.fn(async (path: string) => files.get(path) as Buffer),
    createReadUrl: jest.fn(async (path: string) => ({ url: `https://assinada/${path}`, expiresAt: 'x' })),
  };

  const mail = { send: jest.fn().mockResolvedValue({ id: 're-1' }) };

  const moduleRef = await Test.createTestingModule({
    providers: [
      InvoicesService,
      { provide: PrismaService, useValue: db.prisma },
      { provide: INVOICE_GATEWAY, useValue: gateway },
      { provide: StorageService, useValue: storage },
      { provide: MailService, useValue: mail },
      { provide: ConfigService, useValue: { get: (key: string) => env[key] } },
    ],
  }).compile();

  return { service: moduleRef.get(InvoicesService), gateway, storage, mail, files, orders, ...db };
}

beforeAll(() => {
  for (const level of ['log', 'warn', 'error'] as const) {
    jest.spyOn(Logger.prototype, level).mockImplementation(() => undefined);
  }
});

afterAll(() => jest.restoreAllMocks());

describe('InvoicesService', () => {
  describe('onOrderPaid — emissao (decisoes A2 e A4)', () => {
    it('cria a nota em PENDING antes do POST e grava o invoiceId do 202 na hora', async () => {
      const { service, gateway, invoices, prisma } = await build();

      gateway.emit.mockImplementation(async () => {
        // No instante do POST a linha ja existe, e ainda sem id da Notaas.
        expect(invoices).toHaveLength(1);
        expect(invoices[0]).toMatchObject({ status: 'PENDING', providerInvoiceId: null });

        return { kind: 'queued', providerInvoiceId: 'nts-1' };
      });

      await service.onOrderPaid('ord-1');

      expect(gateway.emit).toHaveBeenCalledTimes(1);
      expect(invoices[0]).toMatchObject({
        status: 'PROCESSING',
        providerInvoiceId: 'nts-1',
        environment: 'homologacao',
        amountCents: 19900,
      });
      expect(prisma.invoice.create).toHaveBeenCalledTimes(1);
    });

    it('manda o corpo do NfseBuilder, com os dados do pedido', async () => {
      const { service, gateway } = await build();

      await service.onOrderPaid('ord-1');

      expect(gateway.emit.mock.calls[0][0]).toMatchObject({
        tomador: { cpf: '19119119100', nome: 'Ana Souza' },
        servico: { codigo: '080201', descricao: expect.stringContaining('Fundamentos') },
        valores: { total: 199, aliquotaIss: 2 },
        competencia: '2026-10',
        referencia: 'ord-1',
      });
    });

    it('um segundo aviso do mesmo pedido nao emite de novo', async () => {
      const { service, gateway, invoices } = await build();

      await service.onOrderPaid('ord-1');
      await service.onOrderPaid('ord-1');

      expect(gateway.emit).toHaveBeenCalledTimes(1);
      expect(invoices).toHaveLength(1);
    });

    it('400 vira ERROR com a mensagem crua', async () => {
      const { service, gateway, invoices } = await build();

      gateway.emit.mockResolvedValue({ kind: 'rejected', message: 'Notaas respondeu 400: uf' });

      await service.onOrderPaid('ord-1');

      expect(invoices[0]).toMatchObject({ status: 'ERROR', lastError: 'Notaas respondeu 400: uf' });
    });

    it('timeout vira UNKNOWN, sem invoiceId', async () => {
      const { service, gateway, invoices } = await build();

      gateway.emit.mockResolvedValue({ kind: 'unknown', message: 'Notaas sem resposta: timeout' });

      await service.onOrderPaid('ord-1');

      expect(invoices[0]).toMatchObject({ status: 'UNKNOWN', providerInvoiceId: null });
    });

    // Decisao N2: a NFS-e nao exige endereco.
    it('pedido sem endereco emite sem endereco', async () => {
      const { service, gateway, invoices } = await build({ orders: [order({ payerZip: null })] });

      await service.onOrderPaid('ord-1');

      expect(gateway.emit.mock.calls[0][0].tomador).not.toHaveProperty('endereco');
      expect(invoices[0].status).toBe('PROCESSING');
    });

    it('pedido sem CPF vira ERROR sem chamar a Notaas', async () => {
      const { service, gateway, invoices } = await build({ orders: [order({ payerDocument: null })] });

      await service.onOrderPaid('ord-1');

      expect(gateway.emit).not.toHaveBeenCalled();
      expect(invoices[0].status).toBe('ERROR');
      expect(invoices[0].lastError).toContain('CPF');
    });

    // Decisao N2: sem os dados da contadora, nenhuma nota sai.
    it('dado fiscal ausente vira ERROR com o nome da variavel', async () => {
      const { NFSE_CODIGO_SERVICO: _codigo, ...semCodigo } = ENV;
      const { service, gateway, invoices } = await build({ env: semCodigo });

      await service.onOrderPaid('ord-1');

      expect(gateway.emit).not.toHaveBeenCalled();
      expect(invoices[0]).toMatchObject({ status: 'ERROR', lastError: 'NFSE_CODIGO_SERVICO nao configurada.' });
    });

    it('sem NOTAAS_API_KEY, nao cria nota nenhuma', async () => {
      const { NOTAAS_API_KEY: _key, ...semChave } = ENV;
      const { service, gateway, invoices } = await build({ env: semChave });

      await service.onOrderPaid('ord-1');

      expect(invoices).toHaveLength(0);
      expect(gateway.emit).not.toHaveBeenCalled();
    });

    // Decisao A4: a nota e assunto do painel, nao do comprador.
    it('nunca lanca, nem quando a Notaas explode', async () => {
      const { service, gateway } = await build();

      gateway.emit.mockRejectedValue(new Error('bug'));

      await expect(service.onOrderPaid('ord-1')).resolves.toBeUndefined();
    });

    it('com NFSE_ENV=producao, a nota nasce em producao', async () => {
      const { service, invoices } = await build({ env: { ...ENV, NFSE_ENV: 'producao' } });

      await service.onOrderPaid('ord-1');

      expect(invoices[0].environment).toBe('producao');
    });
  });

  describe('syncByProviderId — o aviso do webhook (decisao A5)', () => {
    async function emitted() {
      const built = await build();

      await built.service.onOrderPaid('ord-1');

      return built;
    }

    it('autorizada grava numero e codigo de verificacao pela reconsulta', async () => {
      const { service, gateway, invoices } = await emitted();

      await service.syncByProviderId('nts-1');

      expect(gateway.status).toHaveBeenCalledWith('nts-1');
      expect(invoices[0]).toMatchObject({
        status: 'AUTHORIZED',
        number: '42',
        series: null,
        accessKey: KEY,
        protocol: null,
      });
      expect(invoices[0].issuedAt).toBeInstanceOf(Date);
    });

    it('guarda XML e DANFSe no Storage e manda o e-mail com os anexos', async () => {
      const { service, invoices, storage, mail } = await emitted();

      await service.syncByProviderId('nts-1');

      expect(storage.saveFile).toHaveBeenCalledWith(
        `invoices/homologacao/${KEY}.xml`,
        Buffer.from('<NFSe/>'),
        'application/xml',
      );
      expect(storage.saveFile).toHaveBeenCalledWith(
        `invoices/homologacao/${KEY}.pdf`,
        Buffer.from('%PDF'),
        'application/pdf',
      );
      expect(invoices[0]).toMatchObject({
        xmlPath: `invoices/homologacao/${KEY}.xml`,
        pdfPath: `invoices/homologacao/${KEY}.pdf`,
      });
      expect(invoices[0].emailedAt).toBeInstanceOf(Date);

      const message = mail.send.mock.calls[0][0];

      expect(message.to).toBe('aluno@delcastanher.com');
      expect(message.text).toContain(KEY);
      expect(message.text).toContain('NFS-e nº 42');
      expect(message.text).toContain('https://www.nfse.gov.br/consultapublica');
      expect(message.text).not.toContain('NF-e ');
      expect(message.attachments.map((a: { filename: string }) => a.filename)).toEqual([
        `nfse-${KEY}.pdf`,
        `nfse-${KEY}.xml`,
      ]);
    });

    it('o e-mail sai uma vez so, por mais avisos que cheguem', async () => {
      const { service, mail } = await emitted();

      await service.syncByProviderId('nts-1');
      await service.syncByProviderId('nts-1');
      await service.syncByProviderId('nts-1');

      expect(mail.send).toHaveBeenCalledTimes(1);
    });

    // Decisao B5: o e-mail da nota e transacional.
    it('o e-mail da nota nao leva descadastro', async () => {
      const { service, mail } = await emitted();

      await service.syncByProviderId('nts-1');

      const message = mail.send.mock.calls[0][0];

      expect(message.headers).toBeUndefined();
      expect(message.html).not.toContain('descadastro');
    });

    it('a nota de homologacao avisa no assunto e no corpo que nao tem valor fiscal', async () => {
      const { service, mail } = await emitted();

      await service.syncByProviderId('nts-1');

      expect(mail.send.mock.calls[0][0].subject).toContain('[HOMOLOGAÇÃO]');
      expect(mail.send.mock.calls[0][0].text).toContain('sem valor fiscal');
    });

    it('falha no e-mail desfaz a reivindicacao, para o cron tentar de novo', async () => {
      const { service, mail, invoices } = await emitted();

      mail.send.mockRejectedValueOnce(new Error('Resend fora'));

      await service.syncByProviderId('nts-1');

      expect(invoices[0].emailedAt).toBeNull();
      expect(invoices[0].status).toBe('AUTHORIZED');
    });

    it('falha no download nao manda e-mail sem anexo', async () => {
      const { service, gateway, mail, invoices } = await emitted();

      gateway.downloadPdf.mockRejectedValueOnce(new Error('404'));

      await service.syncByProviderId('nts-1');

      expect(invoices[0].status).toBe('AUTHORIZED');
      expect(invoices[0].pdfPath).toBeNull();
      expect(mail.send).not.toHaveBeenCalled();
    });

    it('rejeicao vira DENIED com o detalhe cru', async () => {
      const { service, gateway, invoices } = await emitted();

      gateway.status.mockResolvedValue(
        issued({ status: 'error', accessKey: null, errorDetail: 'E0540 - Inconsistencia de tributacao ISSQN' }),
      );

      await service.syncByProviderId('nts-1');

      expect(invoices[0]).toMatchObject({
        status: 'DENIED',
        lastError: 'E0540 - Inconsistencia de tributacao ISSQN',
      });
    });

    it('queued e processing ficam em PROCESSING', async () => {
      const { service, gateway, invoices } = await emitted();

      gateway.status.mockResolvedValue(issued({ status: 'processing', accessKey: null }));

      await service.syncByProviderId('nts-1');

      expect(invoices[0].status).toBe('PROCESSING');
    });

    // Decisao N4: preview e producao dividem o banco.
    it('ambiente que nao bate com o da nota vira ERROR, e nada e guardado nem enviado', async () => {
      const { service, gateway, invoices, mail } = await emitted();

      gateway.status.mockResolvedValue(issued({ environment: 'producao' }));

      await service.syncByProviderId('nts-1');

      expect(invoices[0].status).toBe('ERROR');
      expect(invoices[0].lastError).toContain('ambiente errado');
      expect(mail.send).not.toHaveBeenCalled();
    });

    it('consulta sem ambiente nao bloqueia: a Notaas so o devolve com a nota emitida', async () => {
      const { service, gateway, invoices } = await emitted();

      gateway.status.mockResolvedValue(issued({ status: 'processing', environment: null, accessKey: null }));

      await service.syncByProviderId('nts-1');

      expect(invoices[0].status).toBe('PROCESSING');
    });

    // Contingencia: a chave muda, e vale a da ultima consulta.
    it('uma chave diferente numa consulta posterior substitui a gravada', async () => {
      const { service, gateway, invoices } = await emitted();
      const OTHER = '42024042258216042000144000000000000126104299999999';

      await service.syncByProviderId('nts-1');
      gateway.status.mockResolvedValue(issued({ accessKey: OTHER }));
      await service.syncByProviderId('nts-1');

      expect(invoices[0].accessKey).toBe(OTHER);
      expect(invoices[0].xmlPath).toBe(`invoices/homologacao/${OTHER}.xml`);
    });

    it('id desconhecido e ignorado sem consultar', async () => {
      const { service, gateway } = await emitted();

      await service.syncByProviderId('nts-de-outro-sistema');

      expect(gateway.status).not.toHaveBeenCalled();
    });

    it('nota de outro ambiente e ignorada', async () => {
      const { service, gateway, invoices } = await emitted();

      invoices[0].environment = 'producao';

      await service.syncByProviderId('nts-1');

      expect(gateway.status).not.toHaveBeenCalled();
    });
  });

  describe('onOrderRefunded — estorno (decisao A7)', () => {
    async function authorized(orders = [order()]) {
      const built = await build({ orders });

      await built.service.onOrderPaid('ord-1');
      await built.service.syncByProviderId('nts-1');
      built.orders[0].status = 'REFUNDED';

      return built;
    }

    it('dentro de 24 horas, pede o cancelamento e vai a CANCELLING', async () => {
      const { service, gateway, invoices } = await authorized();

      await service.onOrderRefunded('ord-1');

      expect(gateway.cancel).toHaveBeenCalledWith('nts-1', REFUND_CANCEL_REASON);
      expect(REFUND_CANCEL_REASON.length).toBeGreaterThanOrEqual(15);
      expect(invoices[0].status).toBe('CANCELLING');
    });

    it('a confirmacao leva a CANCELLED e guarda o XML do evento', async () => {
      const { service, gateway, invoices, storage } = await authorized();

      await service.onOrderRefunded('ord-1');
      gateway.status.mockResolvedValue(issued({ status: 'cancelled', cancelledAt: new Date() }));
      await service.syncByProviderId('nts-1');

      expect(invoices[0].status).toBe('CANCELLED');
      expect(invoices[0].cancelledAt).toBeInstanceOf(Date);
      expect(gateway.downloadXml).toHaveBeenCalledWith('nts-1', 'cancel');
      expect(storage.saveFile).toHaveBeenCalledWith(
        `invoices/homologacao/${KEY}-cancelamento.xml`,
        expect.any(Buffer),
        'application/xml',
      );
    });

    it('enquanto o cancelamento nao confirma, a nota segue CANCELLING', async () => {
      const { service, invoices } = await authorized();

      await service.onOrderRefunded('ord-1');
      await service.syncByProviderId('nts-1');

      expect(invoices[0].status).toBe('CANCELLING');
    });

    it('depois de 24 horas, vira REFUND_PENDING sem chamar a Notaas', async () => {
      const { service, gateway, invoices } = await authorized();

      invoices[0].issuedAt = new Date(Date.now() - 25 * 60 * 60 * 1000);

      await service.onOrderRefunded('ord-1');

      expect(gateway.cancel).not.toHaveBeenCalled();
      expect(invoices[0].status).toBe('REFUND_PENDING');
    });

    it('o 422 de prazo tambem vira REFUND_PENDING', async () => {
      const { service, gateway, invoices } = await authorized();

      gateway.cancel.mockResolvedValue({ kind: 'expired', message: '422 prazo expirado' });

      await service.onOrderRefunded('ord-1');

      expect(invoices[0]).toMatchObject({ status: 'REFUND_PENDING', lastError: '422 prazo expirado' });
    });

    it('outro 422 vira CANCEL_ERROR com a mensagem', async () => {
      const { service, gateway, invoices } = await authorized();

      gateway.cancel.mockResolvedValue({ kind: 'refused', message: '422 status' });

      await service.onOrderRefunded('ord-1');

      expect(invoices[0]).toMatchObject({ status: 'CANCEL_ERROR', lastError: '422 status' });
    });

    it('nunca lanca: o estorno nao e desfeito', async () => {
      const { service, gateway } = await authorized();

      gateway.cancel.mockRejectedValue(new Error('rede'));

      await expect(service.onOrderRefunded('ord-1')).resolves.toBeUndefined();
    });

    it('nota autorizada depois do estorno e cancelada assim que autoriza', async () => {
      const { service, gateway, invoices, orders, mail } = await build();

      await service.onOrderPaid('ord-1');
      orders[0].status = 'REFUNDED';
      await service.onOrderRefunded('ord-1');
      await service.syncByProviderId('nts-1');

      expect(gateway.cancel).toHaveBeenCalledTimes(1);
      expect(invoices[0].status).toBe('CANCELLING');
      expect(mail.send).not.toHaveBeenCalled();
    });
  });

  describe('reconcile — o cron (decisoes A2 e A5)', () => {
    const HOUR = 60 * 60 * 1000;

    it('reconsulta PROCESSING parado ha mais de 1 hora, e nao o recente', async () => {
      const { service, gateway, invoices, age } = await build({
        orders: [order(), order({ id: 'ord-2' })],
      });

      gateway.emit
        .mockResolvedValueOnce({ kind: 'queued', providerInvoiceId: 'nts-1' })
        .mockResolvedValueOnce({ kind: 'queued', providerInvoiceId: 'nts-2' });
      await service.onOrderPaid('ord-1');
      await service.onOrderPaid('ord-2');
      age(invoices[0].id, 2 * HOUR);

      await service.reconcile();

      expect(gateway.status).toHaveBeenCalledTimes(1);
      expect(gateway.status).toHaveBeenCalledWith('nts-1');
    });

    it('reenvia so o PENDING que nunca saiu', async () => {
      const { service, gateway, invoices, age } = await build();

      gateway.emit.mockRejectedValueOnce(new Error('caiu antes do POST'));
      await service.onOrderPaid('ord-1');
      expect(invoices[0]).toMatchObject({ status: 'PENDING', providerInvoiceId: null });
      age(invoices[0].id, 2 * HOUR);

      await service.reconcile();

      expect(gateway.emit).toHaveBeenCalledTimes(2);
      expect(invoices[0].status).toBe('PROCESSING');
    });

    it('nunca reenvia UNKNOWN nem ERROR', async () => {
      const { service, gateway, invoices, age } = await build({
        orders: [order(), order({ id: 'ord-2' })],
      });

      gateway.emit
        .mockResolvedValueOnce({ kind: 'unknown', message: 'timeout' })
        .mockResolvedValueOnce({ kind: 'rejected', message: '400' });
      await service.onOrderPaid('ord-1');
      await service.onOrderPaid('ord-2');
      invoices.forEach((invoice) => age(invoice.id, 48 * HOUR));

      await service.reconcile();

      expect(gateway.emit).toHaveBeenCalledTimes(2);
      expect(invoices.map((i) => i.status)).toEqual(['UNKNOWN', 'ERROR']);
    });

    it('completa a nota autorizada que ficou sem arquivos ou sem e-mail', async () => {
      const { service, gateway, invoices, mail, age } = await build();

      await service.onOrderPaid('ord-1');
      gateway.downloadXml.mockRejectedValueOnce(new Error('fora'));
      await service.syncByProviderId('nts-1');
      expect(mail.send).not.toHaveBeenCalled();
      age(invoices[0].id, 2 * HOUR);

      await service.reconcile();

      expect(invoices[0].xmlPath).not.toBeNull();
      expect(mail.send).toHaveBeenCalledTimes(1);
    });

    it('so reconcilia o proprio ambiente', async () => {
      const { service, gateway, invoices, age } = await build();

      await service.onOrderPaid('ord-1');
      invoices[0].environment = 'producao';
      age(invoices[0].id, 2 * HOUR);

      await service.reconcile();

      expect(gateway.status).not.toHaveBeenCalled();
    });

    // Decisao A10.
    it('avisa o vencimento do certificado a 30 dias', async () => {
      const in20days = new Date(Date.now() + 20 * 24 * HOUR).toISOString().slice(0, 10);
      const { service } = await build({ env: { ...ENV, NFSE_CERT_EXPIRES_AT: in20days } });

      expect((await service.reconcile()).certificateWarning).toBe(true);
      expect(service.settings().certificateWarning).toBe(true);
    });

    it('sem vencimento configurado, nao avisa', async () => {
      const { service } = await build();

      expect(service.settings()).toMatchObject({
        enabled: true,
        environment: 'homologacao',
        certificateExpiresAt: null,
        certificateWarning: false,
      });
    });
  });

  describe('acoes do painel (decisao A9)', () => {
    it('emitir de novo em ERROR cria nota nova e guarda o invoiceId anterior', async () => {
      const { service, gateway, invoices } = await build();

      await service.onOrderPaid('ord-1');
      gateway.status.mockResolvedValue(issued({ status: 'error', accessKey: null, errorDetail: '225' }));
      await service.syncByProviderId('nts-1');
      gateway.emit.mockResolvedValue({ kind: 'queued', providerInvoiceId: 'nts-2' });

      await service.reissue('ord-1');

      expect(invoices).toHaveLength(1);
      expect(invoices[0]).toMatchObject({ status: 'PROCESSING', providerInvoiceId: 'nts-2' });
      expect(invoices[0].lastError).toContain('nts-1');
    });

    // Decisao A2: em UNKNOWN a nota pode existir na Notaas.
    it('emitir de novo em UNKNOWN exige a confirmacao', async () => {
      const { service, gateway, invoices } = await build();

      gateway.emit.mockResolvedValueOnce({ kind: 'unknown', message: 'timeout' });
      await service.onOrderPaid('ord-1');

      await expect(service.reissue('ord-1')).rejects.toMatchObject({ status: 400 });
      expect(gateway.emit).toHaveBeenCalledTimes(1);

      await service.reissue('ord-1', true);

      expect(gateway.emit).toHaveBeenCalledTimes(2);
      expect(invoices[0].status).toBe('PROCESSING');
    });

    it('nao emite de novo nota autorizada', async () => {
      const { service } = await build();

      await service.onOrderPaid('ord-1');
      await service.syncByProviderId('nts-1');

      await expect(service.reissue('ord-1')).rejects.toMatchObject({ status: 409 });
    });

    it('emite a nota do pedido pago que nao tem nenhuma', async () => {
      const { service, gateway, invoices } = await build();

      await service.reissue('ord-1');

      expect(gateway.emit).toHaveBeenCalledTimes(1);
      expect(invoices[0].status).toBe('PROCESSING');
    });

    it('vincular grava o invoiceId informado e reconsulta', async () => {
      const { service, gateway, invoices } = await build();

      gateway.emit.mockResolvedValueOnce({ kind: 'unknown', message: 'timeout' });
      await service.onOrderPaid('ord-1');
      gateway.status.mockResolvedValue(issued({ providerInvoiceId: 'nts-visto' }));

      await service.link('ord-1', 'nts-visto');

      expect(gateway.status).toHaveBeenCalledWith('nts-visto');
      expect(invoices[0]).toMatchObject({ providerInvoiceId: 'nts-visto', status: 'AUTHORIZED' });
    });

    it('vincular so vale para UNKNOWN', async () => {
      const { service } = await build();

      await service.onOrderPaid('ord-1');

      await expect(service.link('ord-1', 'nts-x')).rejects.toMatchObject({ status: 409 });
    });

    it('cancelar pelo painel dentro de 24 horas', async () => {
      const { service, gateway, invoices } = await build();

      await service.onOrderPaid('ord-1');
      await service.syncByProviderId('nts-1');

      await service.cancel('ord-1');

      expect(gateway.cancel).toHaveBeenCalledWith('nts-1', expect.any(String));
      expect(invoices[0].status).toBe('CANCELLING');
    });

    it('cancelar fora do prazo e recusado', async () => {
      const { service, invoices } = await build();

      await service.onOrderPaid('ord-1');
      await service.syncByProviderId('nts-1');
      invoices[0].issuedAt = new Date(Date.now() - 30 * 60 * 60 * 1000);

      await expect(service.cancel('ord-1')).rejects.toMatchObject({ status: 409 });
    });

    it('reenviar e-mail manda de novo, com os arquivos guardados', async () => {
      const { service, mail } = await build();

      await service.onOrderPaid('ord-1');
      await service.syncByProviderId('nts-1');
      await service.resendEmail('ord-1');

      expect(mail.send).toHaveBeenCalledTimes(2);
      expect(mail.send.mock.calls[1][0].attachments).toHaveLength(2);
    });

    it('baixar PDF devolve URL assinada do DANFE guardado', async () => {
      const { service } = await build();

      await service.onOrderPaid('ord-1');
      await service.syncByProviderId('nts-1');

      expect((await service.pdfUrl('ord-1')).url).toBe(`https://assinada/invoices/homologacao/${KEY}.pdf`);
    });

    it('atualizar situacao reconsulta na hora', async () => {
      const { service, invoices } = await build();

      await service.onOrderPaid('ord-1');
      await service.sync('ord-1');

      expect(invoices[0].status).toBe('AUTHORIZED');
    });

    it('pedido sem nota responde 404 nas acoes que dependem dela', async () => {
      const { service } = await build();

      await expect(service.pdfUrl('ord-1')).rejects.toMatchObject({ status: 404 });
      await expect(service.cancel('ord-1')).rejects.toMatchObject({ status: 404 });
    });
  });

  // Decisao A3: CPF e endereco nao aparecem em log.
  it('nao escreve CPF nem chave de API em log', async () => {
    const spies = (['log', 'warn', 'error'] as const).map((level) => jest.spyOn(Logger.prototype, level));
    const { service, gateway } = await build();

    gateway.emit.mockResolvedValue({ kind: 'unknown', message: 'timeout' });
    await service.onOrderPaid('ord-1');
    await service.syncByProviderId('nts-desconhecido');

    const logged = spies.flatMap((spy) => spy.mock.calls.flat()).map(String).join(' ');

    expect(logged).not.toContain('19119119100');
    expect(logged).not.toContain('chave-homologacao');
  });
});
