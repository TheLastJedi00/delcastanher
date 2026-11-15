import { Component, signal } from '@angular/core';
import { TestBed, discardPeriodicTasks, fakeAsync, tick } from '@angular/core/testing';
import { countdown, splitRemaining } from './countdown';

/** Spec 032, decisoes 7 e 9. */
describe('splitRemaining', () => {
  it('divide em dias, horas, minutos e segundos', () => {
    const ms = ((2 * 24 + 3) * 3600 + 4 * 60 + 5) * 1000 + 999;

    expect(splitRemaining(ms)).toEqual({
      totalMs: ms,
      days: 2,
      hours: 3,
      minutes: 4,
      seconds: 5,
      lastHour: false,
    });
  });

  it('menos de 1 hora e a ultima hora', () => {
    expect(splitRemaining(59 * 60 * 1000)?.lastHour).toBeTrue();
    expect(splitRemaining(60 * 60 * 1000)?.lastHour).toBeFalse();
  });

  it('acabou: nulo', () => {
    expect(splitRemaining(0)).toBeNull();
    expect(splitRemaining(-1)).toBeNull();
  });
});

@Component({ selector: 'app-relogio', template: '' })
class Relogio {
  readonly endsAt = signal<string | null>(null);
  readonly offset = signal(0);
  readonly remaining = countdown(this.endsAt, this.offset);
}

describe('countdown', () => {
  it('conta pelo relogio do servidor, a cada segundo, e chega a nulo no fim', fakeAsync(() => {
    TestBed.configureTestingModule({ imports: [Relogio] });
    const fixture = TestBed.createComponent(Relogio);
    const relogio = fixture.componentInstance;
    const now = Date.now();

    // O aparelho esta 1 hora atrasado: o servidor diz que ja e 1 h mais tarde.
    relogio.offset.set(60 * 60 * 1000);
    relogio.endsAt.set(new Date(now + 60 * 60 * 1000 + 3000).toISOString());
    fixture.detectChanges();

    expect(relogio.remaining()?.seconds).toBe(3);
    expect(relogio.remaining()?.hours).toBe(0);

    tick(1000);
    expect(relogio.remaining()?.seconds).toBe(2);

    tick(3000);
    expect(relogio.remaining()).toBeNull();

    fixture.destroy();
    discardPeriodicTasks();
  }));
});
