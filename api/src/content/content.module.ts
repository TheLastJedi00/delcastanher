import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminContentController } from './admin-content.controller';
import { ContentController } from './content.controller';
import { ContentService } from './content.service';
import { MuxWebhookController } from './mux-webhook.controller';
import { VideoService } from './video.service';

@Module({
  imports: [AuthModule],
  controllers: [AdminContentController, ContentController, MuxWebhookController],
  providers: [ContentService, VideoService],
  exports: [ContentService, VideoService],
})
export class ContentModule {}
