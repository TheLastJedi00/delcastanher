import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';
import type { UserProfile } from './users.types';

/** Perfil do proprio usuario logado. Nao ha rota para ler o perfil de outro. */
@Controller('users')
@UseGuards(FirebaseAuthGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /**
   * Perfil persistido, criado na hora se o usuario existir apenas no Firebase.
   * E daqui que o front descobre se o onboarding ja foi concluido.
   */
  @Get('me')
  me(@CurrentUser() user: AuthUser): Promise<UserProfile> {
    return this.users.findOrCreate(user);
  }

  /** Grava o perfil: atende tanto o onboarding quanto a tela "Meu Perfil". */
  @Patch('me')
  updateMe(@CurrentUser() user: AuthUser, @Body() dto: UpdateUserDto): Promise<UserProfile> {
    return this.users.update(user, dto);
  }
}
