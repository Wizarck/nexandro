import { randomUUID } from 'node:crypto';
import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

const ISO_4217 = /^[A-Z]{3}$/;
const LOCALE_LOWER_2 = /^[a-z]{2}$/;

/**
 * TypeORM transformer for the `ai_monthly_budget_eur numeric(12,2) NULL`
 * column added by m3 slice #19 (`m3-ai-obs-budget-tier-emitter`). Per
 * Wave 2.1 typing-cascade lesson: hoist ABOVE the @Entity decorator so
 * the decorator factory captures the function reference at class-eval
 * time. Nullable variant — NULL = unlimited budget per
 * ADR-NULL-BUDGET-UNLIMITED.
 */
const numericNullableTransformer = {
  to: (value: number | null): number | null => value,
  from: (value: string | null): number | null =>
    value === null ? null : Number.parseFloat(value),
};

export type OrganizationLabelPageSize = 'a4' | 'thermal-4x6' | 'thermal-50x80';

export interface OrganizationLabelPostalAddress {
  street: string;
  city: string;
  postalCode: string;
  country: string;
}

export interface OrganizationLabelContactInfo {
  email?: string;
  phone?: string;
}

export interface OrganizationLabelPrintAdapter {
  /** Adapter discriminator: 'ipp', 'phomemo-labelife', 'zebra-zpl', 'printnode-saas', etc. */
  id: string;
  /** Adapter-specific config (URL, queue, auth credentials). Validated by the adapter. */
  config: Record<string, unknown>;
}

/**
 * Org-level label config persisted as a single jsonb column. Matches the
 * override convention used in #7 / #13 / #15. All fields optional at storage;
 * Article 9 mandatory-field validation runs at render time and surfaces a
 * structured error naming any missing fields.
 */
export interface OrganizationLabelFields {
  businessName?: string;
  contactInfo?: OrganizationLabelContactInfo;
  postalAddress?: OrganizationLabelPostalAddress;
  brandMarkUrl?: string;
  pageSize?: OrganizationLabelPageSize;
  printAdapter?: OrganizationLabelPrintAdapter;
}

export interface OrganizationCreateProps {
  name: string;
  currencyCode: string;
  defaultLocale: string;
  timezone: string;
}

export interface OrganizationUpdateProps {
  name?: string;
  defaultLocale?: string;
  timezone?: string;
}

@Entity({ name: 'organizations' })
@Index('ix_organizations_name', ['name'])
export class Organization {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ type: 'varchar', length: 200 })
  name!: string;

  @Column({ name: 'currency_code', type: 'char', length: 3 })
  currencyCode!: string;

  @Column({ name: 'default_locale', type: 'varchar', length: 8 })
  defaultLocale!: string;

  @Column({ type: 'varchar', length: 64 })
  timezone!: string;

  @Column({ name: 'label_fields', type: 'jsonb', default: () => `'{}'::jsonb` })
  labelFields: OrganizationLabelFields = {};

  /**
   * Per-tenant monthly AI budget in EUR (slice #19, m3-ai-obs-budget-tier-
   * emitter). NULL = unlimited (tier evaluation short-circuits per
   * ADR-NULL-BUDGET-UNLIMITED). Owner-side configuration UI lands in
   * slice #20 (`m3-ai-obs-ui`); until then, the column is mutated only by
   * direct DB UPDATE or future REST endpoint.
   */
  @Column({
    name: 'ai_monthly_budget_eur',
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: numericNullableTransformer,
  })
  aiMonthlyBudgetEur: number | null = null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null = null;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null = null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  static create(props: OrganizationCreateProps): Organization {
    Organization.validateName(props.name);
    Organization.validateCurrency(props.currencyCode);
    Organization.validateLocale(props.defaultLocale);
    Organization.validateTimezone(props.timezone);

    const org = new Organization();
    org.id = randomUUID();
    org.name = props.name.trim();
    org.currencyCode = props.currencyCode;
    org.defaultLocale = props.defaultLocale;
    org.timezone = props.timezone;
    Organization.lockCurrency(org);
    return org;
  }

  applyUpdate(patch: OrganizationUpdateProps & { currencyCode?: string }): void {
    if ('currencyCode' in patch && patch.currencyCode !== undefined) {
      throw new Error('Organization.currencyCode is immutable; cannot change currency post-creation (ADR-007)');
    }
    if (patch.name !== undefined) {
      Organization.validateName(patch.name);
      this.name = patch.name.trim();
    }
    if (patch.defaultLocale !== undefined) {
      Organization.validateLocale(patch.defaultLocale);
      this.defaultLocale = patch.defaultLocale;
    }
    if (patch.timezone !== undefined) {
      Organization.validateTimezone(patch.timezone);
      this.timezone = patch.timezone;
    }
  }

  private static validateName(name: string): void {
    if (typeof name !== 'string' || name.trim().length === 0) {
      throw new Error('Organization.name must be a non-empty string');
    }
  }

  private static validateCurrency(code: string): void {
    if (!ISO_4217.test(code)) {
      throw new Error(`Organization.currencyCode must match ISO 4217 (3 uppercase letters); got "${code}"`);
    }
  }

  private static validateLocale(locale: string): void {
    if (!LOCALE_LOWER_2.test(locale)) {
      throw new Error(`Organization.defaultLocale must be a 2-letter lowercase ISO 639-1 code; got "${locale}"`);
    }
  }

  private static validateTimezone(tz: string): void {
    if (typeof tz !== 'string' || tz.trim().length === 0) {
      throw new Error('Organization.timezone must be a non-empty string (IANA timezone identifier)');
    }
  }

  private static lockCurrency(org: Organization): void {
    Object.defineProperty(org, 'currencyCode', {
      value: org.currencyCode,
      writable: false,
      configurable: false,
      enumerable: true,
    });
  }
}
