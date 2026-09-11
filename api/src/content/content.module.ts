import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminContentController } from './admin-content.controller';
import { ContentController } from './content.controller';
import { ContentService } from './content.service';

@Module({
  imports: [AuthModule],
  controllers: [AdminContentController, ContentController],
  providers: [ContentService],
  exports: [ContentService],
})
export class ContentModule {}
