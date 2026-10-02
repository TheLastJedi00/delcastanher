import { ConfigService } from '@nestjs/config';
import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http';
import { AddressInfo } from 'node:net';
import { NfeBody } from './nfe-builder';
import { NotaasClient } from './notaas.client';

/** Requisicao recebida pelo servidor falso. */
interface Received {
  method: string;
  url: string;
  headers: IncomingMessage['headers'];
  body: string;
}

type Handler = (request: Received, response: ServerResponse) => void;

/**
 * Servidor HTTP falso no lugar da Notaas (Task 3.2): o cliente e exercitado
 * de ponta a ponta — cabecalho, rota, corpo e timeout — sem `fetch` falso.
 */
async function fakeNotaas(handler: Handler) {
  const received: Received[] = [];

  const server: Server = createServer((request, response) => {
    let body = '';

    request.on('data', (chunk) => (body += chunk));
    request.on('end', () => {
      const entry = {
        method: request.method ?? '',
        url: request.url ?? '',
        headers: request.headers,
        body,
      };

      received.push(entry);
      handler(entry, response);
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  const { port } = server.address() as AddressInfo;
  const values: Record<string, string> = {
    NOTAAS_API_KEY: 'chave-homologacao',
    NOTAAS_API_URL: `http://127.0.0.1:${port}/api/v1`,
    NOTAAS_TIMEOUT_MS: '200',
  };
  const client = new NotaasClient({ get: (key: string) => values[key] } as unknown as ConfigService);

  return {
    client,
    received,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(body));
}

const BODY = { modelo: 55, naturezaOperacao: 'Venda de livro digital' } as unknown as NfeBody;

/** Spec 023, decisoes A1, A2 e A6. */
describe('NotaasClient', () => {
  let close: (() => Promise<void>) | null = null;

  afterEach(async () => {
    await close?.();
    close = null;
  });

  describe('emit', () => {
    it('manda o corpo para POST /nfe/emitir com x-api-key e devolve o invoiceId do 202', async () => {
      const fake = await fakeNotaas((_, response) =>
        json(response, 202, { invoiceId: 'inv-1', status: 'queued' }),
      );
      close = fake.close;

      expect(await fake.client.emit(BODY)).toEqual({ kind: 'queued', providerInvoiceId: 'inv-1' });
      expect(fake.received[0]).toMatchObject({ method: 'POST', url: '/api/v1/nfe/emitir' });
      expect(fake.received[0].headers['x-api-key']).toBe('chave-homologacao');
      expect(JSON.parse(fake.received[0].body)).toEqual(BODY);
    });

    // Decisao A2: 400 e validacao antes de enfileirar — nada foi criado.
    it('400 vira recusa com a mensagem crua, sem excecao', async () => {
      const fake = await fakeNotaas((_, response) =>
        json(response, 400, { error: 'dest.endereco.uf invalida' }),
      );
      close = fake.close;

      expect(await fake.client.emit(BODY)).toEqual({
        kind: 'rejected',
        message: expect.stringContaining('dest.endereco.uf invalida'),
      });
    });

    // Decisao A2: a chamada saiu e a resposta nao chegou. A nota pode existir.
    it('timeout vira desconhecido, distinguivel da recusa', async () => {
      const fake = await fakeNotaas(() => undefined);
      close = fake.close;

      expect(await fake.client.emit(BODY)).toEqual({
        kind: 'unknown',
        message: expect.stringContaining('sem resposta'),
      });
    });

    it('5xx tambem vira desconhecido: o servidor pode ter enfileirado', async () => {
      const fake = await fakeNotaas((_, response) => json(response, 502, { error: 'bad gateway' }));
      close = fake.close;

      expect((await fake.client.emit(BODY)).kind).toBe('unknown');
    });

    it('202 sem invoiceId vira desconhecido, e nao sucesso', async () => {
      const fake = await fakeNotaas((_, response) => json(response, 202, { status: 'queued' }));
      close = fake.close;

      expect((await fake.client.emit(BODY)).kind).toBe('unknown');
    });
  });

  describe('status', () => {
    it('traduz a nota autorizada', async () => {
      const fake = await fakeNotaas((_, response) =>
        json(response, 200, {
          invoiceId: 'inv-1',
          status: 'issued',
          tpAmb: 2,
          numero: 42,
          serie: 1,
          chaveAcesso: '35261012345678000195550010000000421234567890',
          protocolo: '135260000012345',
          codigoStatus: 100,
          motivo: 'Autorizado o uso da NF-e',
          dataRecebimento: '2026-10-02T12:00:02-03:00',
        }),
      );
      close = fake.close;

      expect(await fake.client.status('inv-1')).toEqual({
        providerInvoiceId: 'inv-1',
        status: 'issued',
        tpAmb: 2,
        number: '42',
        series: '1',
        accessKey: '35261012345678000195550010000000421234567890',
        protocol: '135260000012345',
        issuedAt: new Date('2026-10-02T15:00:02.000Z'),
        cancelledAt: null,
        errorDetail: null,
      });
      expect(fake.received[0].url).toBe('/api/v1/nfe/invoices/inv-1/status');
    });

    it('junta codigoStatus, motivo e errorMessage no erro', async () => {
      const fake = await fakeNotaas((_, response) =>
        json(response, 200, {
          invoiceId: 'inv-1',
          status: 'error',
          tpAmb: 2,
          codigoStatus: 539,
          motivo: 'Duplicidade de NF-e',
          errorMessage: 'SEFAZ rejeitou',
        }),
      );
      close = fake.close;

      expect((await fake.client.status('inv-1')).errorDetail).toBe(
        '539 - Duplicidade de NF-e - SEFAZ rejeitou',
      );
    });

    it('le o instante do cancelamento', async () => {
      const fake = await fakeNotaas((_, response) =>
        json(response, 200, {
          invoiceId: 'inv-1',
          status: 'cancelled',
          tpAmb: 2,
          cancelledAt: '2026-10-02T13:00:00-03:00',
        }),
      );
      close = fake.close;

      expect((await fake.client.status('inv-1')).cancelledAt).toEqual(
        new Date('2026-10-02T16:00:00.000Z'),
      );
    });

    it('falha de rede no status lanca, para quem chamou tentar de novo', async () => {
      const fake = await fakeNotaas((_, response) => json(response, 500, { error: 'x' }));
      close = fake.close;

      await expect(fake.client.status('inv-1')).rejects.toThrow('500');
    });
  });

  describe('cancel', () => {
    it('manda invoiceId e motivo para POST /nfe/cancelar e aceita o 202', async () => {
      const fake = await fakeNotaas((_, response) => json(response, 202, { status: 'accepted' }));
      close = fake.close;

      expect(await fake.client.cancel('inv-1', 'Venda desfeita: pagamento estornado')).toEqual({
        kind: 'accepted',
      });
      expect(fake.received[0].url).toBe('/api/v1/nfe/cancelar');
      expect(JSON.parse(fake.received[0].body)).toEqual({
        invoiceId: 'inv-1',
        motivo: 'Venda desfeita: pagamento estornado',
      });
    });

    // Decisao A7: o 422 de prazo e o estorno fora das 24 horas.
    it('422 de prazo vira expirado', async () => {
      const fake = await fakeNotaas((_, response) =>
        json(response, 422, { error: 'Prazo de cancelamento expirado (24h)' }),
      );
      close = fake.close;

      expect((await fake.client.cancel('inv-1', 'x'.repeat(20))).kind).toBe('expired');
    });

    it('outro 422 vira recusa', async () => {
      const fake = await fakeNotaas((_, response) =>
        json(response, 422, { error: 'Status diferente de issued' }),
      );
      close = fake.close;

      expect(await fake.client.cancel('inv-1', 'x'.repeat(20))).toEqual({
        kind: 'refused',
        message: expect.stringContaining('Status diferente de issued'),
      });
    });
  });

  describe('documentos', () => {
    it('baixa o DANFE em PDF com a chave da API', async () => {
      const fake = await fakeNotaas((_, response) => {
        response.writeHead(200, { 'Content-Type': 'application/pdf' });
        response.end(Buffer.from('%PDF-1.4 danfe'));
      });
      close = fake.close;

      expect((await fake.client.downloadPdf('inv-1')).toString()).toBe('%PDF-1.4 danfe');
      expect(fake.received[0].url).toBe('/api/v1/nfe/invoices/inv-1/danfe');
      expect(fake.received[0].headers['x-api-key']).toBe('chave-homologacao');
    });

    it('baixa o XML autorizado e o do cancelamento', async () => {
      const fake = await fakeNotaas((_, response) => {
        response.writeHead(200, { 'Content-Type': 'application/xml' });
        response.end('<nfeProc/>');
      });
      close = fake.close;

      await fake.client.downloadXml('inv-1');
      await fake.client.downloadXml('inv-1', 'cancel');

      expect(fake.received.map((r) => r.url)).toEqual([
        '/api/v1/nfe/invoices/inv-1/xml',
        '/api/v1/nfe/invoices/inv-1/xml?type=cancel',
      ]);
    });

    it('documento que nao baixou lanca', async () => {
      const fake = await fakeNotaas((_, response) => json(response, 404, { error: 'nao encontrada' }));
      close = fake.close;

      await expect(fake.client.downloadPdf('inv-1')).rejects.toThrow('404');
    });
  });
});
