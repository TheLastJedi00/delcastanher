import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { CertificatesModule } from './certificates/certificates.module';
import { ContentModule } from './content/content.module';
import { CoursesModule } from './courses/courses.module';
import { FirebaseModule } from './firebase/firebase.module';
import { LegalModule } from './legal/legal.module';
import { MailModule } from './mail/mail.module';
import { MuxModule } from './mux/mux.module';
import { PaymentsModule } from './payments/payments.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProgressModule } from './progress/progress.module';
import { StorageModule } from './storage/storage.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    FirebaseModule,
    StorageModule,
    MailModule,
    MuxModule,
    AuthModule,
    UsersModule,
    ProgressModule,
    CertificatesModule,
    ContentModule,
    PaymentsModule,
    CampaignsModule,
    LegalModule,
    CoursesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
