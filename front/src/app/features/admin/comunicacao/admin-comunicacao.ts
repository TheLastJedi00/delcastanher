import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  AdminEmailService,
  CampaignDraft,
  CampaignStatus,
  CampaignView,
  EmailSegment,
  EmailSegmentView,
} from '../../../core/services/admin-email.service';
import { Badge, BadgeVariant } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { Input } from '../../../shared/ui/input/input';
import { Modal } from '../../../shared/ui/modal/modal';
import { SectionHeader } from '../../../shared/ui/section-header/section-header';

const STATUS: Record<CampaignStatus, { label: string; variant: BadgeVariant }> = {
  SENDING: { label: 'Enviando', variant: 'warning' },
  SENT: { label: 'Enviada', variant: 'success' },
  PARTIAL: { label: 'Parcial', variant: 'danger' },
};

/**
 * Aba "Disparos de E-mail" (Spec 023, Parte B), no lugar da maquete da Spec
 * 001 e do aviso "Area em construcao" da Spec 013.
 *
 * O disparo so sai depois de uma confirmacao que diz **quantas pessoas**
 * recebem (decisao B4): a contagem vem do servidor, pelo mesmo calculo do
 * envio. O corpo e texto simples (decisao B3) — a tela nao promete negrito
 * nem imagem que o e-mail nao vai ter.
 */
@Component({
  selector: 'app-admin-comunicacao',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, DatePipe, Badge, Button, Card, Input, Modal, SectionHeader],
  templateUrl: './admin-comunicacao.html',
})
export class AdminComunicacao implements OnInit {
  private readonly email = inject(AdminEmailService);

  readonly form = new FormGroup({
    segment: new FormControl<EmailSegment>('ALL_ACTIVE', { nonNullable: true }),
    subject: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(150)],
    }),
    body: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(10000)],
    }),
  });

  readonly segments = signal<EmailSegmentView[]>([]);
  readonly campaigns = signal<CampaignView[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal('');

  readonly sendingTest = signal(false);
  readonly dispatching = signal(false);
  readonly resumingId = signal<string | null>(null);
  readonly confirming = signal(false);
  readonly feedback = signal('');
  readonly error = signal('');

  private readonly value = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });
  readonly selected = computed(() =>
    this.segments().find(segment => segment.id === this.value().segment) ?? null,
  );

  readonly busy = computed(() => this.sendingTest() || this.dispatching());

  ngOnInit(): void {
    this.reload();
  }

  statusOf(status: CampaignStatus) {
    return STATUS[status];
  }

  labelOf(segment: EmailSegment): string {
    return this.segments().find(item => item.id === segment)?.label ?? segment;
  }

  sendTest(): void {
    if (!this.validate()) {
      return;
    }

    this.sendingTest.set(true);
    this.email.sendTest(this.draft()).subscribe({
      next: ({ sentTo }) => {
        this.sendingTest.set(false);
        this.feedback.set(`Teste enviado para ${sentTo}.`);
      },
      error: (message: string) => {
        this.sendingTest.set(false);
        this.error.set(message);
      },
    });
  }

  /** Abre a confirmacao com o segmento e o numero de destinatarios. */
  askDispatch(): void {
    if (!this.validate()) {
      return;
    }

    this.confirming.set(true);
  }

  dispatch(): void {
    this.dispatching.set(true);
    this.email.dispatch(this.draft()).subscribe({
      next: campaign => {
        this.dispatching.set(false);
        this.confirming.set(false);
        this.feedback.set(
          campaign.status === 'SENT'
            ? `Campanha enviada para ${campaign.sentCount} pessoa(s).`
            : `Campanha enviada em parte: ${campaign.sentCount} de ${campaign.recipientCount}. Use "Retomar envio" no histórico.`,
        );
        this.form.reset({ segment: this.form.getRawValue().segment, subject: '', body: '' });
        this.reload();
      },
      error: (message: string) => {
        this.dispatching.set(false);
        this.confirming.set(false);
        this.error.set(message);
      },
    });
  }

  resume(campaign: CampaignView): void {
    this.clearMessages();
    this.resumingId.set(campaign.id);
    this.email.resume(campaign.id).subscribe({
      next: updated => {
        this.resumingId.set(null);
        this.feedback.set(
          updated.status === 'SENT'
            ? 'Envio retomado: todas as entregas saíram.'
            : `Envio retomado: ${updated.sentCount} de ${updated.recipientCount} enviadas.`,
        );
        this.reload();
      },
      error: (message: string) => {
        this.resumingId.set(null);
        this.error.set(message);
      },
    });
  }

  fieldError(name: 'subject' | 'body'): string {
    const control = this.form.controls[name];

    if (!control.touched || control.valid) {
      return '';
    }

    if (control.hasError('maxlength')) {
      return name === 'subject' ? 'Até 150 caracteres.' : 'Até 10.000 caracteres.';
    }

    return name === 'subject' ? 'Informe o assunto.' : 'Escreva a mensagem.';
  }

  private validate(): boolean {
    this.clearMessages();
    this.form.markAllAsTouched();

    const { subject, body } = this.form.getRawValue();

    // Espacos nao sao assunto: o servidor recusaria, e a tela diz antes.
    if (!subject.trim()) {
      this.form.controls.subject.setErrors({ required: true });
    }

    if (!body.trim()) {
      this.form.controls.body.setErrors({ required: true });
    }

    return this.form.valid;
  }

  private draft(): CampaignDraft {
    const { segment, subject, body } = this.form.getRawValue();

    return { segment, subject: subject.trim(), body: body.trim() };
  }

  private clearMessages(): void {
    this.feedback.set('');
    this.error.set('');
  }

  private reload(): void {
    this.email.segments().subscribe({
      next: segments => {
        this.segments.set(segments);
        this.loading.set(false);
      },
      error: (message: string) => {
        this.loading.set(false);
        this.loadError.set(message);
      },
    });

    this.email.campaigns().subscribe({
      next: campaigns => this.campaigns.set(campaigns),
      error: (message: string) => this.loadError.set(message),
    });
  }
}
