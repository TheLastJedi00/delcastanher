import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AdminBundleTier, AdminBundleView, BundlesService } from './bundles.service';
import { UpdateBundleTierDto } from './dto/update-bundle-tier.dto';

/**
 * Pacote e lotes no painel (Spec 019, decisao 13): ver quanto cada lote vendeu
 * e ajustar preco e vagas.
 *
 * Guards na classe, como em todo controller administrativo: aqui nenhuma rota
 * e para aluno, e a protecao por metodo faria da proxima rota um furo por
 * esquecimento (Spec 010, decisao 13).
 */
@Controller('admin/bundles')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles('admin')
export class AdminBundlesController {
  constructor(private readonly bundles: BundlesService) {}

  /** Lotes com vagas ocupadas e o vigente marcado. */
  @Get(':slug')
  view(@Param('slug') slug: string): Promise<AdminBundleView> {
    return this.bundles.adminView(slug);
  }

  /** Preco e vagas de um lote. Nome e ordem nao sao editaveis. */
  @Patch(':slug/tiers/:tierId')
  updateTier(
    @Param('slug') slug: string,
    @Param('tierId') tierId: string,
    @Body() dto: UpdateBundleTierDto,
  ): Promise<AdminBundleTier> {
    return this.bundles.updateTier(slug, tierId, dto);
  }
}
