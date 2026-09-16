import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { AdminUserListResult, AdminUsersService } from './admin-users.service';

const ITEM = {
  id: 'uid-ana',
  name: 'Ana Silva',
  email: 'ana@empresa.com',
  initials: 'AS',
  role: 'aluno' as const,
  blocked: false,
  onboardingCompleted: true,
  createdAt: '2026-08-10T12:00:00.000Z',
  lastSeenAt: '2026-09-14T12:00:00.000Z',
  completedLessons: 3,
  totalLessons: 12,
  percentage: 25,
  currentModuleOrder: 2,
  currentModuleTitle: 'Diagnóstico',
  courseCompleted: false,
};

const RESULT: AdminUserListResult = {
  items: [ITEM],
  total: 37,
  page: 1,
  pageSize: 20,
  kpis: { totalStudents: 10, activeStudents: 7, engagementRate: 50, windowDays: 30 },
};

describe('AdminUsersService', () => {
  let service: AdminUsersService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(AdminUsersService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    service.clear();
  });

  it('guarda itens, total e KPIs da pagina carregada', () => {
    service.load().subscribe();

    http.expectOne(request => request.url === `${environment.apiUrl}/admin/users`).flush(RESULT);

    expect(service.items().length).toBe(1);
    expect(service.total()).toBe(37);
    expect(service.kpis()?.engagementRate).toBe(50);
  });

  it('calcula o total de paginas pelo tamanho da pagina', () => {
    service.load().subscribe();

    http.expectOne(request => request.url.includes('/admin/users')).flush(RESULT);

    // 37 linhas em paginas de 20 sao duas paginas.
    expect(service.totalPages()).toBe(2);
  });

  it('nunca devolve zero pagina, para a tela nao dizer "0 de 0"', () => {
    service.load().subscribe();

    http
      .expectOne(request => request.url.includes('/admin/users'))
      .flush({ ...RESULT, items: [], total: 0 });

    expect(service.totalPages()).toBe(1);
    expect(service.empty()).toBe(true);
  });

  it('manda o filtro na query string', () => {
    service.setQuery({ search: 'ana', role: 'admin', status: 'bloqueado', sort: 'acesso' }).subscribe();

    const request = http.expectOne(req => req.url.includes('/admin/users'));

    expect(request.request.params.get('search')).toBe('ana');
    expect(request.request.params.get('role')).toBe('admin');
    expect(request.request.params.get('status')).toBe('bloqueado');
    expect(request.request.params.get('sort')).toBe('acesso');
    request.flush(RESULT);
  });

  // A API recusa valor fora do conjunto, e `role=` seria exatamente isso.
  it('omite os filtros vazios em vez de mandar parametro em branco', () => {
    service.load().subscribe();

    const request = http.expectOne(req => req.url.includes('/admin/users'));

    expect(request.request.params.has('search')).toBe(false);
    expect(request.request.params.has('role')).toBe(false);
    expect(request.request.params.has('status')).toBe(false);
    request.flush(RESULT);
  });

  it('omite busca que so tem espaco', () => {
    service.setQuery({ search: '   ' }).subscribe();

    const request = http.expectOne(req => req.url.includes('/admin/users'));

    expect(request.request.params.has('search')).toBe(false);
    request.flush(RESULT);
  });

  // Continuar na pagina 4 com um filtro novo costuma cair em uma lista vazia
  // que parece erro.
  it('volta para a primeira pagina quando o filtro muda', () => {
    service.setQuery({ page: 3 }).subscribe();
    http.expectOne(req => req.url.includes('/admin/users')).flush(RESULT);

    service.setQuery({ search: 'ana' }).subscribe();
    const request = http.expectOne(req => req.url.includes('/admin/users'));

    expect(request.request.params.get('page')).toBe('1');
    request.flush(RESULT);
  });

  it('respeita a pagina pedida explicitamente', () => {
    service.setQuery({ page: 3 }).subscribe();

    const request = http.expectOne(req => req.url.includes('/admin/users'));

    expect(request.request.params.get('page')).toBe('3');
    request.flush(RESULT);
  });

  // Apagar as linhas no erro trocaria um problema de rede por uma tela vazia
  // que parece dizer "nao ha alunos".
  it('mantem a lista anterior visivel quando a consulta falha', () => {
    service.load().subscribe();
    http.expectOne(req => req.url.includes('/admin/users')).flush(RESULT);

    service.load().subscribe({ error: () => undefined });
    http
      .expectOne(req => req.url.includes('/admin/users'))
      .flush({ message: 'falhou' }, { status: 500, statusText: 'Server Error' });

    expect(service.items().length).toBe(1);
    expect(service.error()).toBeTruthy();
    expect(service.loading()).toBe(false);
  });

  it('traduz a falta de conexao em mensagem legivel', () => {
    service.load().subscribe({ error: () => undefined });

    http
      .expectOne(req => req.url.includes('/admin/users'))
      .error(new ProgressEvent('error'), { status: 0 });

    expect(service.error()).toContain('servidor');
  });

  it('traduz o 403 em mensagem de area restrita', () => {
    service.load().subscribe({ error: () => undefined });

    http
      .expectOne(req => req.url.includes('/admin/users'))
      .flush({ message: 'nao' }, { status: 403, statusText: 'Forbidden' });

    expect(service.error()).toContain('administradores');
  });

  it('pede o detalhe do aluno', () => {
    service.detail('uid-ana').subscribe();

    const request = http.expectOne(`${environment.apiUrl}/admin/users/uid-ana`);

    expect(request.request.method).toBe('GET');
    request.flush({ id: 'uid-ana' });
  });

  it('troca o papel por PATCH', () => {
    service.setRole('uid-ana', 'admin').subscribe();

    const request = http.expectOne(`${environment.apiUrl}/admin/users/uid-ana/role`);

    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ role: 'admin' });
    request.flush(null);
  });

  it('bloqueia por PATCH', () => {
    service.setBlocked('uid-ana', true).subscribe();

    const request = http.expectOne(`${environment.apiUrl}/admin/users/uid-ana/status`);

    expect(request.request.body).toEqual({ blocked: true });
    request.flush(null);
  });

  it('propaga o 409 de agir sobre a propria conta', () => {
    let message = '';
    service.setRole('uid-admin', 'aluno').subscribe({ error: (error: string) => (message = error) });

    http
      .expectOne(`${environment.apiUrl}/admin/users/uid-admin/role`)
      .flush({ message: 'Voce nao pode mudar o proprio papel.' }, { status: 409, statusText: 'Conflict' });

    expect(message).toContain('proprio papel');
  });

  // Spec 013, decisao 13: o arquivo vem pronto do servidor, com o mesmo
  // filtro da tela — montar aqui exigiria varrer todas as paginas.
  it('baixa o CSV com o filtro corrente, como blob', () => {
    service.setQuery({ search: 'ana' }).subscribe();
    http.expectOne(req => req.url.endsWith('/admin/users')).flush(RESULT);

    service.exportCsv().subscribe();
    const request = http.expectOne(req => req.url.endsWith('/admin/users/export'));

    expect(request.request.params.get('search')).toBe('ana');
    expect(request.request.responseType).toBe('blob');
    request.flush(new Blob(['a;b']));
  });

  it('esquece o estado ao limpar', () => {
    service.setQuery({ search: 'ana', page: 2 }).subscribe();
    http.expectOne(req => req.url.includes('/admin/users')).flush(RESULT);

    service.clear();

    expect(service.items()).toEqual([]);
    expect(service.query().search).toBe('');
    expect(service.query().page).toBe(1);
  });
});
