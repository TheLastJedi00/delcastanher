import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { PLACEHOLDER } from '../../core/mocks/placeholders';
import {
  CertificateService,
  CertificateVerification,
} from '../../core/services/certificate.service';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { Footer } from '../../shared/ui/footer/footer';
import { Input } from '../../shared/ui/input/input';
import { NavHeader, NavLink } from '../../shared/ui/nav-header/nav-header';
import { PageContainer } from '../../shared/ui/page-container/page-container';
import { PlaceholderText } from '../../shared/ui/placeholder-text/placeholder-text';
import { SectionHeader } from '../../shared/ui/section-header/section-header';

/**
 * Portal publico de validacao (`/certificado/verificar`).
 *
 * Quem usa esta tela e um terceiro sem conta — empresa ou recrutador — por isso
 * ela fica fora dos guards e nao depende de nenhuma chamada autenticada. Os
 * tres estados de retorno sao visualmente distintos: confirmar uma conclusao,
 * avisar que o diploma nao vale mais e dizer que o codigo nao existe sao
 * respostas diferentes, e tratar as duas ultimas como "deu erro" deixaria a
 * pessoa sem saber o que fazer.
 */
@Component({
  selector: 'app-certificado-verificar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    Button,
    Card,
    Footer,
    Input,
    NavHeader,
    PageContainer,
    PlaceholderText,
    SectionHeader,
  ],
  template: `
    <div class="flex min-h-screen flex-col bg-brand-surface">
      <ui-nav-header variant="landing" [navLinks]="navLinks" />

      <main class="flex-1">
        <ui-page-container maxWidth="md">
          <div class="mb-8">
            <ui-section-header
              overline="Validação de certificado"
              level="h1"
              title="Confira a autenticidade de um certificado"
              subtitle="Informe o código de validação impresso no diploma. A consulta é pública e não exige cadastro." />
          </div>

          <ui-card variant="default" padding="lg" [hover]="false">
            <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
              <ui-input
                label="Código de validação"
                placeholder="DELC-XXXX-XXXX"
                autocomplete="off"
                [error]="fieldError()"
                formControlName="code" />

              <div class="mt-5">
                <ui-button type="submit" variant="primary" [loading]="loading()">
                  Verificar certificado
                </ui-button>
              </div>
            </form>
          </ui-card>

          <!--
            aria-live: quem usa leitor de tela precisa ouvir o resultado sem
            sair do formulario e ir procurar o que mudou na pagina.
          -->
          <div class="mt-6" aria-live="polite" aria-atomic="true">
            @if (requestError()) {
              <ui-card variant="default" padding="lg" [hover]="false">
                <h2 class="text-lg font-bold text-brand-navy">Não foi possível verificar agora</h2>
                <p class="mt-2 text-sm text-slate-600">{{ requestError() }}</p>
                <div class="mt-4">
                  <ui-button variant="outline" (click)="submit()">Tentar novamente</ui-button>
                </div>
              </ui-card>
            } @else if (result(); as verification) {
              @switch (verification.status) {
                @case ('valid') {
                  <ui-card variant="default" padding="lg" [hover]="false">
                    <div class="flex items-start gap-3">
                      <span
                        class="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-state-success/10 text-state-success">
                        <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" />
                        </svg>
                      </span>
                      <div class="min-w-0">
                        <h2 class="text-lg font-bold text-brand-navy">Certificado válido</h2>
                        <p class="mt-1 text-sm text-slate-600">
                          Este código corresponde a um certificado autêntico emitido pela
                          Delcastanher.
                        </p>

                        <dl class="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <div>
                            <dt class="text-[11px] font-bold uppercase tracking-widest text-slate-500">
                              Aluno
                            </dt>
                            <dd class="mt-1 font-semibold text-brand-navy">
                              {{ verification.certificate.studentName }}
                            </dd>
                          </div>
                          <div>
                            <dt class="text-[11px] font-bold uppercase tracking-widest text-slate-500">
                              Curso
                            </dt>
                            <dd class="mt-1 font-semibold text-brand-navy">
                              {{ verification.certificate.courseTitle }}
                            </dd>
                          </div>
                          <div>
                            <dt class="text-[11px] font-bold uppercase tracking-widest text-slate-500">
                              Carga horária
                            </dt>
                            <dd class="mt-1 font-semibold text-brand-navy">
                              <ui-placeholder-text [value]="workloadOf(verification)" />
                            </dd>
                          </div>
                          <div>
                            <dt class="text-[11px] font-bold uppercase tracking-widest text-slate-500">
                              Emitido em
                            </dt>
                            <dd class="mt-1 font-semibold text-brand-navy">
                              {{ issuedAtOf(verification) }}
                            </dd>
                          </div>
                        </dl>
                      </div>
                    </div>
                  </ui-card>
                }
                @case ('invalid') {
                  <ui-card variant="default" padding="lg" [hover]="false">
                    <h2 class="text-lg font-bold text-brand-navy">Certificado inválido</h2>
                    <p class="mt-2 text-sm text-slate-600">{{ invalidMessage() }}</p>
                  </ui-card>
                }
                @case ('not_found') {
                  <ui-card variant="default" padding="lg" [hover]="false">
                    <h2 class="text-lg font-bold text-brand-navy">Código não encontrado</h2>
                    <p class="mt-2 text-sm text-slate-600">
                      Nenhum certificado foi emitido com este código. Confira se digitou exatamente
                      como está no diploma — o formato é DELC-XXXX-XXXX.
                    </p>
                  </ui-card>
                }
              }
            }
          </div>
        </ui-page-container>
      </main>

      <ui-footer />
    </div>
  `,
})
export class CertificadoVerificar {
  private readonly certificates = inject(CertificateService);
  private readonly route = inject(ActivatedRoute);

  protected readonly navLinks: NavLink[] = [
    { label: 'Início', href: '/', routerLink: '/' },
    { label: 'Planos', href: '/planos', routerLink: '/planos' },
  ];

  protected readonly form = new FormGroup({
    code: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(8)],
    }),
  });

  protected readonly loading = signal(false);
  protected readonly submitted = signal(false);
  protected readonly requestError = signal('');
  protected readonly result = signal<CertificateVerification | null>(null);

  protected readonly fieldError = computed(() =>
    this.submitted() && this.form.controls.code.invalid
      ? 'Informe o código completo do certificado (formato DELC-XXXX-XXXX).'
      : '',
  );

  protected readonly invalidMessage = computed(() => {
    const verification = this.result();

    if (verification?.status !== 'invalid') {
      return '';
    }

    return verification.reason === 'revoked'
      ? 'Este certificado existe, mas foi revogado pela Delcastanher e não é mais válido como comprovação de conclusão.'
      : 'Os dados deste certificado não conferem com o registro original, então ele não pode ser considerado autêntico.';
  });

  constructor() {
    // `?codigo=` atende o link impresso no diploma: a pessoa chega com o campo
    // preenchido e o resultado na tela, sem redigitar nada.
    const fromUrl = this.route.snapshot.queryParamMap.get('codigo');

    if (fromUrl) {
      this.form.controls.code.setValue(fromUrl);
      this.submit();
    }
  }

  protected submit(): void {
    this.submitted.set(true);

    if (this.form.invalid || this.loading()) {
      return;
    }

    this.loading.set(true);
    this.requestError.set('');
    this.result.set(null);

    // A normalizacao (maiusculas, hifens) e do servidor: uma segunda
    // implementacao no front poderia divergir dela.
    this.certificates.verify(this.form.controls.code.value).subscribe({
      next: verification => {
        this.result.set(verification);
        this.loading.set(false);
      },
      error: (message: string) => {
        this.requestError.set(message);
        this.loading.set(false);
      },
    });
  }

  protected workloadOf(verification: CertificateVerification): string {
    if (verification.status !== 'valid') {
      return '';
    }

    const hours = verification.certificate.workloadHours;

    return hours === null ? PLACEHOLDER.workload : `${hours} horas`;
  }

  protected issuedAtOf(verification: CertificateVerification): string {
    return verification.status === 'valid'
      ? new Date(verification.certificate.issuedAt).toLocaleDateString('pt-BR')
      : '';
  }
}
