import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminEmailController } from './admin-email.controller';
import { CampaignsService } from './campaigns.service';

/**
 * Campanhas de e-mail (Spec 023, Parte B). O envio e do `MailModule`, global;
 * aqui fica so quem escolhe os destinatarios e guarda o historico.
 */
@Module({
  imports: [AuthModule],
  controllers: [AdminEmailController],
  providers: [CampaignsService],
})
export class CampaignsModule {}
