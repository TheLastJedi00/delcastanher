import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderView, OrdersService } from './orders.service';

/**
 * Pedidos do proprio aluno (Spec 014).
 *
 * Como em `users` e `progress`, nao existe rota para ver o pedido de outra
 * pessoa: o dono vem do token, nunca da URL — e pedido alheio responde 404, e
 * nao 403, porque um 403 confirmaria que aquele id existe.
 */
@Controller('orders')
@UseGuards(FirebaseAuthGuard)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  /**
   * Cria o pedido e cobra. Nao recebe preco: o valor e somado no servidor a
   * partir de `Module.priceCents` (decisao 2).
   */
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateOrderDto): Promise<OrderView> {
    return this.orders.create(user, dto);
  }

  /** Historico de compras do aluno. */
  @Get('me')
  listMine(@CurrentUser() user: AuthUser): Promise<OrderView[]> {
    return this.orders.listMine(user);
  }

  /**
   * Estado do pedido, reconsultando o gateway enquanto ele estiver pendente
   * (decisao 14) — em `localhost` nenhum webhook chega, e em producao um
   * webhook perdido deixaria o aluno olhando um QR pago sem resposta.
   */
  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<OrderView> {
    return this.orders.findOne(user, id);
  }
}
