import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Organization } from '../iam/domain/organization.entity';
import { BRAND_ASSET_STORAGE, type BrandAssetStorage } from './application/brand-asset-storage';
import { BrandAssetProcessor } from './application/brand-asset-processor';
import { BrandAssetService } from './application/brand-asset.service';
import { LocalFsBrandAssetStorage } from './application/local-fs-brand-asset-storage';
import { S3BrandAssetStorage } from './application/s3-brand-asset-storage';
import { BrandAssetController } from './interface/brand-asset.controller';

/**
 * Brand-marks bounded context. One asset per organization, stored either
 * on the local filesystem (default, self-host) or in S3-compatible object
 * storage (R2 / AWS / MinIO, SaaS deploy).
 *
 * Env config (read at module construction):
 *   NEXANDRO_BRAND_ASSET_STORAGE       = 'local' (default) | 's3'
 *
 *   Local-fs config:
 *     NEXANDRO_BRAND_ASSET_LOCAL_DIR        default: /var/lib/nexandro/brand-marks
 *     NEXANDRO_BRAND_ASSET_PUBLIC_URL_BASE  default: /static/brand-marks
 *
 *   S3 config (required when STORAGE=s3):
 *     NEXANDRO_BRAND_ASSET_S3_ENDPOINT           optional — omit for AWS S3, set for R2/MinIO
 *     NEXANDRO_BRAND_ASSET_S3_REGION             default: auto
 *     NEXANDRO_BRAND_ASSET_S3_BUCKET             required
 *     NEXANDRO_BRAND_ASSET_S3_ACCESS_KEY_ID      required
 *     NEXANDRO_BRAND_ASSET_S3_SECRET_ACCESS_KEY  required
 *     NEXANDRO_BRAND_ASSET_S3_PUBLIC_URL_BASE    required (public CDN/host URL prefix)
 *     NEXANDRO_BRAND_ASSET_S3_KEY_PREFIX         default: brand-marks
 *     NEXANDRO_BRAND_ASSET_S3_FORCE_PATH_STYLE   default: true when endpoint set, false otherwise
 */
@Module({
  imports: [TypeOrmModule.forFeature([Organization])],
  controllers: [BrandAssetController],
  providers: [
    BrandAssetProcessor,
    BrandAssetService,
    {
      provide: BRAND_ASSET_STORAGE,
      useFactory: (): BrandAssetStorage => {
        const mode = (process.env.NEXANDRO_BRAND_ASSET_STORAGE ?? 'local').toLowerCase();
        if (mode === 's3') {
          return new S3BrandAssetStorage({
            endpoint: process.env.NEXANDRO_BRAND_ASSET_S3_ENDPOINT || undefined,
            region: process.env.NEXANDRO_BRAND_ASSET_S3_REGION ?? 'auto',
            bucket: required('NEXANDRO_BRAND_ASSET_S3_BUCKET'),
            accessKeyId: required('NEXANDRO_BRAND_ASSET_S3_ACCESS_KEY_ID'),
            secretAccessKey: required('NEXANDRO_BRAND_ASSET_S3_SECRET_ACCESS_KEY'),
            publicUrlBase: required('NEXANDRO_BRAND_ASSET_S3_PUBLIC_URL_BASE'),
            keyPrefix: process.env.NEXANDRO_BRAND_ASSET_S3_KEY_PREFIX || 'brand-marks',
            forcePathStyle:
              process.env.NEXANDRO_BRAND_ASSET_S3_FORCE_PATH_STYLE === 'true' ? true
                : process.env.NEXANDRO_BRAND_ASSET_S3_FORCE_PATH_STYLE === 'false' ? false
                : undefined,
          });
        }
        return new LocalFsBrandAssetStorage({
          rootDir: process.env.NEXANDRO_BRAND_ASSET_LOCAL_DIR ?? '/var/lib/nexandro/brand-marks',
          publicUrlBase: process.env.NEXANDRO_BRAND_ASSET_PUBLIC_URL_BASE ?? '/static/brand-marks',
        });
      },
    },
  ],
  exports: [BrandAssetService],
})
export class BrandAssetsModule {}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`brand-assets: ${name} is required when NEXANDRO_BRAND_ASSET_STORAGE=s3`);
  return v;
}
