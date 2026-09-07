import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

import { AdminDashboard } from './admin-dashboard';

/** Sobe a tela com os query params informados na URL. */
async function build(queryParams: Record<string, string> = {}): Promise<ComponentFixture<AdminDashboard>> {
  await TestBed.configureTestingModule({
    imports: [AdminDashboard],
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
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

describe('AdminDashboard', () => {
  it('should create', async () => {
    expect((await build()).componentInstance).toBeTruthy();
  });

  it('abre na visao geral quando a URL nao pede uma aba', async () => {
    expect((await build()).componentInstance.activeTab()).toBe('visao-geral');
  });

  it('abre na aba pedida pela URL, como faz o Meu Perfil do painel', async () => {
    expect((await build({ tab: 'aulas' })).componentInstance.activeTab()).toBe('aulas');
  });

  it('ignora uma aba inexistente em vez de abrir a tela vazia', async () => {
    expect((await build({ tab: 'inventada' })).componentInstance.activeTab()).toBe('visao-geral');
  });
});
