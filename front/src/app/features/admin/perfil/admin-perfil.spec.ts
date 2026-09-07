import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { AdminPerfil } from './admin-perfil';

const ME = `${environment.apiUrl}/users/me`;

const PROFILE = {
  id: 'uid-admin',
  email: 'admin@delcastanher.com',
  name: 'Admin Teste',
  bio: 'Responsavel pela plataforma.',
  phone: '(11) 90000-0000',
  linkedin: null,
  onboardingCompleted: true,
};

describe('AdminPerfil', () => {
  let fixture: ComponentFixture<AdminPerfil>;
  let backend: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();

    await TestBed.configureTestingModule({
      imports: [AdminPerfil],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminPerfil);
    backend = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    backend.expectOne({ method: 'GET', url: ME }).flush(PROFILE);
    fixture.detectChanges();
  });

  afterEach(() => backend.verify());

  it('monta o formulario de perfil dentro do painel administrativo', () => {
    const text: string = fixture.nativeElement.textContent;

    expect(fixture.nativeElement.querySelector('app-admin-layout')).not.toBeNull();
    expect(text).toContain('Meu Perfil');
    expect(text).toContain('admin@delcastanher.com');
  });

  it('devolve o admin para o painel, e nao para o hub do aluno', () => {
    const back: HTMLAnchorElement = fixture.nativeElement.querySelector('ui-back-link a');

    expect(back.getAttribute('href')).toBe('/admin');
    expect(back.textContent).toContain('Voltar ao Painel');
  });

  it('leva para a aba escolhida do dashboard, que nao tem rota propria', () => {
    const router = TestBed.inject(Router);
    const navigate = spyOn(router, 'navigate').and.resolveTo(true);

    fixture.componentInstance.openDashboardTab('aulas');

    expect(navigate).toHaveBeenCalledWith(['/admin'], { queryParams: { tab: 'aulas' } });
  });

  it('ignora a selecao vazia, que e o estado "nenhuma aba ativa"', () => {
    const router = TestBed.inject(Router);
    const navigate = spyOn(router, 'navigate').and.resolveTo(true);

    fixture.componentInstance.openDashboardTab('');

    expect(navigate).not.toHaveBeenCalled();
  });
});
