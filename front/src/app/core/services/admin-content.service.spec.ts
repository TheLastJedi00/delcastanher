import { HttpEventType, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { AdminContentService, UploadProgress } from './admin-content.service';

const MODULE_ID = 'mod-1';
const SIGN_URL = `${environment.apiUrl}/admin/modules/${MODULE_ID}/video/upload-url`;
const CONFIRM_URL = `${environment.apiUrl}/admin/modules/${MODULE_ID}/video`;
const BUCKET_URL = 'https://storage.googleapis.com/assinada';

const TICKET = {
  storagePath: 'modules/mod-1/video/aula-01.mp4',
  uploadUrl: BUCKET_URL,
  headers: { 'Content-Type': 'video/mp4' },
  expiresAt: '2026-09-11T12:00:00.000Z',
};

const STATE = {
  moduleId: MODULE_ID,
  hasVideo: true,
  status: 'PROCESSING' as const,
  playbackId: 'pb-1',
  fileName: 'aula-01.mp4',
  sizeBytes: 12,
  error: null,
};

function videoFile(): File {
  return new File(['conteudo-mp4'], 'aula-01.mp4', { type: 'video/mp4' });
}

describe('AdminContentService', () => {
  let service: AdminContentService;
  let backend: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(AdminContentService);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  it('segue os tres passos na ordem: assinar, enviar ao bucket, confirmar', () => {
    const eventos: UploadProgress<unknown>[] = [];
    service.uploadVideo(MODULE_ID, videoFile()).subscribe(event => eventos.push(event));

    const sign = backend.expectOne(SIGN_URL);
    expect(sign.request.method).toBe('POST');
    expect(sign.request.body).toEqual({
      fileName: 'aula-01.mp4',
      contentType: 'video/mp4',
      sizeBytes: 12,
    });
    sign.flush(TICKET);

    const put = backend.expectOne(BUCKET_URL);
    expect(put.request.method).toBe('PUT');
    // A assinatura cobre o Content-Type: sem repeti-lo o GCS responde 403.
    expect(put.request.headers.get('Content-Type')).toBe('video/mp4');
    // O arquivo vai direto ao bucket, nunca pelo servidor (decisao 3).
    expect(put.request.url.startsWith(environment.apiUrl)).toBeFalse();

    put.event({ type: HttpEventType.UploadProgress, loaded: 6, total: 12 });
    put.flush('');

    const confirm = backend.expectOne(CONFIRM_URL);
    expect(confirm.request.method).toBe('POST');
    expect(confirm.request.body).toEqual({
      storagePath: TICKET.storagePath,
      fileName: 'aula-01.mp4',
      contentType: 'video/mp4',
    });
    confirm.flush(STATE);

    expect(eventos.map(e => e.phase)).toEqual(['uploading', 'done']);
    expect(eventos[0].progress).toBe(50);
    expect(eventos.at(-1)).toEqual({ phase: 'done', progress: 100, result: STATE });
  });

  it('nao manda o token da sessao para o bucket', () => {
    localStorage.setItem(
      'delcastanher.session',
      JSON.stringify({
        idToken: 'token',
        refreshToken: 'r',
        expiresAt: Date.now() + 3600000,
        user: { uid: 'u', email: 'a@b.c', name: null, role: 'admin' },
      }),
    );

    service.uploadVideo(MODULE_ID, videoFile()).subscribe({ error: () => undefined });

    backend.expectOne(SIGN_URL).flush(TICKET);

    const put = backend.expectOne(BUCKET_URL);
    expect(put.request.headers.has('Authorization')).toBeFalse();
    put.flush('');
    backend.expectOne(CONFIRM_URL).flush(STATE);

    localStorage.clear();
  });

  it('nao confirma na API quando o PUT no bucket falha', () => {
    let erro = '';
    service.uploadVideo(MODULE_ID, videoFile()).subscribe({
      error: (message: string) => (erro = message),
    });

    backend.expectOne(SIGN_URL).flush(TICKET);
    backend
      .expectOne(BUCKET_URL)
      .flush('', { status: 403, statusText: 'Forbidden' });

    // Nenhum registro nasce no banco: a confirmacao nem e tentada.
    backend.expectNone(CONFIRM_URL);
    expect(erro).toBeTruthy();
  });

  it('traduz o 403 do backend em mensagem de papel', () => {
    let erro = '';
    service.uploadVideo(MODULE_ID, videoFile()).subscribe({
      error: (message: string) => (erro = message),
    });

    backend
      .expectOne(SIGN_URL)
      .flush({ message: 'Esta area e restrita a administradores.' }, {
        status: 403,
        statusText: 'Forbidden',
      });

    expect(erro).toContain('administradores');
    backend.expectNone(BUCKET_URL);
  });

  it('envia material pelo mesmo fluxo de tres passos', () => {
    const material = new File(['pdf'], 'checklist.pdf', { type: 'application/pdf' });
    let concluido = false;

    service.uploadMaterial(MODULE_ID, material).subscribe(event => {
      concluido = event.phase === 'done';
    });

    backend
      .expectOne(`${environment.apiUrl}/admin/modules/${MODULE_ID}/materials/upload-url`)
      .flush({ ...TICKET, storagePath: 'modules/mod-1/materials/checklist.pdf' });

    backend.expectOne(BUCKET_URL).flush('');
    backend
      .expectOne(`${environment.apiUrl}/admin/modules/${MODULE_ID}/materials`)
      .flush({ id: 'mat-1', fileName: 'checklist.pdf' });

    expect(concluido).toBeTrue();
  });

  it('consulta o estado do video do modulo', () => {
    let estado: unknown = null;
    service.videoState(MODULE_ID).subscribe(value => (estado = value));

    backend.expectOne(CONFIRM_URL).flush(STATE);

    expect(estado).toEqual(STATE);
  });

  it('remove um material pelo id', () => {
    let removido = false;
    service.removeMaterial('mat-1').subscribe(() => (removido = true));

    const call = backend.expectOne(`${environment.apiUrl}/admin/materials/mat-1`);
    expect(call.request.method).toBe('DELETE');
    call.flush(null);

    expect(removido).toBeTrue();
  });
});
