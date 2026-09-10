import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { ProgressController } from './progress.controller';
import { ProgressService } from './progress.service';

@Module({
  // UsersModule entra por causa do `findOrCreate`: o aluno precisa existir no
  // banco antes da primeira conclusao de modulo (FK de module_progress).
  imports: [AuthModule, UsersModule],
  controllers: [ProgressController],
  providers: [ProgressService],
  exports: [ProgressService],
})
export class ProgressModule {}
