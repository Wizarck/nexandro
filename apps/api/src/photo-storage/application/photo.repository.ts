import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThan, Repository } from 'typeorm';
import { Photo, PhotoRetentionClass } from '../domain/photo.entity';

/**
 * Multi-tenant repository for {@link Photo}.
 *
 * Per ADR-MULTI-TENANT-GATE: every per-org method takes `organizationId` as
 * the FIRST parameter and includes it in every query. The cron-scoped
 * `findCandidates*` methods are exempt because the retention cron iterates
 * across all orgs by design (and the partial index drives candidate
 * selection — not the org column).
 *
 * Mutation surface:
 *  - `save()` used by `PhotoStorageService.registerUpload()` after S3 HEAD
 *  - `softDelete()` used by retention Phase 1 + future manual deletion
 *  - `hardDelete()` used by retention Phase 2 only — throws if `deleted_at IS NULL`
 */
@Injectable()
export class PhotoRepository {
  constructor(
    @InjectRepository(Photo)
    private readonly typeormRepo: Repository<Photo>,
  ) {}

  /** Find a photo by id, gated on organizationId. */
  async findById(
    organizationId: string,
    photoId: string,
  ): Promise<Photo | null> {
    return this.typeormRepo.findOne({
      where: { id: photoId, organizationId },
    });
  }

  /**
   * List a page of photos for an org. Order: newest first. Uses
   * `idx_photos_org_created` per ADR-PHOTO-METADATA-TABLE.
   */
  async listByOrg(
    organizationId: string,
    limit: number,
    offset: number,
  ): Promise<Photo[]> {
    return this.typeormRepo.find({
      where: { organizationId },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });
  }

  /** Persist a Photo entity. Returns the saved entity (round-tripped). */
  async save(photo: Photo): Promise<Photo> {
    return this.typeormRepo.save(photo);
  }

  /**
   * Retention cron Phase 1 candidates: `full_res_90d` rows past the 90-day
   * window that are still active (`deleted_at IS NULL`). Uses
   * `idx_photos_retention_class_created` partial index.
   *
   * Cron-scoped: NOT gated on `organizationId` because the cron iterates
   * across all orgs by design.
   */
  async findCandidatesForSoftDelete(
    beforeCreatedAt: Date,
    batchSize: number,
    retentionClass: PhotoRetentionClass = 'full_res_90d',
  ): Promise<Photo[]> {
    return this.typeormRepo.find({
      where: {
        retentionClass,
        createdAt: LessThan(beforeCreatedAt),
        deletedAt: IsNull(),
      },
      order: { createdAt: 'ASC' },
      take: batchSize,
    });
  }

  /**
   * Retention cron Phase 2 candidates: rows soft-deleted before the supplied
   * timestamp (i.e., past the 7-day grace window). NOT gated on
   * `organizationId` (cron-scoped).
   */
  async findCandidatesForHardDelete(
    beforeDeletedAt: Date,
    batchSize: number,
  ): Promise<Photo[]> {
    return this.typeormRepo
      .createQueryBuilder('photo')
      .where('photo.deleted_at IS NOT NULL')
      .andWhere('photo.deleted_at < :beforeDeletedAt', { beforeDeletedAt })
      .orderBy('photo.deleted_at', 'ASC')
      .limit(batchSize)
      .getMany();
  }

  /**
   * Mark a photo as soft-deleted. Sets `deleted_at` and `updated_at`. Caller
   * (cron or future manual flow) emits the `PHOTO_DELETED` audit event.
   */
  async softDelete(photoId: string, deletedAt: Date): Promise<void> {
    await this.typeormRepo.update(
      { id: photoId },
      { deletedAt, updatedAt: deletedAt },
    );
  }

  /**
   * Hard-delete a photos row. Caller MUST have already deleted the S3 object.
   * Throws if the row is not soft-deleted (defensive — Phase 2 should never
   * encounter an active row, but the invariant is cheap to check).
   */
  async hardDelete(photoId: string): Promise<void> {
    const row = await this.typeormRepo.findOne({ where: { id: photoId } });
    if (row === null) return;
    if (row.deletedAt === null) {
      throw new Error(
        `hardDelete called on active photo ${photoId} (deleted_at IS NULL)`,
      );
    }
    await this.typeormRepo.delete({ id: photoId });
  }
}
