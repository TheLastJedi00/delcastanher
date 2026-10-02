import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CampaignView, EmailSegmentView } from '../../../core/services/admin-email.service';
import { AdminComunicacao } from './admin-comunicacao';

const SEGMENTS: EmailSegmentView[] = [
  { id: 'ALL_ACTIVE', label: 'Todos os alunos ativos', count: 42 },
  { id: 'INACTIVE_7D', label: 'Alunos que não acessam há 7 dias', count: 9 },
  { id: 'COMPLETED', label: 'Alunos que concluíram o curso', count: 3 },
];

const CAMPAIGN: CampaignView = {
  id: 'cmp-1',
  subject: 'Aula nova no ar',
  segment: 'INACTIVE_7D',
  createdByEmail: 'admin@delcastanher.com',
  status: 'PARTIAL',
  recipientCount: 9,
  sentCount: 7,
  failedCount: 2,
  createdAt: '2026-10-01T15:00:00.000Z',
  finishedAt: '2026-10-01T15:00:05.000Z',
};

/** Spec 023, decisoes B2, B4 e B6. */
describe('AdminComunicacao', () => {
  let fixture: ComponentFixture<AdminComunicacao>;
  let backend: HttpTestingController;

  const el = () => fixture.nativeElement as HTMLElement;
  const text = () => el().textContent ?? '';
  const button = (label: string) =>
    Array.from(el().querySelectorAll('button')).find(candidate =>
      candidate.textContent?.includes(label),
    ) as HTMLButtonElement | undefined;

  function type(selector: string, value: string): void {
    const field = el().querySelector(selector) as HTMLInputElement | HTMLTextAreaElement;

    field.value = value;
    field.dispatchEvent(new Event('input'));
  }

  function flushLoad(campaigns: CampaignView[] = []): void {
    backend.expectOne(req => req.url.endsWith('/admin/email/segments')).flush(SEGMENTS);
    backend.expectOne(req => req.method === 'GET' && req.url.endsWith('/admin/email/campaigns')).flush(campaigns);
    fixture.detectChanges();
  }

  function render(campaigns: CampaignView[] = []): void {
    TestBed.configureTestingModule({
      imports: [AdminComunicacao],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    fixture = TestBed.createComponent(AdminComunicacao);
    backend = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    flushLoad(campaigns);
  }

  function fill(subject = 'Aula nova', body = 'Olá!\n\nVeja a aula nova.'): void {
    type('input', subject);
    type('textarea', body);
    fixture.detectChanges();
  }

  afterEach(() => backend.verify());

  it('não mostra mais o aviso de área em construção', () => {
    render();

    expect(text()).not.toContain('Área em construção');
    expect(text()).not.toContain('maquete');
  });

  it('mostra os segmentos com a contagem de destinatários', () => {
    render();

    const options = Array.from(el().querySelectorAll('option')).map(option => option.textContent?.trim());

    expect(options).toEqual([
      'Todos os alunos ativos (42)',
      'Alunos que não acessam há 7 dias (9)',
      'Alunos que concluíram o curso (3)',
    ]);
    expect(el().querySelector('[data-testid="contagem"]')?.textContent).toContain('42 pessoa(s)');
  });

  it('não envia nada com assunto ou corpo vazios', () => {
    render();

    button('Disparar Campanha')?.click();
    button('Enviar Teste')?.click();
    fixture.detectChanges();

    expect(text()).toContain('Informe o assunto.');
    expect(el().querySelector('[data-testid="confirmacao"]')).toBeNull();
    backend.expectNone(req => req.method === 'POST');
  });

  it('envia o teste com o rascunho e diz para quem foi', () => {
    render();
    fill();

    button('Enviar Teste')?.click();

    const request = backend.expectOne(req => req.url.endsWith('/admin/email/test'));

    expect(request.request.body).toEqual({
      segment: 'ALL_ACTIVE',
      subject: 'Aula nova',
      body: 'Olá!\n\nVeja a aula nova.',
    });
    request.flush({ sentTo: 'admin@delcastanher.com' });
    fixture.detectChanges();

    expect(el().querySelector('[data-testid="feedback"]')?.textContent).toContain(
      'Teste enviado para admin@delcastanher.com',
    );
  });

  // Decisao B4: so depois da confirmacao com o numero de destinatarios.
  it('o disparo só sai depois da confirmação com o número de destinatários', () => {
    render();
    fill();

    const select = el().querySelector('select') as HTMLSelectElement;

    select.value = 'INACTIVE_7D';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    button('Disparar Campanha')?.click();
    fixture.detectChanges();

    backend.expectNone(req => req.url.endsWith('/admin/email/campaigns') && req.method === 'POST');
    expect(el().querySelector('[data-testid="confirmacao"]')?.textContent).toContain('9 pessoa(s)');

    button('Disparar agora')?.click();

    const request = backend.expectOne(
      req => req.method === 'POST' && req.url.endsWith('/admin/email/campaigns'),
    );

    expect(request.request.body.segment).toBe('INACTIVE_7D');
    request.flush({ ...CAMPAIGN, status: 'SENT', sentCount: 9, failedCount: 0 });
    flushLoad([{ ...CAMPAIGN, status: 'SENT' }]);

    expect(el().querySelector('[data-testid="confirmacao"]')).toBeNull();
    expect(el().querySelector('[data-testid="feedback"]')?.textContent).toContain('9 pessoa(s)');
  });

  it('cancelar a confirmação não dispara', () => {
    render();
    fill();

    button('Disparar Campanha')?.click();
    fixture.detectChanges();
    button('Cancelar')?.click();
    fixture.detectChanges();

    expect(el().querySelector('[data-testid="confirmacao"]')).toBeNull();
    backend.expectNone(req => req.method === 'POST');
  });

  it('mostra a recusa do servidor', () => {
    render();
    fill();

    button('Enviar Teste')?.click();
    backend
      .expectOne(req => req.url.endsWith('/admin/email/test'))
      .flush({ message: 'RESEND_API_KEY nao configurada.' }, { status: 500, statusText: 'Erro' });
    fixture.detectChanges();

    expect(el().querySelector('[data-testid="erro"]')?.textContent).toContain('RESEND_API_KEY');
  });

  it('o histórico lista as campanhas com os totais', () => {
    render([CAMPAIGN]);

    const row = el().querySelector('[data-testid="historico"] tbody tr')?.textContent ?? '';

    expect(row).toContain('Aula nova no ar');
    expect(row).toContain('Alunos que não acessam há 7 dias');
    expect(row).toContain('admin@delcastanher.com');
    expect(row).toContain('9');
    expect(row).toContain('7');
    expect(row).toContain('2');
    expect(row).toContain('Parcial');
  });

  it('retoma o envio da campanha parcial', () => {
    render([CAMPAIGN]);

    button('Retomar envio')?.click();

    backend
      .expectOne(req => req.url.endsWith('/admin/email/campaigns/cmp-1/resume'))
      .flush({ ...CAMPAIGN, status: 'SENT', sentCount: 9, failedCount: 0 });
    flushLoad([{ ...CAMPAIGN, status: 'SENT' }]);

    expect(text()).toContain('todas as entregas saíram');
    expect(button('Retomar envio')).toBeUndefined();
  });

  it('sem campanhas, diz que nenhuma foi disparada', () => {
    render();

    expect(el().querySelector('[data-testid="historico-vazio"]')).not.toBeNull();
  });
});
