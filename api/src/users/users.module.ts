import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminUsersController } from './users.admin.controller';
import { AdminUsersService } from './users.admin.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

/**
 * A leitura administrativa entra aqui, e nao em um modulo proprio: a entidade
 * e a mesma, o que muda e o leitor (Spec 013).
 */
@Module({
  imports: [AuthModule],
  controllers: [UsersController, AdminUsersController],
  providers: [UsersService, AdminUsersService],
  exports: [UsersService],
})
export class UsersModule {}
