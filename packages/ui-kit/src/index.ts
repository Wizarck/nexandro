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

// ---- Recall primitives (slice #12 m3-trace-tree-forward-reverse, Wave 2.5) ----
export { RecallTraceTree } from './components/RecallTraceTree';
export type {
  RecallTraceTreeProps,
  TraceMode,
  TraceNode,
  TraceNodeKind,
  ReverseAnchor,
  ReverseAnchorKind,
} from './components/RecallTraceTree';

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

// ---- Recall search (slice #11 m3-incident-search-multi-anchor, Wave 2.5) ----
export { IncidentSearchField } from './components/IncidentSearchField';
export type {
  IncidentSearchFieldProps,
  IncidentSearchHit,
  IncidentSearchKind,
} from './components/IncidentSearchField';

// ---- Recall dispatch + dossier (slice #13 m3-recall-86-flag-dispatch, Wave 2.5) ----
export { RecallActionBar } from './components/RecallActionBar';
export type { RecallActionBarProps } from './components/RecallActionBar';
export { RecallConfirmationStrip } from './components/RecallConfirmationStrip';
export type {
  RecallConfirmationStripMode,
  RecallConfirmationStripProps,
} from './components/RecallConfirmationStrip';
export { DispatchReceiptCard } from './components/DispatchReceiptCard';
export type {
  DispatchReceiptCardProps,
  DispatchReceiptRow,
  DispatchReceiptStatus,
} from './components/DispatchReceiptCard';
export { DossierPreview } from './components/DossierPreview';
export type { DossierPreviewProps } from './components/DossierPreview';
export { AddendumComposer } from './components/AddendumComposer';
export type {
  AddendumAttachmentInput,
  AddendumComposerProps,
  AddendumComposerState,
} from './components/AddendumComposer';
export { IncidentChronologyRail } from './components/IncidentChronologyRail';
export type {
  ChronologyRailEntry,
  IncidentChronologyRailProps,
} from './components/IncidentChronologyRail';
export { RecipientList } from './components/RecipientList';
export type {
  RecipientListEntry,
  RecipientListProps,
} from './components/RecipientList';

// ---- HACCP primitives (slice #10 m3-haccp-ui, Wave 2.6) ----
export { CcpPicker } from './components/CcpPicker';
export type {
  Ccp,
  CcpInputType,
  CcpLastReading,
  CcpPickerProps,
  CcpSpecRange,
} from './components/CcpPicker';
export { ReadingInput } from './components/ReadingInput';
export type {
  MultiSelectOption,
  ReadingInputProps,
  ReadingInputType,
  ReadingInputValue,
} from './components/ReadingInput';
export { SpecRangeReadback } from './components/SpecRangeReadback';
export type {
  SpecRangeReadbackProps,
  SpecRangeStatus,
} from './components/SpecRangeReadback';
export { CorrectiveActionPicker } from './components/CorrectiveActionPicker';
export type {
  CorrectiveActionOption,
  CorrectiveActionPickerProps,
} from './components/CorrectiveActionPicker';
export { RecentReadingsStrip } from './components/RecentReadingsStrip';
export type {
  RecentReadingRow,
  RecentReadingsStripProps,
} from './components/RecentReadingsStrip';
export { OutOfSpecStickyWarning } from './components/OutOfSpecStickyWarning';
export type { OutOfSpecStickyWarningProps } from './components/OutOfSpecStickyWarning';
