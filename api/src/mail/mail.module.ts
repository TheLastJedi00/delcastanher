import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service';

/**
 * Global como o `StorageModule`: a nota fiscal (`InvoicesModule`) e as
 * campanhas usam o mesmo `MailService`, e duplicar o provider criaria duas
 * instancias falando com o mesmo Resend.
 */
@Global()
@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
