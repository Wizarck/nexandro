// Public API surface of @opentrattos/ui-kit.
// Components live under src/components/<Name>/; this barrel re-exports them.

export { cn } from './lib/cn';
export { AllergenBadge } from './components/AllergenBadge';
export type { AllergenBadgeProps, AllergenCode } from './components/AllergenBadge';
export { MarginPanel } from './components/MarginPanel';
export type { MarginPanelProps, MarginStatus, MarginReport } from './components/MarginPanel';
export { RecipePicker } from './components/RecipePicker';
export type { RecipePickerProps, RecipeListItem } from './components/RecipePicker';
export { IngredientPicker } from './components/IngredientPicker';
export type { IngredientPickerProps, IngredientListItem } from './components/IngredientPicker';
export { SourceOverridePicker } from './components/SourceOverridePicker';
export type {
  SourceOverridePickerProps,
  SupplierItemOption,
} from './components/SourceOverridePicker';
export { CostDeltaTable } from './components/CostDeltaTable';
export type {
  CostDeltaTableProps,
  CostDeltaRow,
  CostDeltaDirection,
} from './components/CostDeltaTable';
export { DietFlagsPanel, ALL_DIET_FLAGS } from './components/DietFlagsPanel';
export type {
  DietFlag,
  DietFlagsOverride,
  DietFlagsPanelProps,
  DietFlagsState,
} from './components/DietFlagsPanel';
export { MenuItemRanker } from './components/MenuItemRanker';
export type { MenuItemRankerProps, DashboardMenuItem } from './components/MenuItemRanker';
export { MacroPanel, MACRO_LABELS, PRIMARY_MACRO_KEYS } from './components/MacroPanel';
export type { MacroPanelProps, MacroRollup } from './components/MacroPanel';
export { LabelPreview, LABEL_PREVIEW_LOCALES } from './components/LabelPreview';
export type {
  LabelPreviewProps,
  LabelPreviewLocale,
  LabelApiError,
  LabelMissingFieldsError,
  LabelUnsupportedLocaleError,
  LabelPrintAdapterNotConfiguredError,
  LabelGenericApiError,
} from './components/LabelPreview';
export { YieldEditor, AiSuggestionEditor, MIN_REJECT_REASON_LENGTH } from './components/YieldEditor';
export type {
  YieldEditorProps,
  AiSuggestionShape,
  AiSuggestionStatus,
} from './components/YieldEditor';
export { WasteFactorEditor } from './components/WasteFactorEditor';
export type { WasteFactorEditorProps } from './components/WasteFactorEditor';
export { AgentChatWidget } from './components/AgentChatWidget';
export type {
  AgentChatWidgetProps,
  ChatBubble,
  ChatBubbleAttachment,
  ChatRole,
  ChatSseEvent as AgentChatSseEvent,
  SendRequest as AgentChatSendRequest,
} from './components/AgentChatWidget';
export { RoleGuard } from './components/RoleGuard';
export type { RoleGuardProps, UserRole } from './components/RoleGuard';
export {
  LabelFieldsForm,
  sanitizeLabelFieldsValues,
  LABEL_PAGE_SIZES,
  PRINT_ADAPTER_IDS,
} from './components/LabelFieldsForm';
export type {
  LabelFieldsFormProps,
  LabelFieldsFormValues,
  LabelFieldsFormErrors,
  LabelFieldsContactInfo,
  LabelFieldsPostalAddress,
  LabelFieldsPrintAdapter,
  LabelPageSize,
  PrintAdapterId,
} from './components/LabelFieldsForm';
export { AuditLogTable } from './components/AuditLogTable';
export type { AuditLogRow, AuditLogTableProps } from './components/AuditLogTable';
export { AuditLogRowDetail } from './components/AuditLogRowDetail';
export type { AuditLogRowDetailProps } from './components/AuditLogRowDetail';
export {
  AuditLogFilters,
  KNOWN_AUDIT_EVENT_TYPES,
  KNOWN_AUDIT_AGGREGATE_TYPES,
  AUDIT_ACTOR_KINDS,
  EMPTY_AUDIT_FILTER_VALUES,
} from './components/AuditLogFilters';
export type {
  AuditLogFiltersProps,
  AuditLogFilterValues,
  AuditActorKind,
  KnownAuditEventType,
  KnownAuditAggregateType,
} from './components/AuditLogFilters';

// ---- AI Observability primitives (slice #20 m3-ai-obs-ui, Wave 2.4) ----
export { Sparkline } from './components/Sparkline';
export type {
  SparklineProps,
  SparklinePoint,
  SparklinePeak,
} from './components/Sparkline';
export { Heatmap, bucketFor as heatmapBucketFor } from './components/Heatmap';
export type { HeatmapProps } from './components/Heatmap';
export { BadgeChip } from './components/BadgeChip';
export type { BadgeChipProps, BadgeChipVariant } from './components/BadgeChip';
export { MetricCard } from './components/MetricCard';
export type { MetricCardProps } from './components/MetricCard';
export { EmptyStateCard } from './components/EmptyStateCard';
export type { EmptyStateCardProps } from './components/EmptyStateCard';
