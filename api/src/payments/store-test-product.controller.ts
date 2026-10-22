import { Controller, Get, NotFoundException, Param, UseGuards } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { PaymentTestService, TestProduct } from './payment-test.service';

/** A mesma resposta para aluno, chave errada e teste desligado. */
const NOT_FOUND = 'Página não encontrada.';

/**
 * Pagina do link secreto do modulo de teste (Spec 030, decisao 4).
 *
 * So admin, e com a chave (resposta 1). Aluno, chave errada e teste desligado
 * respondem o mesmo 404, para o link nao confirmar que o teste existe.
 */
@Controller('store/test-product')
@UseGuards(FirebaseAuthGuard)
export class StoreTestProductController {
  constructor(private readonly tests: PaymentTestService) {}

  @Get(':key')
  async product(@CurrentUser() user: AuthUser, @Param('key') key: string): Promise<TestProduct> {
    const product = user.role === 'admin' ? await this.tests.resolve(key) : null;

    if (!product) {
      throw new NotFoundException(NOT_FOUND);
    }

    return product;
  }
}
