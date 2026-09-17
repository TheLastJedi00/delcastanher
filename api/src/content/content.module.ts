import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PaymentsModule } from '../payments/payments.module';
import { AdminContentController } from './admin-content.controller';
import { AdminLessonsController } from './admin-lessons.controller';
import { ContentController } from './content.controller';
import { ContentService } from './content.service';
import { LessonsService } from './lessons.service';
import { MuxWebhookController } from './mux-webhook.controller';
import { VideoService } from './video.service';

@Module({
  imports: [AuthModule, PaymentsModule],
  controllers: [
    AdminContentController,
    AdminLessonsController,
    ContentController,
    MuxWebhookController,
  ],
  providers: [ContentService, LessonsService, VideoService],
  exports: [ContentService, LessonsService, VideoService],
})
export class ContentModule {}
