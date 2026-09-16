import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ListAdminUsersDto } from './dto/list-admin-users.dto';
import { AdminUsersService } from './users.admin.service';
import type { AdminUserListResult } from './users.admin.types';

/**
 * Leitura administrativa de usuarios. Separado do `UsersController`, que e o
 * perfil do **proprio** usuario logado e nao tem rota para ler o de outro: a
 * diferenca entre os dois nao e de entidade, e de quem pode ver o que.
 *
 * Os guards valem para a classe inteira, no padrao dos controllers de
 * administracao da Spec 012. Quem autoriza e o claim do token, e nunca a
 * coluna `role` do banco, que e espelho de leitura (decisao 3).
 */
@Controller('admin/users')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles('admin')
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  /**
   * Uma pagina da listagem, com os KPIs da base inteira. Busca, filtro,
   * ordenacao e paginacao sao do servidor (decisao 7).
   */
  @Get()
  list(@Query() query: ListAdminUsersDto): Promise<AdminUserListResult> {
    return this.users.list(query);
  }
}
