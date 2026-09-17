import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AdminAccessItem, AdminAccessService, AdminOrderItem } from './admin-access.service';
import { GrantAccessDto } from './dto/admin-access.dto';

/**
 * Acessos e pedidos de um aluno, para o suporte (Spec 014, decisoes 20 e 23).
 *
 * Os dois guards valem para a classe inteira, e nao por rota: aqui **nenhum**
 * endpoint e para aluno, e deixar a protecao no metodo faria da proxima rota
 * um furo por esquecimento (Spec 010, decisao 13).
 */
@Controller('admin/users')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles('admin')
export class AdminAccessController {
  constructor(private readonly access: AdminAccessService) {}

  /** Acessos do aluno, inclusive os ja vencidos. */
  @Get(':id/access')
  list(@Param('id') id: string): Promise<AdminAccessItem[]> {
    return this.access.listFor(id);
  }

  /** Concede cortesia: 6 meses, sem pagamento. */
  @Post(':id/access')
  @HttpCode(204)
  grant(@Param('id') id: string, @Body() dto: GrantAccessDto): Promise<void> {
    return this.access.grant(id, dto.moduleId);
  }

  /** Revoga o acesso. Progresso e certificado ficam onde estao. */
  @Delete(':id/access/:moduleId')
  @HttpCode(204)
  revoke(@Param('id') id: string, @Param('moduleId') moduleId: string): Promise<void> {
    return this.access.revoke(id, moduleId);
  }

  /** Pedidos do aluno — o que o suporte precisa para responder sobre cobranca. */
  @Get(':id/orders')
  orders(@Param('id') id: string): Promise<AdminOrderItem[]> {
    return this.access.ordersFor(id);
  }
}
