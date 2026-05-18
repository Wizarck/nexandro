import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Organization } from '../../iam/domain/organization.entity';
import { BRAND_ASSET_STORAGE, type BrandAssetStorage } from './brand-asset-storage';
import { BrandAssetProcessor } from './brand-asset-processor';

export interface UploadBrandMarkResult {
  brandMarkUrl: string;
  byteSize: number;
  width: number;
  height: number;
}

/**
 * Orchestrates a brand-mark upload:
 *
 *   1. Pass the multipart buffer to `BrandAssetProcessor` (validate + resize +
 *      raster-on-SVG).
 *   2. Pass the normalized buffer to the configured `BrandAssetStorage`.
 *   3. Write the returned public URL into `organizations.label_fields.brandMarkUrl`
 *      (jsonb merge — preserves every other label field).
 *
 * The org lookup runs WITHOUT cross-org guard because the caller must already
 * be `OWNER` of `organizationId` (enforced in the controller via `@Roles`).
 */
@Injectable()
export class BrandAssetService {
  private readonly logger = new Logger(BrandAssetService.name);

  constructor(
    private readonly processor: BrandAssetProcessor,
    @Inject(BRAND_ASSET_STORAGE) private readonly storage: BrandAssetStorage,
    @InjectRepository(Organization) private readonly orgRepo: Repository<Organization>,
  ) {}

  async uploadBrandMark(
    organizationId: string,
    file: { buffer: Buffer; mimetype: string },
  ): Promise<UploadBrandMarkResult> {
    const org = await this.orgRepo.findOne({ where: { id: organizationId } });
    if (!org) throw new NotFoundException(`Organization ${organizationId} not found`);

    const processed = await this.processor.process(file.buffer, file.mimetype);
    const { url } = await this.storage.put(
      organizationId,
      processed.bytes,
      processed.contentType,
      processed.extension,
    );

    const next = { ...(org.labelFields ?? {}), brandMarkUrl: url };
    org.labelFields = next;
    await this.orgRepo.save(org);

    this.logger.log(
      `brand-asset: org=${organizationId} stored ${processed.bytes.length}B ` +
        `(${processed.width}×${processed.height} ${processed.contentType}) → ${url}`,
    );

    return {
      brandMarkUrl: url,
      byteSize: processed.bytes.length,
      width: processed.width,
      height: processed.height,
    };
  }

  async deleteBrandMark(organizationId: string): Promise<void> {
    const org = await this.orgRepo.findOne({ where: { id: organizationId } });
    if (!org) throw new NotFoundException(`Organization ${organizationId} not found`);

    await this.storage.delete(organizationId);

    if (org.labelFields?.brandMarkUrl) {
      const { brandMarkUrl: _drop, ...rest } = org.labelFields;
      org.labelFields = rest;
      await this.orgRepo.save(org);
    }
  }
}
