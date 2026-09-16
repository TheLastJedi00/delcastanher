import { Body, Controller, Get, HttpCode, Param, Patch, Query, UseGuards } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UpdateUserRoleDto, UpdateUserStatusDto } from './dto/admin-user-action.dto';
import { ListAdminUsersDto } from './dto/list-admin-users.dto';
import { AdminUsersService } from './users.admin.service';
import type { AdminUserDetail, AdminUserListResult } from './users.admin.types';

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

  /**
   * Detalhe de um aluno, em leitura. Declarado **depois** das rotas de
   * caminho fixo desta classe: `:id` casaria com qualquer uma delas.
   */
  @Get(':id')
  findOne(@Param('id') id: string): Promise<AdminUserDetail> {
    return this.users.findOne(id);
  }

  /**
   * Promove ou rebaixa. Responde 204: a tela recarrega a pagina depois da
   * acao de qualquer forma, porque os KPIs do topo tambem mudam — devolver a
   * linha atualizada daria a ela um dado que ela nao usaria.
   */
  @Patch(':id/role')
  @HttpCode(204)
  setRole(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateUserRoleDto,
  ): Promise<void> {
    return this.users.setRole(actor, id, dto.role);
  }

  /** Bloqueia ou libera o acesso. Nada e apagado (decisao 9). */
  @Patch(':id/status')
  @HttpCode(204)
  setStatus(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateUserStatusDto,
  ): Promise<void> {
    return this.users.setBlocked(actor, id, dto.blocked);
  }
}
