import {
  BadRequestException,
  Controller,
  DefaultValuePipe,
  Get,
  ParseIntPipe,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../shared/decorators/roles.decorator';
import {
  DashboardService,
  RankingDirection,
  type KpisResult,
} from '../application/dashboard.service';
import { RankingResultDto } from './dto/dashboard.dto';

const VALID_DIRECTIONS: ReadonlySet<RankingDirection> = new Set(['top', 'bottom']);

@ApiTags('Owner Dashboard')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('menu-items')
  @Roles('OWNER', 'MANAGER')
  @ApiOperation({
    summary: 'Top/bottom-5 MenuItem ranking by margin (Journey 3 Owner dashboard)',
    description:
      'Owner + Manager only. 60-second in-memory cache; invalidated on SUPPLIER_PRICE_UPDATED. Default windowDays=7, direction=top, n=5.',
  })
  async getMenuItems(
    @Query('organizationId', new ParseUUIDPipe({ version: '4' })) organizationId: string,
    @Query('direction', new DefaultValuePipe('top')) direction: string,
    @Query('windowDays', new DefaultValuePipe(7), new ParseIntPipe()) windowDays: number,
    @Query('n', new DefaultValuePipe(5), new ParseIntPipe()) n: number,
  ): Promise<RankingResultDto> {
    if (!VALID_DIRECTIONS.has(direction as RankingDirection)) {
      throw new BadRequestException({
        code: 'DASHBOARD_INVALID_DIRECTION',
        detail: 'direction must be "top" or "bottom"',
      });
    }
    if (windowDays < 1 || windowDays > 365) {
      throw new BadRequestException({
        code: 'DASHBOARD_INVALID_WINDOW',
        detail: 'windowDays must be between 1 and 365',
      });
    }
    if (n < 1 || n > 50) {
      throw new BadRequestException({
        code: 'DASHBOARD_INVALID_N',
        detail: 'n must be between 1 and 50',
      });
    }
    const result = await this.dashboard.getTopBottomMenuItems(
      organizationId,
      direction as RankingDirection,
      windowDays,
      n,
    );
    return RankingResultDto.from(result);
  }

  @Get('kpis')
  @Roles('OWNER', 'MANAGER')
  @ApiOperation({
    summary: 'KPI header for the Owner dashboard (ventas potenciales · coste · margen · margen %)',
    description:
      'Audit 2026-05-18 L1-8. Sales is honest-stub (POS not integrated) — returns potencial = sum of active MenuItem sellingPrices, OR null with a note. Cost / margen / margen % computed live from CostService.',
  })
  async getKpis(
    @Query('organizationId', new ParseUUIDPipe({ version: '4' })) organizationId: string,
    @Query('windowDays', new DefaultValuePipe(7), new ParseIntPipe()) windowDays: number,
  ): Promise<KpisResult> {
    if (windowDays < 1 || windowDays > 365) {
      throw new BadRequestException({
        code: 'DASHBOARD_INVALID_WINDOW',
        detail: 'windowDays must be between 1 and 365',
      });
    }
    return this.dashboard.getKpis(organizationId, windowDays);
  }
}
