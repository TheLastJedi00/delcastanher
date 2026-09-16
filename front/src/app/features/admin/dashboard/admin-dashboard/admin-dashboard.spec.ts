import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthService } from '../../../../core/services/auth.service';
import { AdminUserItem, AdminUsersService } from '../../../../core/services/admin-users.service';

import { AdminDashboard } from './admin-dashboard';

const ANA: AdminUserItem = {
  id: 'uid-ana',
  name: 'Ana Silva',
  email: 'ana@empresa.com',
  initials: 'AS',
  role: 'aluno',
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

/** O proprio administrador logado, que aparece na lista mas nao pode ser alvo. */
const EU: AdminUserItem = {
  ...ANA,
  id: 'uid-admin',
  name: 'Admin',
  email: 'admin@delcastanher.com',
  role: 'admin',
};

const RESULT = {
  items: [ANA],
  total: 37,
  page: 1,
  pageSize: 20,
  kpis: { totalStudents: 10, activeStudents: 7, engagementRate: 50, windowDays: 30 },
};

/** Sobe a tela com os query params informados na URL. */
async function build(queryParams: Record<string, string> = {}): Promise<ComponentFixture<AdminDashboard>> {
  await TestBed.configureTestingModule({
    imports: [AdminDashboard],
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      {
        provide: AuthService,
        useValue: { user: () => ({ uid: 'uid-admin', role: 'admin' }), logout: () => undefined },
      },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { queryParamMap: convertToParamMap(queryParams) } },
      },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(AdminDashboard);

  fixture.detectChanges();

  return fixture;
}

/** Responde a consulta inicial que a tela dispara ao abrir. */
function flushList(http: HttpTestingController, body: object = RESULT) {
  http.match(request => request.url.endsWith('/admin/users')).forEach(request => request.flush(body));
}

describe('AdminDashboard', () => {
  let http: HttpTestingController;

  afterEach(() => {
    http?.verify({ ignoreCancelled: true });
  });

  it('should create', async () => {
    const fixture = await build();
    http = TestBed.inject(HttpTestingController);
    flushList(http);

    expect(fixture.componentInstance).toBeTruthy();
  });

  describe('abas', () => {
    it('abre na visao geral quando a URL nao pede uma aba', async () => {
      const fixture = await build();
      http = TestBed.inject(HttpTestingController);
      flushList(http);

      expect(fixture.componentInstance.activeTab()).toBe('visao-geral');
    });

    it('abre na aba pedida pela URL, como faz o Meu Perfil do painel', async () => {
      const fixture = await build({ tab: 'aulas' });
      http = TestBed.inject(HttpTestingController);
      flushList(http);
      http.match(() => true).forEach(request => request.flush([]));

      expect(fixture.componentInstance.activeTab()).toBe('aulas');
    });

    it('ignora uma aba inexistente em vez de abrir a tela vazia', async () => {
      const fixture = await build({ tab: 'inventada' });
      http = TestBed.inject(HttpTestingController);
      flushList(http);

      expect(fixture.componentInstance.activeTab()).toBe('visao-geral');
    });
  });

  describe('listagem', () => {
    it('carrega a primeira pagina ao abrir', async () => {
      await build();
      http = TestBed.inject(HttpTestingController);

      const request = http.expectOne(req => req.url.endsWith('/admin/users'));

      expect(request.request.params.get('page')).toBe('1');
      request.flush(RESULT);
    });

    // Spec 013, decisao 7: a busca vai ao servidor, mas nao a cada tecla —
    // digitar "mariana" dispararia sete consultas.
    it('adia a busca ate o fim do debounce', fakeAsync(async () => {
      const fixture = await build();
      http = TestBed.inject(HttpTestingController);
      flushList(http);

      fixture.componentInstance.onSearch('a');
      fixture.componentInstance.onSearch('an');
      fixture.componentInstance.onSearch('ana');

      http.expectNone(req => req.url.endsWith('/admin/users'));

      tick(400);

      const request = http.expectOne(req => req.url.endsWith('/admin/users'));
      expect(request.request.params.get('search')).toBe('ana');
      request.flush(RESULT);
    }));

    it('reflete o filtro vindo da URL na consulta inicial', async () => {
      await build({ busca: 'ana', papel: 'admin', situacao: 'bloqueado', pagina: '2' });
      http = TestBed.inject(HttpTestingController);

      const request = http.expectOne(req => req.url.endsWith('/admin/users'));

      expect(request.request.params.get('search')).toBe('ana');
      expect(request.request.params.get('role')).toBe('admin');
      expect(request.request.params.get('status')).toBe('bloqueado');
      expect(request.request.params.get('page')).toBe('2');
      request.flush(RESULT);
    });

    it('inverte a direcao ao clicar duas vezes na mesma coluna', async () => {
      const fixture = await build();
      http = TestBed.inject(HttpTestingController);
      flushList(http);

      fixture.componentInstance.sortBy('acesso');
      flushList(http);
      expect(fixture.componentInstance.ariaSort('acesso')).toBe('ascending');

      fixture.componentInstance.sortBy('acesso');
      flushList(http);
      expect(fixture.componentInstance.ariaSort('acesso')).toBe('descending');
    });

    it('comeca ascendente ao trocar de coluna', async () => {
      const fixture = await build();
      http = TestBed.inject(HttpTestingController);
      flushList(http);

      fixture.componentInstance.sortBy('acesso');
      flushList(http);
      fixture.componentInstance.sortBy('acesso');
      flushList(http);
      fixture.componentInstance.sortBy('progresso');
      flushList(http);

      expect(fixture.componentInstance.ariaSort('progresso')).toBe('ascending');
      expect(fixture.componentInstance.ariaSort('acesso')).toBe('none');
    });

    it('nao passa da ultima pagina', async () => {
      const fixture = await build();
      http = TestBed.inject(HttpTestingController);
      flushList(http);

      // 37 linhas em paginas de 20 sao duas paginas.
      fixture.componentInstance.goToPage(9);
      flushList(http);

      expect(TestBed.inject(AdminUsersService).query().page).toBe(2);
    });

    it('mostra o intervalo da pagina corrente', async () => {
      const fixture = await build();
      http = TestBed.inject(HttpTestingController);
      flushList(http);

      expect(fixture.componentInstance.range()).toEqual({ first: 1, last: 20, total: 37 });
    });

    it('nao mostra "12 / 12" para quem concluiu o curso', async () => {
      const fixture = await build();
      http = TestBed.inject(HttpTestingController);
      flushList(http);

      expect(
        fixture.componentInstance.progressLabel({
          ...ANA,
          courseCompleted: true,
          currentModuleOrder: null,
        }),
      ).toBe('Concluído');
    });

    it('diz "Nunca acessou" no lugar de uma data vazia', async () => {
      const fixture = await build();
      http = TestBed.inject(HttpTestingController);
      flushList(http);

      expect(fixture.componentInstance.formatDate(null)).toBe('Nunca acessou');
    });
  });

  describe('acoes', () => {
    // Spec 013, decisao 10: a regra e do servidor, e a UI a antecipa.
    it('reconhece a propria conta para desabilitar as acoes', async () => {
      const fixture = await build();
      http = TestBed.inject(HttpTestingController);
      flushList(http);

      expect(fixture.componentInstance.isSelf(EU)).toBe(true);
      expect(fixture.componentInstance.isSelf(ANA)).toBe(false);
    });

    it('so age depois da confirmacao', async () => {
      const fixture = await build();
      http = TestBed.inject(HttpTestingController);
      flushList(http);

      fixture.componentInstance.askRole(ANA);

      http.expectNone(req => req.url.includes('/role'));
      expect(fixture.componentInstance.pending()).toBeTruthy();
    });

    it('propoe o papel oposto ao atual', async () => {
      const fixture = await build();
      http = TestBed.inject(HttpTestingController);
      flushList(http);

      fixture.componentInstance.askRole(ANA);
      expect(fixture.componentInstance.pending()).toEqual(
        jasmine.objectContaining({ kind: 'role', role: 'admin' }),
      );

      fixture.componentInstance.askRole(EU);
      expect(fixture.componentInstance.pending()).toEqual(
        jasmine.objectContaining({ kind: 'role', role: 'aluno' }),
      );
    });

    it('confirma a promocao e recarrega a lista', async () => {
      const fixture = await build();
      http = TestBed.inject(HttpTestingController);
      flushList(http);

      fixture.componentInstance.askRole(ANA);
      fixture.componentInstance.confirmAction();

      const patch = http.expectOne(req => req.url.endsWith('/admin/users/uid-ana/role'));
      expect(patch.request.body).toEqual({ role: 'admin' });
      patch.flush(null);

      // Os KPIs do topo tambem mudam com a acao: a pagina inteira recarrega.
      flushList(http);
      expect(fixture.componentInstance.pending()).toBeNull();
    });

    it('confirma o bloqueio pelo estado oposto ao atual', async () => {
      const fixture = await build();
      http = TestBed.inject(HttpTestingController);
      flushList(http);

      fixture.componentInstance.askBlock(ANA);
      fixture.componentInstance.confirmAction();

      const patch = http.expectOne(req => req.url.endsWith('/admin/users/uid-ana/status'));
      expect(patch.request.body).toEqual({ blocked: true });
      patch.flush(null);
      flushList(http);
    });

    it('mantem a confirmacao aberta com a mensagem quando a acao falha', async () => {
      const fixture = await build();
      http = TestBed.inject(HttpTestingController);
      flushList(http);

      fixture.componentInstance.askRole(ANA);
      fixture.componentInstance.confirmAction();

      http
        .expectOne(req => req.url.endsWith('/admin/users/uid-ana/role'))
        .flush({ message: 'Voce nao pode mudar o proprio papel.' }, { status: 409, statusText: 'Conflict' });

      expect(fixture.componentInstance.pending()).toBeTruthy();
      expect(fixture.componentInstance.actionError()).toContain('proprio papel');
      expect(fixture.componentInstance.actionRunning()).toBe(false);
    });

    it('cancela sem chamar a API', async () => {
      const fixture = await build();
      http = TestBed.inject(HttpTestingController);
      flushList(http);

      fixture.componentInstance.askRole(ANA);
      fixture.componentInstance.cancelAction();

      http.expectNone(req => req.url.includes('/role'));
      expect(fixture.componentInstance.pending()).toBeNull();
    });
  });

  describe('detalhe', () => {
    it('carrega o detalhe do aluno da linha', async () => {
      const fixture = await build();
      http = TestBed.inject(HttpTestingController);
      flushList(http);

      fixture.componentInstance.openDetail(ANA, { currentTarget: document.createElement('button') } as unknown as Event);

      const request = http.expectOne(req => req.url.endsWith('/admin/users/uid-ana'));
      request.flush({ id: 'uid-ana', name: 'Ana Silva', modules: [], certificates: [] });

      expect(fixture.componentInstance.detail()?.id).toBe('uid-ana');
      expect(fixture.componentInstance.detailLoading()).toBe(false);
    });

    it('mostra a mensagem quando o detalhe falha, sem abrir o dialogo vazio', async () => {
      const fixture = await build();
      http = TestBed.inject(HttpTestingController);
      flushList(http);

      fixture.componentInstance.openDetail(ANA, { currentTarget: document.createElement('button') } as unknown as Event);

      http
        .expectOne(req => req.url.endsWith('/admin/users/uid-ana'))
        .flush({ message: 'nao encontrado' }, { status: 404, statusText: 'Not Found' });

      expect(fixture.componentInstance.detail()).toBeNull();
      expect(fixture.componentInstance.detailError()).toBeTruthy();
    });

    // Fechar sem devolver o foco deixa quem navega por teclado no inicio da
    // pagina, longe da linha em que estava.
    it('devolve o foco a linha de origem ao fechar', async () => {
      const fixture = await build();
      http = TestBed.inject(HttpTestingController);
      flushList(http);

      const trigger = document.createElement('button');
      document.body.appendChild(trigger);

      fixture.componentInstance.openDetail(ANA, { currentTarget: trigger } as unknown as Event);
      http.expectOne(req => req.url.endsWith('/admin/users/uid-ana')).flush({ id: 'uid-ana' });

      fixture.componentInstance.closeDetail();

      expect(document.activeElement).toBe(trigger);
      trigger.remove();
    });
  });

  describe('exportacao', () => {
    it('baixa o CSV com o filtro corrente', async () => {
      const fixture = await build({ busca: 'ana' });
      http = TestBed.inject(HttpTestingController);
      flushList(http);

      fixture.componentInstance.exportCsv();

      const request = http.expectOne(req => req.url.endsWith('/admin/users/export'));
      expect(request.request.params.get('search')).toBe('ana');
      request.flush(new Blob(['a;b']));

      expect(fixture.componentInstance.exporting()).toBe(false);
    });

    // O arquivo tem de chegar com o nome pedido. Revogar o object URL no
    // mesmo tick do clique faz o navegador salvar com nome temporario, e a
    // planilha some do Downloads sem erro nenhum na tela.
    it('clica um link anexado ao documento e so revoga o URL depois', fakeAsync(async () => {
      const fixture = await build();
      http = TestBed.inject(HttpTestingController);
      flushList(http);

      const link = document.createElement('a');
      spyOn(document, 'createElement').and.returnValue(link);
      spyOn(link, 'click').and.callFake(() => {
        expect(link.isConnected).toBe(true);
        expect(link.download).toMatch(/^alunos-\d{4}-\d{2}-\d{2}\.csv$/);
      });
      const revoke = spyOn(URL, 'revokeObjectURL');

      fixture.componentInstance.exportCsv();
      http.expectOne(req => req.url.endsWith('/admin/users/export')).flush(new Blob(['a;b']));

      expect(link.click).toHaveBeenCalled();
      expect(link.isConnected).toBe(false);
      expect(revoke).not.toHaveBeenCalled();

      tick(1_000);
      expect(revoke).toHaveBeenCalled();
    }));

    it('mostra a mensagem quando a exportacao falha', async () => {
      const fixture = await build();
      http = TestBed.inject(HttpTestingController);
      flushList(http);

      fixture.componentInstance.exportCsv();

      http
        .expectOne(req => req.url.endsWith('/admin/users/export'))
        .flush(new Blob(), { status: 500, statusText: 'Server Error' });

      expect(fixture.componentInstance.actionError()).toBeTruthy();
      expect(fixture.componentInstance.exporting()).toBe(false);
    });
  });
});
