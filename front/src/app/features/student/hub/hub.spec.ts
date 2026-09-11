import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { CourseProgress } from '../../../core/services/progress.service';
import { Hub } from './hub';

const PROGRESS_URL = `${environment.apiUrl}/progress/me`;

const MODULES = [
  { id: 'm1', order: 1, title: 'Fundamentos', summary: 'Resumo 1', completed: false },
  { id: 'm2', order: 2, title: 'Diagnóstico', summary: 'Resumo 2', completed: false },
  { id: 'm3', order: 3, title: 'Recrutamento', summary: 'Resumo 3', completed: false },
  { id: 'm4', order: 4, title: 'Onboarding', summary: 'Resumo 4', completed: false },
];

function progress(completedIds: string[]): CourseProgress {
  const modules = MODULES.map(module => ({
    ...module,
    completed: completedIds.includes(module.id),
    hasVideo: true,
    videoReady: true,
  }));
  const completedCount = modules.filter(module => module.completed).length;

  return {
    course: { slug: 'imersao-rh', title: 'Imersão RH Estratégico', workloadHours: null },
    modules,
    completedCount,
    totalCount: modules.length,
    percentage: Math.round((completedCount / modules.length) * 100),
    nextModule: modules.find(module => !module.completed) ?? null,
    completed: completedCount === modules.length,
  };
}

describe('Hub', () => {
  let fixture: ComponentFixture<Hub>;
  let backend: HttpTestingController;

  const el = () => fixture.nativeElement as HTMLElement;
  const text = () => el().textContent ?? '';
  const resumeHref = () =>
    Array.from(el().querySelectorAll('a'))
      .map(anchor => anchor.getAttribute('href'))
      .find(href => href?.includes('/ava/trilha') || href?.includes('/ava/certificado'));

  const create = async () => {
    await TestBed.configureTestingModule({
      imports: [Hub],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(Hub);
    backend = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  };

  /** Responde a carga do progresso e o perfil, se a tela tiver pedido. */
  const respond = (body: CourseProgress) => {
    backend.expectOne(PROGRESS_URL).flush(body);
    fixture.detectChanges();
  };

  afterEach(() => {
    backend.verify();
    TestBed.resetTestingModule();
  });

  it('mostra o percentual e a contagem de modulos concluidos', async () => {
    await create();
    respond(progress(['m1']));

    expect(text()).toContain('25%');
    expect(text()).toContain('1 de 4 módulos concluídos');
  });

  it('destaca o proximo modulo em aberto', async () => {
    await create();
    respond(progress(['m1', 'm2']));

    expect(text()).toContain('Próxima aula');
    expect(text()).toContain('Recrutamento');
  });

  it('aponta o CTA de retomada para o deep-link do modulo em aberto', async () => {
    await create();
    respond(progress(['m1']));

    expect(text()).toContain('Retomar curso');
    expect(resumeHref()).toBe('/ava/trilha/m2');
  });

  it('sem nenhum modulo concluido o CTA convida a comecar, no primeiro modulo', async () => {
    await create();
    respond(progress([]));

    expect(text()).toContain('Começar o curso');
    expect(resumeHref()).toBe('/ava/trilha/m1');
  });

  it('com a trilha concluida o CTA leva ao certificado', async () => {
    await create();
    respond(progress(['m1', 'm2', 'm3', 'm4']));

    expect(text()).toContain('Curso concluído');
    expect(text()).toContain('Emitir certificado');
    expect(resumeHref()).toBe('/ava/certificado');
  });

  it('o card do certificado so aparece depois da conclusao', async () => {
    await create();
    respond(progress(['m1', 'm2', 'm3']));

    expect(text()).not.toContain('Meu Certificado');
  });

  it('mostra a mensagem de erro com opcao de tentar de novo', async () => {
    await create();
    backend.expectOne(PROGRESS_URL).flush(
      { message: 'Falha ao carregar.' },
      { status: 500, statusText: 'Server Error' },
    );
    fixture.detectChanges();

    expect(text()).toContain('Falha ao carregar.');
    expect(text()).toContain('Tentar novamente');
  });
});
