import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MediaAppearance, MediaCard } from './media-card';

const PODCAST: MediaAppearance = {
  kind: 'podcast',
  title: 'Aprenda a formar lideranças de alta performance',
  outlet: 'Hapo Educação',
  dateLabel: '11 de outubro de 2025',
  datePublished: '2025-10-11',
  url: 'https://www.youtube.com/watch?v=Qvm2UtJkxA0',
  cta: 'Assistir no YouTube',
  cover: { src: 'assets/midia/hapo-educacao-episodio.webp', alt: 'Lidiane em entrevista' },
  embed: { provider: 'youtube', id: 'Qvm2UtJkxA0' },
};

describe('MediaCard', () => {
  let fixture: ComponentFixture<MediaCard>;

  const render = (item: MediaAppearance) => {
    fixture = TestBed.createComponent(MediaCard);
    fixture.componentRef.setInput('item', item);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [MediaCard] }).compileComponents();
  });

  it('renderiza o titulo em h3 e o selo do tipo', () => {
    const el = render(PODCAST);

    expect(el.querySelector('h3')?.textContent).toContain(PODCAST.title);
    expect(el.querySelector('ui-badge')?.textContent?.trim()).toBe('Podcast');
  });

  it('usa o selo "Revista" e "Livro" para os outros tipos', () => {
    expect(render({ ...PODCAST, kind: 'revista' }).querySelector('ui-badge')?.textContent?.trim()).toBe('Revista');
    expect(render({ ...PODCAST, kind: 'livro' }).querySelector('ui-badge')?.textContent?.trim()).toBe('Livro');
  });

  it('repassa o alt da capa e marca a copia desfocada como decorativa', () => {
    const images = render(PODCAST).querySelectorAll('img');

    expect(images.length).toBe(2);
    expect(images[0].getAttribute('alt')).toBe('');
    expect(images[0].getAttribute('aria-hidden')).toBe('true');
    expect(images[1].getAttribute('alt')).toBe(PODCAST.cover!.alt);
  });

  it('abre os links externos em nova aba com noopener', () => {
    const links = Array.from(render(PODCAST).querySelectorAll('a'));

    expect(links.length).toBe(2);
    for (const link of links) {
      expect(link.getAttribute('href')).toBe(PODCAST.url!);
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toContain('noopener');
    }
  });

  it('pendente sem capa e sem link mostra o veiculo escrito e nenhum <a>', () => {
    const el = render({ ...PODCAST, cover: undefined, url: undefined, embed: undefined });

    expect(el.querySelector('img')).toBeNull();
    expect(el.querySelector('a')).toBeNull();
    expect(el.textContent).toContain(PODCAST.outlet);
  });

  it('nao coloca nenhum iframe no DOM antes do clique', () => {
    const el = render(PODCAST);

    expect(el.querySelector('iframe')).toBeNull();
    expect(el.querySelector('button')?.getAttribute('aria-label')).toBe(
      `Reproduzir episódio: ${PODCAST.title}`
    );
  });

  it('o play troca a capa pelo iframe do youtube-nocookie', () => {
    const el = render(PODCAST);

    el.querySelector<HTMLButtonElement>('button')!.click();
    fixture.detectChanges();

    const iframe = el.querySelector('iframe')!;
    expect(iframe.getAttribute('src')).toBe(
      'https://www.youtube-nocookie.com/embed/Qvm2UtJkxA0?autoplay=1'
    );
    expect(iframe.getAttribute('title')).toContain(PODCAST.title);
    expect(el.querySelector('img')).toBeNull();
  });

  it('o play do Instagram usa o embed do reel', () => {
    const el = render({ ...PODCAST, embed: { provider: 'instagram', id: 'DLpl5hNO-XS' } });

    el.querySelector<HTMLButtonElement>('button')!.click();
    fixture.detectChanges();

    expect(el.querySelector('iframe')?.getAttribute('src')).toBe(
      'https://www.instagram.com/reel/DLpl5hNO-XS/embed/'
    );
  });

  it('id fora do formato nao gera play nem iframe e mantem capa e link', () => {
    const el = render({
      ...PODCAST,
      embed: { provider: 'youtube', id: 'x"><script>' },
    });

    expect(el.querySelector('button')).toBeNull();
    expect(el.querySelector('iframe')).toBeNull();
    expect(el.querySelectorAll('img').length).toBe(2);
    expect(el.querySelector('a')).not.toBeNull();
  });
});
