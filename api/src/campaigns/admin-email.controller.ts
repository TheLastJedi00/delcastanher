import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CampaignsService } from './campaigns.service';
import type { CampaignView, SegmentView } from './campaigns.service';
import { CampaignDraftDto } from './dto/campaign.dto';

/**
 * Aba "Disparos de E-mail" do painel (Spec 023, Parte B).
 *
 * Guards na classe, como em todo controller administrativo (Spec 010,
 * decisao 13). O destinatario do teste e o autor da campanha vem do token, e
 * nunca do corpo: o corpo traz so segmento, assunto e texto (decisao B2).
 */
@Controller('admin/email')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles('admin')
export class AdminEmailController {
  constructor(private readonly campaigns: CampaignsService) {}

  /** Os tres segmentos, com quantas pessoas recebem hoje (decisao B2). */
  @Get('segments')
  segments(): Promise<SegmentView[]> {
    return this.campaigns.segments();
  }

  /** "Enviar teste": so para o admin logado (decisao B4). */
  @Post('test')
  @HttpCode(200)
  test(@CurrentUser() admin: AuthUser, @Body() dto: CampaignDraftDto): Promise<{ sentTo: string }> {
    return this.campaigns.sendTest(admin, dto);
  }

  /** Historico das campanhas (decisao B6). */
  @Get('campaigns')
  list(): Promise<CampaignView[]> {
    return this.campaigns.list();
  }

  /** "Disparar campanha", depois da confirmacao na tela (decisao B4). */
  @Post('campaigns')
  create(@CurrentUser() admin: AuthUser, @Body() dto: CampaignDraftDto): Promise<CampaignView> {
    return this.campaigns.create(admin, dto);
  }

  /** "Retomar envio": so as entregas sem `resendId`. */
  @Post('campaigns/:id/resume')
  @HttpCode(200)
  resume(@Param('id') id: string): Promise<CampaignView> {
    return this.campaigns.resume(id);
  }
}
