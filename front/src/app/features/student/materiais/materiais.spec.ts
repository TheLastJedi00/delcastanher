import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { Materiais } from './materiais';

const MATERIALS_URL = `${environment.apiUrl}/materials`;

function material(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'mat-1',
    fileName: 'Checklist.pdf',
    fileType: 'pdf',
    contentType: 'application/pdf',
    sizeBytes: 850 * 1024,
    order: 0,
    moduleId: 'mod-1',
    moduleOrder: 1,
    moduleTitle: 'Fundamentos',
    lessonId: 'les-1',
    lessonOrder: 1,
    lessonTitle: 'O papel do RH',
    downloadUrl: 'https://storage.googleapis.com/leitura',
    downloadExpiresAt: '2026-09-11T12:15:00.000Z',
    ...overrides,
  };
}

describe('Materiais', () => {
  let fixture: ComponentFixture<Materiais>;
  let backend: HttpTestingController;

  const el = () => fixture.nativeElement as HTMLElement;
  const text = () => el().textContent ?? '';

  const create = async () => {
    await TestBed.configureTestingModule({
      imports: [Materiais],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(Materiais);
    backend = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  };

  const respond = (body: unknown[]) => {
    backend.expectOne(MATERIALS_URL).flush(body);
    fixture.detectChanges();
  };

  afterEach(() => {
    backend.verify();
    TestBed.resetTestingModule();
  });

  it('agrupa os materiais por modulo e aula', async () => {
    await create();
    respond([
      material(),
      material({ id: 'mat-2', fileName: 'Planilha.xlsx', fileType: 'xls' }),
      material({
        id: 'mat-3',
        fileName: 'Mapa.pdf',
        lessonId: 'les-2',
        lessonOrder: 2,
        lessonTitle: 'Maturidade de RH',
      }),
    ]);

    const headings = Array.from(el().querySelectorAll('h3')).map(h => h.textContent?.trim());

    expect(headings).toEqual([
      'Aula 1 · O papel do RH',
      'Aula 2 · Maturidade de RH',
    ]);
    expect(text()).toContain('Módulo 1 · Fundamentos');
  });

  it('mantem os materiais da mesma aula no mesmo grupo', async () => {
    await create();
    respond([material(), material({ id: 'mat-2', fileName: 'Planilha.xlsx' })]);

    expect(el().querySelectorAll('section').length).toBe(1);
    expect(text()).toContain('Checklist.pdf');
    expect(text()).toContain('Planilha.xlsx');
  });

  it('usa a URL assinada vinda da API no link de download', async () => {
    await create();
    respond([material()]);

    const link = Array.from(el().querySelectorAll('a')).find(
      anchor => anchor.getAttribute('href') === 'https://storage.googleapis.com/leitura',
    );

    expect(link).toBeTruthy();
    expect(text()).toContain('850 KB');
  });

  it('diz quando nao ha material publicado', async () => {
    await create();
    respond([]);

    expect(text()).toContain('Nenhum material publicado ainda');
  });

  it('mostra o erro da API com opcao de tentar de novo', async () => {
    await create();
    backend
      .expectOne(MATERIALS_URL)
      .flush({ message: 'Falha ao carregar.' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(text()).toContain('Falha ao carregar.');
    expect(text()).toContain('Tentar novamente');
  });
});
