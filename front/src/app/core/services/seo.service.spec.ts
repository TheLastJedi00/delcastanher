import { TestBed } from '@angular/core/testing';
import { Meta, Title } from '@angular/platform-browser';
import { SITE_ORIGIN, SeoService } from './seo.service';

function tag(selector: string): string | undefined {
  return TestBed.inject(Meta).getTag(selector)?.content;
}

function canonical(): string | null {
  return document.head.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null;
}

describe('SeoService', () => {
  let seo: SeoService;

  beforeEach(() => {
    TestBed.resetTestingModule();
    seo = TestBed.inject(SeoService);
    document.head.querySelector('link[rel="canonical"]')?.remove();
  });

  afterAll(() => document.head.querySelector('link[rel="canonical"]')?.remove());

  it('aplica title, description, Open Graph e canonical de uma rota indexavel', () => {
    seo.apply({ title: 'Planos | Delcastanher', description: 'Compare os planos.' }, '/planos');

    expect(TestBed.inject(Title).getTitle()).toBe('Planos | Delcastanher');
    expect(tag('name="description"')).toBe('Compare os planos.');
    expect(tag('property="og:title"')).toBe('Planos | Delcastanher');
    expect(tag('property="og:url"')).toBe(`${SITE_ORIGIN}/planos`);
    expect(tag('name="robots"')).toBe('index, follow');
    expect(canonical()).toBe(`${SITE_ORIGIN}/planos`);
  });

  it('marca noindex e nao declara canonical em rota privada', () => {
    seo.apply({ title: 'AVA', description: 'Área restrita.', indexable: false }, '/ava/trilha');

    expect(tag('name="robots"')).toBe('noindex, nofollow');
    // Pedir `noindex` e apontar canonical para si mesma seriam dois sinais
    // contraditorios para o buscador.
    expect(canonical()).toBeNull();
  });

  it('remove o canonical ao navegar de uma rota publica para uma privada', () => {
    seo.apply({ title: 'Planos', description: 'Compare os planos.' }, '/planos');

    expect(canonical()).not.toBeNull();

    seo.apply({ title: 'AVA', description: 'Área restrita.', indexable: false }, '/ava');

    expect(canonical()).toBeNull();
  });

  it('descarta query string e fragmento do canonical', () => {
    // Sem isto, cada anuncio com `?utm_source=` criaria uma URL canonica
    // diferente para a mesma pagina.
    seo.apply(
      { title: 'Curso', description: 'Imersão.' },
      '/cursos/imersao-rh?utm_source=ads&utm_campaign=abril#investimento'
    );

    expect(canonical()).toBe(`${SITE_ORIGIN}/cursos/imersao-rh`);
  });

  it('resolve a imagem relativa para URL absoluta', () => {
    // Crawler de rede social descarta og:image relativo.
    seo.apply({ title: 'Curso', description: 'Imersão.', image: '/assets/hero.jpeg' }, '/cursos/x');

    expect(tag('property="og:image"')).toBe(`${SITE_ORIGIN}/assets/hero.jpeg`);
  });
});
