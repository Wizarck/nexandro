import {
  Controller,
  Delete,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../shared/decorators/roles.decorator';
import { BrandAssetService, type UploadBrandMarkResult } from '../application/brand-asset.service';
import { MAX_BRAND_BYTES } from '../domain/errors';

/**
 * Owner-only endpoint to upload a brand mark via multipart. The file is
 * processed (validated, resized, SVG → PNG raster) and written to the
 * configured storage backend; the public URL is written into
 * `organizations.label_fields.brandMarkUrl` as a write-through so the
 * existing GET /:id/label-fields response stays the single read source.
 */
@ApiTags('Organizations — brand mark')
@Controller('organizations')
export class BrandAssetController {
  constructor(private readonly service: BrandAssetService) {}

  @Post(':id/brand-mark')
  @Roles('OWNER')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_BRAND_BYTES },
    }),
  )
  @ApiOperation({
    summary: 'Upload a brand-mark image (Owner only)',
    description:
      'Multipart upload. Accepts PNG, JPEG, WEBP, SVG up to 2 MB. SVG is ' +
      'rasterised to PNG at upload time; raster inputs are resized to fit ' +
      '1024×1024. The returned URL is also written to `label_fields.brandMarkUrl`.',
  })
  async uploadBrandMark(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<UploadBrandMarkResult> {
    return this.service.uploadBrandMark(id, file);
  }

  @Delete(':id/brand-mark')
  @Roles('OWNER')
  @HttpCode(204)
  @ApiOperation({ summary: 'Remove the brand mark and clear label_fields.brandMarkUrl' })
  async deleteBrandMark(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string): Promise<void> {
    await this.service.deleteBrandMark(id);
  }
}
