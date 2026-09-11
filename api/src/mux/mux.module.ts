import { Global, Module } from '@nestjs/common';
import { MuxService } from './mux.service';

/** Global como o `StorageModule`: uma unica porta para a CDN (decisao 16). */
@Global()
@Module({
  providers: [MuxService],
  exports: [MuxService],
})
export class MuxModule {}
