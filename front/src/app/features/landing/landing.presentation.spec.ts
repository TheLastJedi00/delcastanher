import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Landing, PRESENTATION_VIDEO, PresentationVideo } from './landing';

const VIDEO: PresentationVideo = { id: 'abcdefghijk', uploadDate: '2026-10-02', listed: false };

/** Spec 023, decisoes C2, C5 e C6: o video de apresentacao na landing. */
describe('Landing — Conheça a Imersão', () => {
  let fixture: ComponentFixture<Landing>;

  const el = () => fixture.nativeElement as HTMLElement;

  function render(video?: PresentationVideo): void {
    TestBed.configureTestingModule({
      imports: [Landing],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        ...(video ? [{ provide: PRESENTATION_VIDEO, useValue: video }] : []),
      ],
    });

    fixture = TestBed.createComponent(Landing);
    fixture.detectChanges();
  }

  function person(): { subjectOf: Record<string, unknown>[] } {
    const blocks = Array.from(
      document.head.querySelectorAll('script[type="application/ld+json"][data-json-ld]'),
    ).map(node => JSON.parse(node.textContent ?? '{}'));

    return blocks.find(block => block['@type'] === 'Person');
  }

  it('com a constante vazia, a seção não aparece e nada vai ao schema', () => {
    render();

    expect(el().querySelector('[data-testid="conheca-a-imersao"]')).toBeNull();
    expect(person().subjectOf.some(item => item['name'] === 'Apresentação da Imersão RH Estratégico')).toBeFalse();
  });

  it('com o id, a seção fica entre a hero e A Mentora', () => {
    render(VIDEO);

    const section = el().querySelector('[data-testid="conheca-a-imersao"]') as HTMLElement;

    expect(section).not.toBeNull();
    expect(section.previousElementSibling?.tagName).toBe('HEADER');
    expect(section.nextElementSibling?.id).toBe('mentora');
    expect(section.textContent).toContain('Conheça a Imersão');
    expect(section.querySelector('a[href="/cursos/imersao-rh"]')?.textContent).toContain(
      'Quero me Inscrever Agora',
    );
  });

  it('antes do clique, só o pôster local, sem iframe', () => {
    render(VIDEO);

    const section = el().querySelector('[data-testid="conheca-a-imersao"]') as HTMLElement;

    expect(section.querySelector('iframe')).toBeNull();
    expect(section.querySelector('img')?.getAttribute('src')).toContain('assets/apresentacao-imersao.webp');
  });

  it('o clique monta o iframe do youtube-nocookie com o id certo', () => {
    render(VIDEO);

    const button = el().querySelector('[data-testid="conheca-a-imersao"] button') as HTMLButtonElement;

    expect(button.getAttribute('aria-label')).toBe('Reproduzir: Apresentação da Imersão RH Estratégico');
    button.click();
    fixture.detectChanges();

    expect(el().querySelector('[data-testid="conheca-a-imersao"] iframe')?.getAttribute('src')).toBe(
      'https://www.youtube-nocookie.com/embed/abcdefghijk?autoplay=1&rel=0',
    );
  });

  it('id inválido não mostra a seção', () => {
    render({ ...VIDEO, id: 'invalido' });

    expect(el().querySelector('[data-testid="conheca-a-imersao"]')).toBeNull();
  });

  it('declara o VideoObject com embedUrl, e sem url enquanto não for público', () => {
    render(VIDEO);

    const video = person().subjectOf.find(item => item['name'] === 'Apresentação da Imersão RH Estratégico');

    expect(video).toEqual(
      jasmine.objectContaining({
        '@type': 'VideoObject',
        embedUrl: 'https://www.youtube.com/embed/abcdefghijk',
        uploadDate: '2026-10-02',
      }),
    );
    expect(video?.['url']).toBeUndefined();
    expect(String(video?.['thumbnailUrl'])).toMatch(/\/assets\/apresentacao-imersao\.webp$/);
  });

  it('o vídeo público ganha o url do YouTube', () => {
    render({ ...VIDEO, listed: true });

    const video = person().subjectOf.find(item => item['name'] === 'Apresentação da Imersão RH Estratégico');

    expect(video?.['url']).toBe('https://www.youtube.com/watch?v=abcdefghijk');
  });
});
