import { ComponentFixture, TestBed } from '@angular/core/testing';
import { VideoPlayer } from './video-player';

describe('VideoPlayer', () => {
  let fixture: ComponentFixture<VideoPlayer>;

  const el = () => fixture.nativeElement as HTMLElement;
  const playButton = () =>
    el().querySelector('button[aria-label^="Reproduzir"]') as HTMLButtonElement | null;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [VideoPlayer] }).compileComponents();

    fixture = TestBed.createComponent(VideoPlayer);
    fixture.componentRef.setInput('title', 'Módulo 1');
    fixture.componentRef.setInput('subtitle', 'Fundamentos');
  });

  it('oferece o play com o token em maos', () => {
    fixture.componentRef.setInput('playbackId', 'pb-1');
    fixture.componentRef.setInput('playbackToken', 'jwt-curto');
    fixture.detectChanges();

    expect(playButton()).not.toBeNull();
    expect(playButton()!.getAttribute('aria-label')).toContain('Módulo 1');
  });

  it('nao oferece play com o video indisponivel', () => {
    fixture.componentRef.setInput('state', 'unavailable');
    fixture.detectChanges();

    expect(playButton()).toBeNull();
    expect(el().textContent).toContain('ainda não está disponível');
  });

  it('avisa que esta preparando enquanto o token nao chega', () => {
    fixture.componentRef.setInput('state', 'loading');
    fixture.detectChanges();

    expect(playButton()).toBeNull();
    expect(el().textContent).toContain('Preparando o vídeo');
  });

  it('anuncia a mudanca de estado para leitor de tela', () => {
    fixture.componentRef.setInput('state', 'loading');
    fixture.detectChanges();

    expect(el().querySelector('[aria-live="polite"]')).not.toBeNull();
  });

  it('emite play ao clicar, para a trilha instrumentar o evento', () => {
    fixture.componentRef.setInput('playbackId', 'pb-1');
    fixture.componentRef.setInput('playbackToken', 'jwt-curto');
    fixture.detectChanges();

    let disparou = false;
    fixture.componentInstance.play.subscribe(() => (disparou = true));

    playButton()!.click();

    expect(disparou).toBeTrue();
  });

  it('mostra o poster enquanto nao esta reproduzindo', () => {
    fixture.componentRef.setInput('poster', 'assets/aula1.jpeg');
    fixture.componentRef.setInput('playbackId', 'pb-1');
    fixture.componentRef.setInput('playbackToken', 'jwt-curto');
    fixture.detectChanges();

    const img = el().querySelector('img');
    expect(img?.getAttribute('src')).toBe('assets/aula1.jpeg');
    // O <mux-player> so e montado depois do clique: carregar o web component
    // em toda visita traria o peso dele para quem nem assiste.
    expect(el().querySelector('mux-player')).toBeNull();
  });
});
