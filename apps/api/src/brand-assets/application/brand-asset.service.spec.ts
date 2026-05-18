import { NotFoundException } from '@nestjs/common';
import sharp = require('sharp');
import type { Repository } from 'typeorm';
import { Organization } from '../../iam/domain/organization.entity';
import { BrandAssetProcessor } from './brand-asset-processor';
import { BrandAssetService } from './brand-asset.service';
import type { BrandAssetStorage } from './brand-asset-storage';

describe('BrandAssetService', () => {
  let savedOrg: Organization | null;
  let orgRepoStub: Partial<Repository<Organization>>;
  let storageStub: BrandAssetStorage;
  let service: BrandAssetService;

  beforeEach(() => {
    savedOrg = null;
    const org = new Organization();
    org.id = 'org-1';
    org.name = 'Trattoria Acme';
    org.labelFields = { businessName: 'Trattoria Acme', pageSize: 'a4' };

    orgRepoStub = {
      findOne: async ({ where }) =>
        (where as { id: string }).id === org.id ? org : null,
      save: async (e) => {
        savedOrg = e as Organization;
        return e;
      },
    };

    storageStub = {
      put: jest.fn().mockResolvedValue({ url: '/static/brand-marks/org-1.png?v=42' }),
      delete: jest.fn().mockResolvedValue(undefined),
    };

    service = new BrandAssetService(
      new BrandAssetProcessor(),
      storageStub,
      orgRepoStub as Repository<Organization>,
    );
  });

  it('processes the upload + stores it + write-throughs the URL into labelFields', async () => {
    const png = await sharp({
      create: { width: 100, height: 100, channels: 3, background: '#00ff00' },
    })
      .png()
      .toBuffer();

    const result = await service.uploadBrandMark('org-1', { buffer: png, mimetype: 'image/png' });

    expect(result.brandMarkUrl).toBe('/static/brand-marks/org-1.png?v=42');
    expect(result.width).toBe(100);
    expect(result.height).toBe(100);
    expect(storageStub.put).toHaveBeenCalledWith('org-1', expect.any(Buffer), 'image/png', 'png');
    // labelFields write-through: existing keys preserved, brandMarkUrl set.
    expect(savedOrg?.labelFields).toEqual({
      businessName: 'Trattoria Acme',
      pageSize: 'a4',
      brandMarkUrl: '/static/brand-marks/org-1.png?v=42',
    });
  });

  it('throws NotFoundException for unknown organization', async () => {
    await expect(
      service.uploadBrandMark('does-not-exist', { buffer: Buffer.from([]), mimetype: 'image/png' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('delete() removes the asset AND clears brandMarkUrl from labelFields', async () => {
    const png = await sharp({
      create: { width: 10, height: 10, channels: 3, background: '#fff' },
    })
      .png()
      .toBuffer();
    await service.uploadBrandMark('org-1', { buffer: png, mimetype: 'image/png' });

    await service.deleteBrandMark('org-1');
    expect(storageStub.delete).toHaveBeenCalledWith('org-1');
    expect(savedOrg?.labelFields?.brandMarkUrl).toBeUndefined();
    // Other fields preserved.
    expect(savedOrg?.labelFields?.businessName).toBe('Trattoria Acme');
  });
});
