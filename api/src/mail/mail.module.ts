import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { UnsubscribeController } from './unsubscribe.controller';
import { UnsubscribeService } from './unsubscribe.service';

/**
 * Global como o `StorageModule`: a nota fiscal e as campanhas usam o mesmo
 * `MailService`, e duplicar o provider criaria duas instancias falando com o
 * mesmo Resend. O descadastro mora aqui porque e do e-mail, e nao de quem
 * dispara.
 */
@Global()
@Module({
  controllers: [UnsubscribeController],
  providers: [MailService, UnsubscribeService],
  exports: [MailService, UnsubscribeService],
})
export class MailModule {}
