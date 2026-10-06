import { ConfigService } from '@nestjs/config';
import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http';
import { AddressInfo } from 'node:net';
import { NfseBody } from './nfse-builder';
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
 * Servidor HTTP falso no lugar da Notaas (Spec 023, Task 3.2): o cliente e exercitado
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

const BODY = {
  tomador: { cpf: '19119119100', nome: 'Ana Souza' },
  servico: { codigo: '080201', descricao: 'Treinamento' },
  valores: { total: 199, aliquotaIss: 2 },
  competencia: '2026-10',
  referencia: 'ord-1',
} as NfseBody;

const CHAVE = '42024042258216042000144000000000000126104238271855';

/** Spec 024.2, decisoes N1, N5 e N6 (sobre a Spec 023, A1, A2 e A6). */
describe('NotaasClient', () => {
  let close: (() => Promise<void>) | null = null;

  afterEach(async () => {
    await close?.();
    close = null;
  });

  describe('emit', () => {
    it('manda o corpo para POST /emitir com x-api-key e devolve o invoiceId do 202', async () => {
      const fake = await fakeNotaas((_, response) =>
        json(response, 202, { queued: true, invoiceId: 'inv-1', status: 'queued' }),
      );
      close = fake.close;

      expect(await fake.client.emit(BODY)).toEqual({ kind: 'queued', providerInvoiceId: 'inv-1' });
      expect(fake.received[0]).toMatchObject({ method: 'POST', url: '/api/v1/emitir' });
      expect(fake.received[0].headers['x-api-key']).toBe('chave-homologacao');
      expect(JSON.parse(fake.received[0].body)).toEqual(BODY);
    });

    // Spec 023, decisao A2: 4xx e recusa antes de enfileirar — nada foi criado.
    it('400 e 422 viram recusa com a mensagem crua, sem excecao', async () => {
      const fake = await fakeNotaas((request, response) =>
        request.body.includes('ord-1')
          ? json(response, 400, { error: 'tomador.nome obrigatorio' })
          : json(response, 422, { error: 'Certificado ausente', errorCode: 'CERT_MISSING' }),
      );
      close = fake.close;

      expect(await fake.client.emit(BODY)).toEqual({
        kind: 'rejected',
        message: expect.stringContaining('tomador.nome obrigatorio'),
      });
      expect(await fake.client.emit({ ...BODY, referencia: 'ord-2' })).toEqual({
        kind: 'rejected',
        message: expect.stringContaining('CERT_MISSING'),
      });
    });

    // Spec 023, decisao A2: a chamada saiu e a resposta nao chegou.
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
    it('traduz a NFS-e emitida', async () => {
      const fake = await fakeNotaas((_, response) =>
        json(response, 200, {
          status: 'issued',
          chNFSe: CHAVE,
          numeroNfe: '12',
          emittedAt: '2026-10-06T12:00:02-03:00',
          ambiente: 'producao',
          documentsCached: true,
          pdfUrl: 'https://cdn.notaas.com.br/x.pdf',
        }),
      );
      close = fake.close;

      expect(await fake.client.status('inv-1')).toEqual({
        providerInvoiceId: 'inv-1',
        status: 'issued',
        environment: 'producao',
        number: '12',
        series: null,
        accessKey: CHAVE,
        protocol: null,
        issuedAt: new Date('2026-10-06T15:00:02.000Z'),
        cancelledAt: null,
        errorDetail: null,
      });
      expect(fake.received[0].url).toBe('/api/v1/invoices/inv-1/status');
    });

    // Decisao N5: a documentacao usa os dois nomes.
    it('le nNFSe e issuedAt quando vem com esses nomes', async () => {
      const fake = await fakeNotaas((_, response) =>
        json(response, 200, {
          status: 'issued',
          chNFSe: CHAVE,
          nNFSe: '00013',
          issuedAt: '2026-10-06T15:00:00.000Z',
        }),
      );
      close = fake.close;

      expect(await fake.client.status('inv-1')).toMatchObject({
        number: '00013',
        environment: null,
        issuedAt: new Date('2026-10-06T15:00:00.000Z'),
      });
    });

    it('junta errorCode, errorMessage e os erros do sistema nacional', async () => {
      const fake = await fakeNotaas((_, response) =>
        json(response, 200, {
          status: 'error',
          errorCode: 'E0540',
          errorMessage: 'Inconsistencia de tributacao ISSQN',
          errors: [{ Codigo: 'E0540', Descricao: 'Servico nao tributavel', Complemento: 'cTribNac 080201' }],
        }),
      );
      close = fake.close;

      expect((await fake.client.status('inv-1')).errorDetail).toBe(
        'E0540 - Inconsistencia de tributacao ISSQN - E0540: Servico nao tributavel (cTribNac 080201)',
      );
    });

    it('le o instante do cancelamento', async () => {
      const fake = await fakeNotaas((_, response) =>
        json(response, 200, { status: 'cancelled', chNFSe: CHAVE, cancelledAt: '2026-10-06T13:00:00-03:00' }),
      );
      close = fake.close;

      expect((await fake.client.status('inv-1')).cancelledAt).toEqual(new Date('2026-10-06T16:00:00.000Z'));
    });

    it('falha no status lanca, para quem chamou tentar de novo', async () => {
      const fake = await fakeNotaas((_, response) => json(response, 500, { error: 'x' }));
      close = fake.close;

      await expect(fake.client.status('inv-1')).rejects.toThrow('500');
    });
  });

  describe('cancel', () => {
    it('manda invoiceId e motivo para POST /cancelar e aceita o 2xx', async () => {
      const fake = await fakeNotaas((_, response) => json(response, 202, { status: 'cancelling' }));
      close = fake.close;

      expect(await fake.client.cancel('inv-1', 'Venda desfeita: pagamento estornado')).toEqual({
        kind: 'accepted',
      });
      expect(fake.received[0]).toMatchObject({ method: 'POST', url: '/api/v1/cancelar' });
      expect(JSON.parse(fake.received[0].body)).toEqual({
        invoiceId: 'inv-1',
        motivo: 'Venda desfeita: pagamento estornado',
      });
    });

    // Decisao N7: recusa que fala em prazo e o estorno fora do prazo.
    it('recusa por prazo vira expirado', async () => {
      const fake = await fakeNotaas((_, response) =>
        json(response, 422, { error: 'Prazo de cancelamento expirado' }),
      );
      close = fake.close;

      expect((await fake.client.cancel('inv-1', 'motivo')).kind).toBe('expired');
    });

    it('outra recusa vira recusa', async () => {
      const fake = await fakeNotaas((_, response) => json(response, 409, { error: 'Status diferente de issued' }));
      close = fake.close;

      expect(await fake.client.cancel('inv-1', 'motivo')).toEqual({
        kind: 'refused',
        message: expect.stringContaining('Status diferente de issued'),
      });
    });
  });

  describe('documentos', () => {
    it('baixa o DANFSe em PDF com a chave da API', async () => {
      const fake = await fakeNotaas((_, response) => {
        response.writeHead(200, { 'Content-Type': 'application/pdf' });
        response.end(Buffer.from('%PDF-1.4 danfse'));
      });
      close = fake.close;

      expect((await fake.client.downloadPdf('inv-1')).toString()).toBe('%PDF-1.4 danfse');
      expect(fake.received[0].url).toBe('/api/v1/invoices/inv-1/pdf');
      expect(fake.received[0].headers['x-api-key']).toBe('chave-homologacao');
    });

    it('baixa o XML da emissao e o do cancelamento', async () => {
      const fake = await fakeNotaas((_, response) => {
        response.writeHead(200, { 'Content-Type': 'application/xml' });
        response.end('<NFSe/>');
      });
      close = fake.close;

      await fake.client.downloadXml('inv-1');
      await fake.client.downloadXml('inv-1', 'cancel');

      expect(fake.received.map((r) => r.url)).toEqual([
        '/api/v1/invoices/inv-1/xml',
        '/api/v1/invoices/inv-1/xml?type=cancel',
      ]);
    });

    // Decisao N6: o CDN e publico, e a chave so vai a API.
    it('segue o 302 para o CDN sem mandar a chave da API', async () => {
      const fake = await fakeNotaas((request, response) => {
        if (request.url.startsWith('/api/v1/')) {
          response.writeHead(302, { Location: `http://${request.headers.host}/cdn/inv-1.pdf` });
          response.end();
        } else {
          response.writeHead(200, { 'Content-Type': 'application/pdf' });
          response.end(Buffer.from('%PDF cdn'));
        }
      });
      close = fake.close;

      expect((await fake.client.downloadPdf('inv-1')).toString()).toBe('%PDF cdn');
      expect(fake.received.map((r) => r.url)).toEqual(['/api/v1/invoices/inv-1/pdf', '/cdn/inv-1.pdf']);
      expect(fake.received[1].headers['x-api-key']).toBeUndefined();
    });

    it('documento que nao baixou lanca', async () => {
      const fake = await fakeNotaas((_, response) => json(response, 409, { error: 'nao emitida' }));
      close = fake.close;

      await expect(fake.client.downloadPdf('inv-1')).rejects.toThrow('409');
    });
  });
});

