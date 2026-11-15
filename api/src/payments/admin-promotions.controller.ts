import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Transform, Type } from 'class-transformer';
import {
  IsDate,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { MAX_PERCENT_OFF } from './promotion';
import {
  PromotionListItem,
  PromotionView,
  PromotionsService,
} from './promotions.service';
import { StoreOffer, StoreService } from './store.service';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Datas chegam em ISO 8601 com fuso (o painel converte o horario de Brasilia,
 * decisao 7). `Date` invalida vira `Invalid Date`, que o `@IsDate` recusa.
 */
const toDate = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? new Date(value) : value;

export class CreatePromotionDto {
  @Transform(trim)
  @IsString({ message: 'Informe o nome da campanha.' })
  @IsNotEmpty({ message: 'Informe o nome da campanha.' })
  @MaxLength(60, { message: 'O nome pode ter até 60 caracteres.' })
  name!: string;

  @Type(() => Number)
  @IsInt({ message: 'O desconto deve ser um número inteiro.' })
  @Min(1, { message: `O desconto deve ser de 1 a ${MAX_PERCENT_OFF}%.` })
  @Max(MAX_PERCENT_OFF, {
    message: `O desconto deve ser de 1 a ${MAX_PERCENT_OFF}%.`,
  })
  percentOff!: number;

  @Transform(toDate)
  @IsDate({ message: 'Informe o início da campanha.' })
  startsAt!: Date;

  @Transform(toDate)
  @IsDate({ message: 'Informe o fim da campanha.' })
  endsAt!: Date;
}

/** Tudo opcional: o servico decide o que pode mudar pelo estado (decisao 2). */
export class UpdatePromotionDto {
  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'Informe o nome da campanha.' })
  @IsNotEmpty({ message: 'Informe o nome da campanha.' })
  @MaxLength(60, { message: 'O nome pode ter até 60 caracteres.' })
  name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'O desconto deve ser um número inteiro.' })
  @Min(1, { message: `O desconto deve ser de 1 a ${MAX_PERCENT_OFF}%.` })
  @Max(MAX_PERCENT_OFF, {
    message: `O desconto deve ser de 1 a ${MAX_PERCENT_OFF}%.`,
  })
  percentOff?: number;

  @IsOptional()
  @Transform(toDate)
  @IsDate({ message: 'Início inválido.' })
  startsAt?: Date;

  @IsOptional()
  @Transform(toDate)
  @IsDate({ message: 'Fim inválido.' })
  endsAt?: Date;
}

export class PreviewPromotionQuery {
  @Type(() => Number)
  @IsInt({ message: 'O desconto deve ser um número inteiro.' })
  @Min(1, { message: `O desconto deve ser de 1 a ${MAX_PERCENT_OFF}%.` })
  @Max(MAX_PERCENT_OFF, {
    message: `O desconto deve ser de 1 a ${MAX_PERCENT_OFF}%.`,
  })
  percentOff!: number;
}

/**
 * Campanhas de desconto no financeiro (Spec 032, decisao 10). Guards na
 * classe, como em todo controller administrativo.
 */
@Controller('admin/promotions')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles('admin')
export class AdminPromotionsController {
  constructor(
    private readonly promotions: PromotionsService,
    private readonly store: StoreService,
  ) {}

  @Get()
  list(): Promise<PromotionListItem[]> {
    return this.promotions.list();
  }

  /**
   * "O pacote sai de R$ 989,00 por R$ 692,30": a previa do formulario, pela
   * mesma conta da loja, para nao haver uma segunda no front.
   */
  @Get('preview')
  preview(
    @Query() query: PreviewPromotionQuery,
  ): Promise<Omit<StoreOffer, 'promotion'>> {
    return this.store.prices(query.percentOff);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreatePromotionDto,
  ): Promise<PromotionView> {
    return this.promotions.create(
      {
        name: dto.name,
        percentOff: dto.percentOff,
        startsAt: dto.startsAt,
        endsAt: dto.endsAt,
      },
      user.uid,
    );
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePromotionDto,
  ): Promise<PromotionView> {
    // `@IsOptional` deixa passar `null`; campo nulo e "nao mudar", como ausente.
    const input = Object.fromEntries(
      Object.entries(dto).filter(
        ([, value]) => value !== undefined && value !== null,
      ),
    );

    return this.promotions.update(id, input);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void> {
    return this.promotions.remove(id);
  }

  @Post(':id/end')
  @HttpCode(200)
  end(@Param('id') id: string): Promise<PromotionView> {
    return this.promotions.endNow(id);
  }
}
