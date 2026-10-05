import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { MailError, MailService, RESEND_BATCH_LIMIT } from './mail.service';

const CONFIG: Record<string, string> = {
  RESEND_API_KEY: 're_chave_de_teste',
  EMAIL_FROM: 'Lidiane Delcastanher <contato@mail.delcastanher.srv.br>',
};

interface FetchCall {
  url: string;
  init: RequestInit & { headers: Record<string, string> };
  body: unknown;
}

/** `fetch` falso que devolve um id por mensagem, como o Resend. */
function fakeFetch(respond?: (call: FetchCall, index: number) => { status: number; json: unknown }) {
  const calls: FetchCall[] = [];

  const mock = jest.fn(async (url: string, init: FetchCall['init']) => {
    const body = JSON.parse(String(init.body));
    const call = { url, init, body };

    calls.push(call);

    const answer = respond?.(call, calls.length - 1) ?? {
      status: 200,
      json: Array.isArray(body)
        ? { data: body.map((_: unknown, i: number) => ({ id: `re-${calls.length}-${i}` })) }
        : { id: `re-${calls.length}` },
    };

    return {
      ok: answer.status >= 200 && answer.status < 300,
      status: answer.status,
      json: async () => answer.json,
      text: async () => JSON.stringify(answer.json),
    };
  });

  global.fetch = mock as unknown as typeof fetch;

  return { mock, calls };
}

async function build(config: Record<string, string> = CONFIG) {
  const moduleRef = await Test.createTestingModule({
    providers: [
      MailService,
      { provide: ConfigService, useValue: { get: (key: string) => config[key] } },
    ],
  }).compile();

  return moduleRef.get(MailService);
}

const MESSAGE = {
  to: 'aluno@delcastanher.com',
  subject: 'Aula nova',
  html: '<p>Ola</p>',
  text: 'Ola',
};

/** Spec 023, decisao B1: um `MailService` unico para a nota e as campanhas. */
describe('MailService', () => {
  const realFetch = global.fetch;

  afterEach(() => {
    global.fetch = realFetch;
  });

  describe('send — envio unitario', () => {
    it('chama POST /emails do Resend com a chave e o remetente configurado', async () => {
      const { calls } = fakeFetch();
      const mail = await build();

      const result = await mail.send(MESSAGE);

      expect(result).toEqual({ id: 're-1' });
      expect(calls[0].url).toBe('https://api.resend.com/emails');
      expect(calls[0].init.method).toBe('POST');
      expect(calls[0].init.headers.Authorization).toBe('Bearer re_chave_de_teste');
      expect(calls[0].body).toMatchObject({
        from: 'Lidiane Delcastanher <contato@mail.delcastanher.srv.br>',
        to: ['aluno@delcastanher.com'],
        subject: 'Aula nova',
        html: '<p>Ola</p>',
        text: 'Ola',
      });
    });

    it('manda os anexos em base64', async () => {
      const { calls } = fakeFetch();
      const mail = await build();

      await mail.send({
        ...MESSAGE,
        attachments: [{ filename: 'nota.pdf', content: Buffer.from('%PDF-1.4') }],
      });

      expect(calls[0].body).toMatchObject({
        attachments: [{ filename: 'nota.pdf', content: Buffer.from('%PDF-1.4').toString('base64') }],
      });
    });

    it('repassa os cabecalhos e a chave de idempotencia', async () => {
      const { calls } = fakeFetch();
      const mail = await build();

      await mail.send({ ...MESSAGE, headers: { 'X-Teste': '1' }, idempotencyKey: 'nota-123' });

      expect(calls[0].body).toMatchObject({ headers: { 'X-Teste': '1' } });
      expect(calls[0].init.headers['Idempotency-Key']).toBe('nota-123');
    });

    it('sem cabecalhos, nao manda o campo headers', async () => {
      const { calls } = fakeFetch();
      const mail = await build();

      await mail.send(MESSAGE);

      expect(calls[0].body).not.toHaveProperty('headers');
    });

    it('recusa do Resend vira MailError com o status e a mensagem crua', async () => {
      fakeFetch(() => ({ status: 422, json: { message: 'Invalid `to` field.' } }));
      const mail = await build();

      await expect(mail.send(MESSAGE)).rejects.toMatchObject({
        name: 'MailError',
        status: 422,
        message: expect.stringContaining('Invalid `to` field.'),
      });
    });

    it('sem RESEND_API_KEY, falha com o nome da variavel e sem chamar a rede', async () => {
      const { mock } = fakeFetch();
      const mail = await build({ EMAIL_FROM: CONFIG.EMAIL_FROM });

      await expect(mail.send(MESSAGE)).rejects.toThrow('RESEND_API_KEY');
      expect(mock).not.toHaveBeenCalled();
    });
  });

  describe('sendBatch — envio em lote', () => {
    const many = (count: number) =>
      Array.from({ length: count }, (_, i) => ({ ...MESSAGE, to: `aluno${i}@delcastanher.com` }));

    it('parte em lotes de 100, o limite do Resend', async () => {
      expect(RESEND_BATCH_LIMIT).toBe(100);

      const { calls } = fakeFetch();
      const mail = await build();

      const results = await mail.sendBatch(many(230));

      expect(calls.map((call) => call.url)).toEqual([
        'https://api.resend.com/emails/batch',
        'https://api.resend.com/emails/batch',
        'https://api.resend.com/emails/batch',
      ]);
      expect(calls.map((call) => (call.body as unknown[]).length)).toEqual([100, 100, 30]);
      expect(results).toHaveLength(230);
      expect(results[0]).toEqual({ id: 're-1-0' });
      expect(results[229]).toEqual({ id: 're-3-29' });
    });

    it('um lote recusado vira erro nas mensagens dele, e os outros seguem', async () => {
      fakeFetch((call, index) =>
        index === 0
          ? { status: 500, json: { message: 'internal' } }
          : { status: 200, json: { data: (call.body as unknown[]).map((_, i) => ({ id: `ok-${i}` })) } },
      );
      const mail = await build();

      const results = await mail.sendBatch(many(150));

      expect(results.slice(0, 100).every((r) => 'error' in r)).toBe(true);
      expect(results[0]).toEqual({ error: expect.stringContaining('internal') });
      expect(results[100]).toEqual({ id: 'ok-0' });
    });

    it('usa a chave de idempotencia de cada lote', async () => {
      const { calls } = fakeFetch();
      const mail = await build();

      await mail.sendBatch(many(150), (index) => `campanha-1-lote-${index}`);

      expect(calls[0].init.headers['Idempotency-Key']).toBe('campanha-1-lote-0');
      expect(calls[1].init.headers['Idempotency-Key']).toBe('campanha-1-lote-1');
    });

    it('lista vazia nao chama a rede', async () => {
      const { mock } = fakeFetch();
      const mail = await build();

      expect(await mail.sendBatch([])).toEqual([]);
      expect(mock).not.toHaveBeenCalled();
    });
  });

  it('MailError e exportado para quem precisa distinguir recusa de bug', () => {
    expect(new MailError('x', 400)).toBeInstanceOf(Error);
  });
});
