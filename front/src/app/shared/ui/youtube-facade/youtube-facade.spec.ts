import { ComponentFixture, TestBed } from '@angular/core/testing';
import { isYoutubeId, youtubeEmbedUrl } from './youtube';
import { YoutubeFacade } from './youtube-facade';

/** Spec 023, decisoes C2 e C3. */
describe('YoutubeFacade', () => {
  let fixture: ComponentFixture<YoutubeFacade>;

  const el = () => fixture.nativeElement as HTMLElement;

  function render(id: string): void {
    TestBed.configureTestingModule({ imports: [YoutubeFacade] });
    fixture = TestBed.createComponent(YoutubeFacade);
    fixture.componentRef.setInput('id', id);
    fixture.componentRef.setInput('title', 'Apresentação da Imersão RH Estratégico');
    fixture.componentRef.setInput('poster', 'assets/apresentacao-imersao.webp');
    fixture.detectChanges();
  }

  it('antes do clique, só o pôster local e nenhum iframe', () => {
    render('abcdefghijk');

    expect(el().querySelector('iframe')).toBeNull();
    expect(el().querySelector('img')?.getAttribute('src')).toContain('assets/apresentacao-imersao.webp');
    expect(el().innerHTML).not.toContain('ytimg');
    expect(el().innerHTML).not.toContain('youtube');
  });

  it('o botão diz o que vai tocar', () => {
    render('abcdefghijk');

    expect(el().querySelector('button')?.getAttribute('aria-label')).toBe(
      'Reproduzir: Apresentação da Imersão RH Estratégico',
    );
  });

  it('o clique troca o pôster pelo iframe do youtube-nocookie, com rel=0 e title', () => {
    render('abcdefghijk');

    el().querySelector('button')?.click();
    fixture.detectChanges();

    const iframe = el().querySelector('iframe');

    expect(iframe?.getAttribute('src')).toBe(
      'https://www.youtube-nocookie.com/embed/abcdefghijk?autoplay=1&rel=0',
    );
    expect(iframe?.getAttribute('title')).toBe('Apresentação da Imersão RH Estratégico');
  });

  it('id inválido não vira player: sem botão', () => {
    render('x"><script>');

    expect(el().querySelector('button')).toBeNull();
    expect(el().querySelector('iframe')).toBeNull();
  });
});

describe('regra do YouTube', () => {
  it('aceita só ids de 11 caracteres', () => {
    expect(isYoutubeId('Qvm2UtJkxA0')).toBeTrue();
    expect(isYoutubeId('curto')).toBeFalse();
    expect(isYoutubeId('')).toBeFalse();
    expect(isYoutubeId(null)).toBeFalse();
  });

  it('monta a URL do player, com ou sem sugestões', () => {
    expect(youtubeEmbedUrl('Qvm2UtJkxA0')).toBe('https://www.youtube-nocookie.com/embed/Qvm2UtJkxA0?autoplay=1');
    expect(youtubeEmbedUrl('Qvm2UtJkxA0', { related: false })).toBe(
      'https://www.youtube-nocookie.com/embed/Qvm2UtJkxA0?autoplay=1&rel=0',
    );
  });
});
