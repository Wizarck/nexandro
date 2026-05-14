import { randomUUID } from 'node:crypto';
import { Photo } from './photo.entity';
import {
  InvalidMimeTypeError,
  InvalidPhotoSizeError,
  InvalidRetentionClassError,
  InvalidPhotoIdError,
} from './errors';

const ORG = '00000000-0000-4000-8000-00000000aaaa';
const USER = '00000000-0000-4000-8000-00000000bbbb';

describe('Photo entity', () => {
  describe('create', () => {
    it('produces entity with deleted_at=null and derived s3_key', () => {
      const id = randomUUID();
      const photo = Photo.create({
        id,
        organizationId: ORG,
        mimeType: 'image/jpeg',
        byteSize: 1024,
        uploadedByUserId: USER,
        retentionClass: 'full_res_90d',
      });
      expect(photo.id).toBe(id);
      expect(photo.organizationId).toBe(ORG);
      expect(photo.mimeType).toBe('image/jpeg');
      expect(photo.byteSize).toBe(1024);
      expect(photo.retentionClass).toBe('full_res_90d');
      expect(photo.deletedAt).toBeNull();
      expect(photo.s3Key).toBe(`org/${ORG}/photos/${id}.jpg`);
      // Defensive timestamp seed — @CreateDateColumn doesn't fire outside DB
      expect(photo.createdAt).toBeInstanceOf(Date);
      expect(photo.updatedAt).toBeInstanceOf(Date);
    });

    it('generates a UUID when id is omitted', () => {
      const photo = Photo.create({
        organizationId: ORG,
        mimeType: 'image/png',
        byteSize: 2048,
        uploadedByUserId: USER,
        retentionClass: 'full_res_90d',
      });
      expect(photo.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it('builds s3_key with .webp extension for image/webp', () => {
      const photo = Photo.create({
        organizationId: ORG,
        mimeType: 'image/webp',
        byteSize: 512,
        uploadedByUserId: USER,
        retentionClass: 'thumbnail_indefinite',
      });
      expect(photo.s3Key.endsWith('.webp')).toBe(true);
    });

    it('builds s3_key with .heic extension for image/heic', () => {
      const photo = Photo.create({
        organizationId: ORG,
        mimeType: 'image/heic',
        byteSize: 1024,
        uploadedByUserId: USER,
        retentionClass: 'full_res_90d',
      });
      expect(photo.s3Key.endsWith('.heic')).toBe(true);
    });

    it('throws InvalidMimeTypeError for unsupported mime', () => {
      expect(() =>
        Photo.create({
          organizationId: ORG,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          mimeType: 'image/gif' as any,
          byteSize: 1024,
          uploadedByUserId: USER,
          retentionClass: 'full_res_90d',
        }),
      ).toThrow(InvalidMimeTypeError);
    });

    it('throws InvalidPhotoSizeError for byte_size=0', () => {
      expect(() =>
        Photo.create({
          organizationId: ORG,
          mimeType: 'image/jpeg',
          byteSize: 0,
          uploadedByUserId: USER,
          retentionClass: 'full_res_90d',
        }),
      ).toThrow(InvalidPhotoSizeError);
    });

    it('throws InvalidPhotoSizeError for negative byte_size', () => {
      expect(() =>
        Photo.create({
          organizationId: ORG,
          mimeType: 'image/jpeg',
          byteSize: -5,
          uploadedByUserId: USER,
          retentionClass: 'full_res_90d',
        }),
      ).toThrow(InvalidPhotoSizeError);
    });

    it('throws InvalidPhotoSizeError for non-integer byte_size', () => {
      expect(() =>
        Photo.create({
          organizationId: ORG,
          mimeType: 'image/jpeg',
          byteSize: 1024.5,
          uploadedByUserId: USER,
          retentionClass: 'full_res_90d',
        }),
      ).toThrow(InvalidPhotoSizeError);
    });

    it('throws InvalidRetentionClassError for invalid retention class', () => {
      expect(() =>
        Photo.create({
          organizationId: ORG,
          mimeType: 'image/jpeg',
          byteSize: 1024,
          uploadedByUserId: USER,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          retentionClass: 'forever' as any,
        }),
      ).toThrow(InvalidRetentionClassError);
    });

    it('throws InvalidPhotoIdError for malformed organizationId', () => {
      expect(() =>
        Photo.create({
          organizationId: 'not-a-uuid',
          mimeType: 'image/jpeg',
          byteSize: 1024,
          uploadedByUserId: USER,
          retentionClass: 'full_res_90d',
        }),
      ).toThrow(InvalidPhotoIdError);
    });

    it('accepts all 3 retention class values', () => {
      const variants: Array<
        'full_res_90d' | 'thumbnail_indefinite' | 'legal_hold'
      > = ['full_res_90d', 'thumbnail_indefinite', 'legal_hold'];
      for (const variant of variants) {
        const photo = Photo.create({
          organizationId: ORG,
          mimeType: 'image/jpeg',
          byteSize: 1024,
          uploadedByUserId: USER,
          retentionClass: variant,
        });
        expect(photo.retentionClass).toBe(variant);
      }
    });
  });

  describe('buildS3Key', () => {
    it('encodes the org-prefix pattern', () => {
      const id = randomUUID();
      const key = Photo.buildS3Key(ORG, id, 'image/jpeg');
      expect(key).toBe(`org/${ORG}/photos/${id}.jpg`);
    });
  });
});
