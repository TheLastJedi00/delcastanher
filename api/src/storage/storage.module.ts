import { Global, Module } from '@nestjs/common';
import { StorageService } from './storage.service';

/**
 * Global como o `FirebaseModule`: o `ContentModule` e o `CertificatesModule`
 * precisam do mesmo `StorageService`, e duplicar o provider criaria duas
 * instancias assinando URLs para o mesmo bucket.
 */
@Global()
@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
