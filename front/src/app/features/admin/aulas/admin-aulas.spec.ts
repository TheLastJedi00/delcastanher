import { HttpEventType, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { environment } from '../../../../environments/environment';
import { AdminAulas } from './admin-aulas';

const MODULES = [
  { id: 'mod-1', order: 1, title: 'Fundamentos', summary: '', completed: false },
  { id: 'mod-2', order: 2, title: 'Diagnóstico', summary: '', completed: false },
];

const PROGRESS_URL = `${environment.apiUrl}/progress/me`;
const VIDEO_URL = `${environment.apiUrl}/admin/modules/mod-1/video`;
const MATERIALS_URL = `${environment.apiUrl}/admin/modules/mod-1/materials`;
const BUCKET_URL = 'https://storage.googleapis.com/assinada';

const SEM_VIDEO = {
  moduleId: 'mod-1',
  hasVideo: false,
  status: null,
  playbackId: null,
  fileName: null,
  sizeBytes: null,
  error: null,
};

const TICKET = {
  storagePath: 'modules/mod-1/video/aula-01.mp4',
  uploadUrl: BUCKET_URL,
  headers: { 'Content-Type': 'video/mp4' },
  expiresAt: '2026-09-11T12:00:00.000Z',
};

/** Carrega os modulos e o estado inicial do primeiro modulo. */
function bootstrap(backend: HttpTestingController, fixture: ComponentFixture<AdminAulas>) {
  backend.expectOne(PROGRESS_URL).flush({ modules: MODULES });
  backend.expectOne(VIDEO_URL).flush(SEM_VIDEO);
  backend.expectOne(MATERIALS_URL).flush([]);
  fixture.detectChanges();
}

describe('AdminAulas', () => {
  let fixture: ComponentFixture<AdminAulas>;
  let backend: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminAulas],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminAulas);
    backend = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => backend.verify());

  it('carrega os modulos e ja seleciona o primeiro', () => {
    bootstrap(backend, fixture);

    const options = fixture.nativeElement.querySelectorAll('option') as NodeListOf<HTMLOptionElement>;
    expect(options.length).toBe(2);
    expect(options[0].textContent).toContain('Fundamentos');
  });

  it('diz que o modulo ainda nao tem video', () => {
    bootstrap(backend, fixture);

    expect(fixture.nativeElement.textContent).toContain('Nenhum vídeo enviado');
  });

  it('mostra o estado do processamento vindo da API', () => {
    backend.expectOne(PROGRESS_URL).flush({ modules: MODULES });
    backend.expectOne(VIDEO_URL).flush({
      ...SEM_VIDEO,
      hasVideo: true,
      status: 'READY',
      playbackId: 'pb-1',
      fileName: 'aula-01.mp4',
      sizeBytes: 2 * 1024 * 1024,
    });
    backend.expectOne(MATERIALS_URL).flush([]);
    fixture.detectChanges();

    const texto = fixture.nativeElement.textContent;
    expect(texto).toContain('Pronto');
    expect(texto).toContain('aula-01.mp4');
    expect(texto).toContain('2.0 MB');
  });

  it('exibe a mensagem de erro quando a ingestao falha', () => {
    backend.expectOne(PROGRESS_URL).flush({ modules: MODULES });
    backend.expectOne(VIDEO_URL).flush({
      ...SEM_VIDEO,
      hasVideo: true,
      status: 'ERRORED',
      fileName: 'aula-01.mp4',
      error: 'Formato não suportado',
    });
    backend.expectOne(MATERIALS_URL).flush([]);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Formato não suportado');
  });

  it('envia o video em tres passos e mostra o progresso', () => {
    bootstrap(backend, fixture);

    const input = fixture.nativeElement.querySelector(
      'input[type="file"][accept="video/*"]',
    ) as HTMLInputElement;
    const file = new File(['video'], 'aula-01.mp4', { type: 'video/mp4' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));

    backend.expectOne(`${VIDEO_URL}/upload-url`).flush(TICKET);

    const put = backend.expectOne(BUCKET_URL);
    put.event({ type: HttpEventType.UploadProgress, loaded: 3, total: 4 });
    fixture.detectChanges();

    const barra = fixture.nativeElement.querySelector('[role="progressbar"]') as HTMLElement;
    expect(barra.getAttribute('aria-valuenow')).toBe('75');

    put.flush('');
    backend.expectOne(VIDEO_URL).flush({
      ...SEM_VIDEO,
      hasVideo: true,
      status: 'PROCESSING',
      fileName: 'aula-01.mp4',
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Processando');
  });

  it('nao confirma na API quando o PUT no bucket falha', () => {
    bootstrap(backend, fixture);

    const input = fixture.nativeElement.querySelector(
      'input[type="file"][accept="video/*"]',
    ) as HTMLInputElement;
    Object.defineProperty(input, 'files', {
      value: [new File(['v'], 'aula.mp4', { type: 'video/mp4' })],
      configurable: true,
    });
    input.dispatchEvent(new Event('change'));

    backend.expectOne(`${VIDEO_URL}/upload-url`).flush(TICKET);
    backend.expectOne(BUCKET_URL).flush('', { status: 403, statusText: 'Forbidden' });
    fixture.detectChanges();

    // Nada e gravado: nao ha POST de confirmacao.
    backend.expectNone(VIDEO_URL);
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeTruthy();
  });

  it('lista os materiais do modulo', () => {
    backend.expectOne(PROGRESS_URL).flush({ modules: MODULES });
    backend.expectOne(VIDEO_URL).flush(SEM_VIDEO);
    backend.expectOne(MATERIALS_URL).flush([
      {
        id: 'mat-1',
        fileName: 'Checklist.pdf',
        fileType: 'pdf',
        contentType: 'application/pdf',
        sizeBytes: 850 * 1024,
        order: 0,
        moduleId: 'mod-1',
        moduleOrder: 1,
        moduleTitle: 'Fundamentos',
        downloadUrl: 'https://storage.googleapis.com/leitura',
        downloadExpiresAt: '2026-09-11T12:15:00.000Z',
      },
    ]);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Checklist.pdf');
    expect(fixture.nativeElement.textContent).toContain('850 KB');
  });

  it('pede confirmacao antes de remover um material', () => {
    backend.expectOne(PROGRESS_URL).flush({ modules: MODULES });
    backend.expectOne(VIDEO_URL).flush(SEM_VIDEO);
    backend.expectOne(MATERIALS_URL).flush([
      {
        id: 'mat-1',
        fileName: 'Checklist.pdf',
        fileType: 'pdf',
        contentType: 'application/pdf',
        sizeBytes: 1024,
        order: 0,
        moduleId: 'mod-1',
        moduleOrder: 1,
        moduleTitle: 'Fundamentos',
        downloadUrl: 'https://x',
        downloadExpiresAt: '2026-09-11T12:15:00.000Z',
      },
    ]);
    fixture.detectChanges();

    spyOn(window, 'confirm').and.returnValue(false);
    (fixture.nativeElement.querySelector('ui-button button') as HTMLButtonElement).click();

    // O arquivo sai do bucket e nao volta: recusar a confirmacao nao apaga nada.
    backend.expectNone(`${environment.apiUrl}/admin/materials/mat-1`);
  });

  it('bloqueia o papel aluno com a mensagem do backend', () => {
    backend
      .expectOne(PROGRESS_URL)
      .flush({ message: 'Esta area e restrita a administradores.' }, {
        status: 403,
        statusText: 'Forbidden',
      });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
      'administradores',
    );
  });
});
