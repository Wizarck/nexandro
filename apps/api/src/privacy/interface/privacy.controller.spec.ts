import { BadRequestException, UnprocessableEntityException } from '@nestjs/common';
import type { Response } from 'express';
import {
  RetentionPolicyValidationError,
  type PrivacyService,
} from '../application/privacy.service';
import { PrivacyController } from './privacy.controller';

const ORG = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';

function makeRes(): Response & { _headers: Record<string, string> } {
  const headers: Record<string, string> = {};
  return {
    setHeader: jest.fn((name: string, value: string) => {
      headers[name.toLowerCase()] = String(value);
    }),
    _headers: headers,
    req: { user: { id: USER } },
  } as unknown as Response & { _headers: Record<string, string> };
}

function makeService(overrides: Partial<jest.Mocked<PrivacyService>> = {}): {
  controller: PrivacyController;
  svc: jest.Mocked<PrivacyService>;
} {
  const svc = {
    exportOrganization: jest.fn(),
    scheduleDeletion: jest.fn(),
    cancelScheduledDeletion: jest.fn(),
    updateRetentionPolicy: jest.fn(),
    updateDpoContact: jest.fn(),
    getPrivacyState: jest.fn(),
    ...overrides,
  } as unknown as jest.Mocked<PrivacyService>;
  return { controller: new PrivacyController(svc), svc };
}

describe('PrivacyController', () => {
  describe('getState', () => {
    it('returns the org GDPR state', async () => {
      const { controller, svc } = makeService();
      svc.getPrivacyState.mockResolvedValue({
        organizationId: ORG,
        deletionScheduledAt: null,
        retentionPolicy: {
          audit_log_days: 2555,
          photos_days: 90,
          m3_review_queue_days: 365,
        },
        dpoContact: null,
      });
      const result = await controller.getState(ORG);
      expect(svc.getPrivacyState).toHaveBeenCalledWith(ORG);
      expect(result.organizationId).toBe(ORG);
      expect(result.retentionPolicy.audit_log_days).toBe(2555);
    });

    it('400 when organizationId missing', async () => {
      const { controller } = makeService();
      await expect(controller.getState(undefined as unknown as string)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('exportMiData', () => {
    it('streams ZIP with content-disposition + audit envelope is the service contract', async () => {
      const { controller, svc } = makeService();
      const zipBytes = Buffer.from([0x50, 0x4b, 0x05, 0x06, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]); // bare EOCD
      svc.exportOrganization.mockResolvedValue({
        zip: zipBytes,
        filename: `nexandro-data-export-${ORG}-2026-05-18.zip`,
      });
      const res = makeRes();
      const file = await controller.exportMiData(ORG, res);
      expect(svc.exportOrganization).toHaveBeenCalledWith(ORG, USER);
      expect(res._headers['content-type']).toBe('application/zip');
      expect(res._headers['content-disposition']).toContain('attachment');
      expect(res._headers['content-disposition']).toContain('nexandro-data-export-');
      expect(res._headers['content-length']).toBe(String(zipBytes.length));
      const stream = file.getStream();
      const chunks: Buffer[] = [];
      for await (const chunk of stream as AsyncIterable<Buffer>) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      expect(Buffer.concat(chunks).equals(zipBytes)).toBe(true);
    });
  });

  describe('scheduleDelete', () => {
    it('marks the org + returns scheduled timestamp + grace days', async () => {
      const { controller, svc } = makeService();
      svc.scheduleDeletion.mockResolvedValue({
        deletionScheduledAt: '2026-06-17T10:00:00.000Z',
      });
      const result = await controller.scheduleDelete(ORG, makeRes());
      expect(svc.scheduleDeletion).toHaveBeenCalledWith(ORG, USER);
      expect(result.organizationId).toBe(ORG);
      expect(result.deletionScheduledAt).toBe('2026-06-17T10:00:00.000Z');
      expect(result.graceDays).toBe(30);
    });
  });

  describe('cancelDelete', () => {
    it('reverses the schedule and reports wasScheduled=true', async () => {
      const { controller, svc } = makeService();
      svc.cancelScheduledDeletion.mockResolvedValue({
        deletionScheduledAt: null,
        wasScheduled: true,
      });
      const result = await controller.cancelDelete(ORG, makeRes());
      expect(svc.cancelScheduledDeletion).toHaveBeenCalledWith(ORG, USER);
      expect(result.deletionScheduledAt).toBeNull();
      expect(result.wasScheduled).toBe(true);
    });

    it('idempotent — wasScheduled=false when nothing was scheduled', async () => {
      const { controller, svc } = makeService();
      svc.cancelScheduledDeletion.mockResolvedValue({
        deletionScheduledAt: null,
        wasScheduled: false,
      });
      const result = await controller.cancelDelete(ORG, makeRes());
      expect(result.wasScheduled).toBe(false);
    });
  });

  describe('patchRetentionPolicy', () => {
    it('happy path — returns refreshed state', async () => {
      const { controller, svc } = makeService();
      svc.updateRetentionPolicy.mockResolvedValue({
        audit_log_days: 1000,
        photos_days: 90,
        m3_review_queue_days: 365,
      });
      svc.getPrivacyState.mockResolvedValue({
        organizationId: ORG,
        deletionScheduledAt: null,
        retentionPolicy: {
          audit_log_days: 1000,
          photos_days: 90,
          m3_review_queue_days: 365,
        },
        dpoContact: null,
      });
      const result = await controller.patchRetentionPolicy(
        ORG,
        { audit_log_days: 1000 },
        makeRes(),
      );
      expect(svc.updateRetentionPolicy).toHaveBeenCalledWith(
        ORG,
        { audit_log_days: 1000 },
        USER,
      );
      expect(result.retentionPolicy.audit_log_days).toBe(1000);
    });

    it('translates RetentionPolicyValidationError → 422', async () => {
      const { controller, svc } = makeService();
      svc.updateRetentionPolicy.mockRejectedValue(
        new RetentionPolicyValidationError('audit_log_days out of range'),
      );
      await expect(
        controller.patchRetentionPolicy(ORG, { audit_log_days: 99999 }, makeRes()),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('rethrows non-validation errors unchanged', async () => {
      const { controller, svc } = makeService();
      svc.updateRetentionPolicy.mockRejectedValue(new Error('db gone'));
      await expect(
        controller.patchRetentionPolicy(ORG, { photos_days: 90 }, makeRes()),
      ).rejects.toThrow('db gone');
    });
  });

  describe('patchDpoContact', () => {
    it('upserts the contact (trimmed)', async () => {
      const { controller, svc } = makeService();
      svc.updateDpoContact.mockResolvedValue({
        name: 'Marina',
        email: 'dpo@x.es',
        phone: '+34 666',
      });
      svc.getPrivacyState.mockResolvedValue({
        organizationId: ORG,
        deletionScheduledAt: null,
        retentionPolicy: {
          audit_log_days: 2555,
          photos_days: 90,
          m3_review_queue_days: 365,
        },
        dpoContact: { name: 'Marina', email: 'dpo@x.es', phone: '+34 666' },
      });
      await controller.patchDpoContact(
        ORG,
        { contact: { name: '  Marina ', email: ' dpo@x.es', phone: ' +34 666 ' } },
        makeRes(),
      );
      const call = svc.updateDpoContact.mock.calls[0];
      expect(call[1]).toEqual({ name: 'Marina', email: 'dpo@x.es', phone: '+34 666' });
    });

    it('clears the contact when body.contact === null', async () => {
      const { controller, svc } = makeService();
      svc.updateDpoContact.mockResolvedValue(null);
      svc.getPrivacyState.mockResolvedValue({
        organizationId: ORG,
        deletionScheduledAt: null,
        retentionPolicy: {
          audit_log_days: 2555,
          photos_days: 90,
          m3_review_queue_days: 365,
        },
        dpoContact: null,
      });
      await controller.patchDpoContact(ORG, { contact: null }, makeRes());
      expect(svc.updateDpoContact).toHaveBeenCalledWith(ORG, null, USER);
    });
  });

  describe('R8 stubs', () => {
    it('two-factor enable returns 200 with próximamente message — no audit envelope', () => {
      const { controller } = makeService();
      const result = controller.enableTwoFactor();
      expect(result.enabled).toBe(false);
      expect(result.message).toMatch(/R8/);
    });

    it('api-token rotation returns próximamente message', () => {
      const { controller } = makeService();
      const result = controller.rotateApiToken();
      expect(result.rotated).toBe(false);
      expect(result.message).toMatch(/R8/);
    });
  });
});
