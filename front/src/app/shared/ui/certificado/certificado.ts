import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { PLACEHOLDER } from '../../../core/mocks/placeholders';
import { StudentCertificate } from '../../../core/services/certificate.service';
import { Logo } from '../logo/logo';
import { PlaceholderText } from '../placeholder-text/placeholder-text';

/** O que o diploma imprime. Tudo vem da API: nada e calculado aqui. */
export type DiplomaData = Pick<
  StudentCertificate,
  | 'scope'
  | 'studentName'
  | 'courseTitle'
  | 'moduleTitle'
  | 'summary'
  | 'workloadHours'
  | 'issuedAt'
  | 'code'
  | 'hash'
>;

/**
 * Data por extenso no fuso da empresa. Fixar o fuso evita que o mesmo diploma
 * saia com dias diferentes no servidor (UTC) e no navegador do aluno.
 */
const LONG_DATE = new Intl.DateTimeFormat('pt-BR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'America/Sao_Paulo',
});

/**
 * Modelo do diploma de conclusao (Spec 023, Parte D), em A4 paisagem.
 *
 * Serve aos dois escopos: o diploma do curso e o de modulo. As medidas internas
 * sao em `em` sobre uma fonte base em `cqw` (largura do proprio diploma), entao
 * a folha mantem a proporcao em qualquer largura de tela e no papel.
 */
@Component({
  selector: 'ui-certificado',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Logo, PlaceholderText],
  host: { class: 'block w-full [container-type:inline-size] print:mx-auto print:w-[262mm]' },
  template: `
    <section
      class="relative aspect-[297/210] w-full overflow-hidden bg-gradient-hero text-[1.98cqw] text-white"
      [attr.aria-label]="label()">
      <!-- Marca d'agua: decorativa, fora da arvore de acessibilidade. -->
      <div
        class="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.12] blur-[1px]"
        aria-hidden="true">
        <ui-logo variant="light" class="[&_svg]:h-[28em] [&_svg]:w-[28em]" />
      </div>

      <div class="relative flex h-full flex-col justify-between px-[15%] py-[5%]">
        <div class="flex h-[15%] items-center justify-center gap-[1.4em]">
          <ui-logo variant="light" class="[&_svg]:h-[2.9em] [&_svg]:w-[2.9em]" />
          <div class="w-[25%]">
            <p class="font-bold">DELCASTANHER</p>
            <p class="text-[0.5em] uppercase leading-tight">
              Serviços Administrativos e Treinamentos LTDA
            </p>
          </div>
        </div>

        <div class="grid gap-[1.4em]">
          <div class="flex flex-col items-center justify-center">
            <h2 class="text-[2.57em] font-bold leading-tight">CERTIFICADO</h2>
            <div class="flex w-[50%] flex-row items-center justify-center gap-[1.4em] text-center">
              <div class="line w-[20%]"></div>
              <p class="w-full text-[0.86em]">DE CONCLUSÃO</p>
              <div class="line w-[20%]"></div>
            </div>
          </div>

          <div class="grid gap-[1.4em]">
            <p>
              Certificamos que <b>{{ data().studentName }}</b> participou e concluiu com êxito
              {{ subject() }} <b>{{ title() }}</b>,
              @if (data().scope === 'module') {
                do curso {{ data().courseTitle }},
              }
              realizado pela
              <b>DELCASTANHER SERVIÇOS ADMINISTRATIVOS E TREINAMENTOS LTDA</b>, com carga horária
              total de
              <ui-placeholder-text tone="light" [value]="workload()" />.
            </p>
            <p>
              @if (data().summary; as summary) {
                Conteúdo abordado: {{ summary }}
              }
              O programa contribuiu para o desenvolvimento de competências e a aplicação prática
              dos conhecimentos.
            </p>
          </div>
        </div>

        <div class="flex flex-col items-center justify-center">
          <!--
            A rubrica digitalizada e de uma pessoa real e ainda nao foi enviada:
            ate la o espaco dela fica como pendente, como os demais placeholders.
          -->
          <div class="flex h-[2.2em] items-end justify-center text-[0.6em]">
            <ui-placeholder-text tone="light" [value]="signature" />
          </div>
          <div class="line mb-[0.5em] w-[50%]"></div>
          <p class="font-semibold">LIDIANE DELCASTANHER</p>
          <p class="text-[0.75em]">CEO/CHO &amp; Founder</p>
          <p class="text-[0.5em] text-white/75">Blumenau, {{ issuedAt() }}</p>
        </div>

        <div class="text-center text-[0.5em] leading-snug text-white/80">
          <p>
            Código de validação
            <b class="tracking-[0.2em] text-white tabular-nums">{{ data().code }}</b>
            · confira em {{ verificationUrl() }}
          </p>
          <p class="break-all text-[0.8em] text-white/60">Hash: {{ data().hash }}</p>
        </div>
      </div>
    </section>
  `,
  styles: `
    .line {
      height: 1px;
      background-color: white;
    }
  `,
})
export class CertificadoDiploma {
  readonly data = input.required<DiplomaData>();
  /** Endereco publico da verificacao, ja com o host. */
  readonly verificationUrl = input.required<string>();

  protected readonly signature = PLACEHOLDER.signature;

  protected readonly subject = computed(() => (this.data().scope === 'module' ? 'o' : 'o curso'));

  /** No diploma de modulo o titulo ja vem como "Módulo N: Titulo". */
  protected readonly title = computed(() => this.data().moduleTitle ?? this.data().courseTitle);

  protected readonly label = computed(() =>
    this.data().scope === 'module' ? 'Certificado de conclusão do módulo' : 'Certificado de conclusão',
  );

  /** Nulo e "a definir": o placeholder aparece no lugar de "0 horas". */
  protected readonly workload = computed(() => {
    const hours = this.data().workloadHours;

    if (hours === null) {
      return PLACEHOLDER.workload;
    }

    return hours === 1 ? '1 hora' : `${hours} horas`;
  });

  protected readonly issuedAt = computed(() => LONG_DATE.format(new Date(this.data().issuedAt)));
}
