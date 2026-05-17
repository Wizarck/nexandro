import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  DietFlagsPanel,
  IngredientPicker,
  LabelPreview,
  MacroPanel,
  RecipePicker,
  SourceOverridePicker,
  WasteFactorEditor,
  YieldEditor,
  type AiSuggestionShape,
  type IngredientListItem,
  type LabelApiError,
  type LabelPreviewLocale,
  type RecipeListItem,
} from '@nexandro/ui-kit';
import { ApiError } from '../api/client';
import { useRecipes } from '../hooks/useRecipes';
import { useIngredients } from '../hooks/useIngredients';
import { useSupplierItems } from '../hooks/useSupplierItems';
import { useDietFlags, useDietFlagsOverride } from '../hooks/useDietFlags';
import { useRecipeMacros } from '../hooks/useRecipeMacros';
import { useLabelPreviewUrl } from '../hooks/useLabelPreview';
import { useLabelPrint } from '../hooks/useLabelPrint';
import {
  useAcceptAiSuggestion,
  useRejectAiSuggestion,
  useWasteSuggestion,
  useYieldSuggestion,
} from '../hooks/useAiSuggestions';

/**
 * J1 stub — exercises the 4 J1 components against the real backend.
 * NOT the canonical M2 J1 screen (that lands with #5 m2-ingredients-extension
 * or a future polish slice). This is pure integration verification.
 *
 * Pass `?organizationId=<id>&recipeId=<id>` in the URL.
 */
export function RecipeBuilderJ1Screen() {
  const [params] = useSearchParams();
  const orgId = params.get('organizationId') ?? undefined;
  const recipeId = params.get('recipeId') ?? undefined;

  const [recipeQuery, setRecipeQuery] = useState('');
  const [ingredientQuery, setIngredientQuery] = useState('');
  const [pickedIngredient, setPickedIngredient] = useState<IngredientListItem | null>(null);
  const [pickedSubRecipe, setPickedSubRecipe] = useState<RecipeListItem | null>(null);

  const recipesQuery = useRecipes(orgId, recipeQuery);
  const ingredientsQuery = useIngredients(orgId, ingredientQuery);
  const supplierItemsQuery = useSupplierItems(pickedIngredient?.id);
  const dietFlagsQuery = useDietFlags(orgId, recipeId);
  const overrideMutation = useDietFlagsOverride(orgId, recipeId);
  const macrosQuery = useRecipeMacros(orgId, recipeId);

  const [labelLocale, setLabelLocale] = useState<LabelPreviewLocale>('es');
  const labelUrl = useLabelPreviewUrl(orgId, recipeId, labelLocale);
  const printMutation = useLabelPrint();
  const labelError = useMemo<LabelApiError | null>(
    () => extractLabelError(printMutation.error),
    [printMutation.error],
  );

  // AI yield + waste suggestions state machine. The UI is presentational;
  // mutations live here. `aiEnabled` is hard-wired true for the J1 stub —
  // production reads from a /healthz-style env-derived feature flag.
  const aiEnabled = true;
  const [yieldValue, setYieldValue] = useState(0.85);
  const [wasteValue, setWasteValue] = useState(0.05);
  const [yieldSuggestion, setYieldSuggestion] =
    useState<AiSuggestionShape | null>(null);
  const [wasteSuggestion, setWasteSuggestion] =
    useState<AiSuggestionShape | null>(null);
  const [yieldNoCitation, setYieldNoCitation] = useState(false);
  const [wasteNoCitation, setWasteNoCitation] = useState(false);
  const yieldMutation = useYieldSuggestion();
  const wasteMutation = useWasteSuggestion();
  const acceptMutation = useAcceptAiSuggestion();
  const rejectMutation = useRejectAiSuggestion();

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 space-y-6">
      <div className="rounded-md border border-border bg-warn-bg px-4 py-2 text-sm text-ink" role="note">
        <strong>Proof of concept</strong> — m2-ui-backfill-wave1 J1 stub. The
        canonical Recipe Builder ships with <code>#5 m2-ingredients-extension</code>.
      </div>

      <header>
        <h1 className="text-2xl font-semibold text-ink">Recipe Builder (J1)</h1>
        <p className="text-sm text-mute">
          Pick a sub-recipe + ingredient + supplier source + diet flags. End-to-end check
          against <code>apps/api/</code>.
        </p>
        {!orgId && (
          <p className="mt-2 text-sm text-mute">
            Pass <code>?organizationId=&lt;uuid&gt;</code> in the URL to enable.
          </p>
        )}
      </header>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-mute">Sub-recipe</h2>
        <RecipePicker
          recipes={recipesQuery.data ?? []}
          loading={recipesQuery.isLoading}
          onSearch={setRecipeQuery}
          onSelect={setPickedSubRecipe}
          activeOnly
        />
        {pickedSubRecipe && (
          <p className="text-xs text-mute">Picked: {pickedSubRecipe.displayLabel}</p>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-mute">Ingredient</h2>
        <IngredientPicker
          ingredients={ingredientsQuery.data ?? []}
          loading={ingredientsQuery.isLoading}
          onSearch={setIngredientQuery}
          onSelect={setPickedIngredient}
        />
        {pickedIngredient && (
          <p className="text-xs text-mute">Picked: {pickedIngredient.displayLabel}</p>
        )}
      </section>

      {pickedIngredient && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-mute">
            Supplier source for {pickedIngredient.displayLabel}
          </h2>
          <SourceOverridePicker
            options={supplierItemsQuery.data ?? []}
            currentOverrideId={null}
            onApply={(p) => console.info('Apply override', p)}
            onClear={() => console.info('Clear override')}
            locale="es-ES"
          />
        </section>
      )}

      {recipeId && dietFlagsQuery.data && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-mute">
            Diet flags
          </h2>
          <DietFlagsPanel
            state={dietFlagsQuery.data}
            canOverride={true}
            onApplyOverride={async (payload) => {
              await overrideMutation.mutateAsync(payload);
            }}
          />
        </section>
      )}

      {recipeId && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-mute">
            Macros
          </h2>
          <MacroPanel
            rollup={macrosQuery.data ?? null}
            loading={macrosQuery.isLoading}
            mode="expanded"
            locale="es-ES"
          />
        </section>
      )}

      {orgId && pickedIngredient && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-mute">
            Yield (AI)
          </h2>
          <YieldEditor
            value={yieldValue}
            onChange={setYieldValue}
            aiEnabled={aiEnabled}
            suggestion={yieldSuggestion}
            noCitationAvailable={yieldNoCitation}
            loading={yieldMutation.isPending}
            errorMessage={yieldMutation.error?.message}
            onRequestSuggestion={async () => {
              setYieldNoCitation(false);
              const env = await yieldMutation.mutateAsync({
                organizationId: orgId,
                ingredientId: pickedIngredient.id,
                contextHash: `yield:${pickedIngredient.id}`,
              });
              setYieldSuggestion(env.suggestion ?? null);
              setYieldNoCitation(env.suggestion === null);
              if (env.suggestion) setYieldValue(env.suggestion.value);
            }}
            onAccept={async (tweak) => {
              if (!yieldSuggestion) return;
              const updated = await acceptMutation.mutateAsync({
                organizationId: orgId,
                suggestionId: yieldSuggestion.id,
                value: tweak,
              });
              setYieldSuggestion(updated);
              if (tweak !== undefined) setYieldValue(tweak);
            }}
            onReject={async (reason) => {
              if (!yieldSuggestion) return;
              const updated = await rejectMutation.mutateAsync({
                organizationId: orgId,
                suggestionId: yieldSuggestion.id,
                reason,
              });
              setYieldSuggestion(updated);
            }}
          />
        </section>
      )}

      {recipeId && orgId && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-mute">
            Waste factor (AI)
          </h2>
          <WasteFactorEditor
            value={wasteValue}
            onChange={setWasteValue}
            aiEnabled={aiEnabled}
            suggestion={wasteSuggestion}
            noCitationAvailable={wasteNoCitation}
            loading={wasteMutation.isPending}
            errorMessage={wasteMutation.error?.message}
            onRequestSuggestion={async () => {
              setWasteNoCitation(false);
              const env = await wasteMutation.mutateAsync({
                organizationId: orgId,
                recipeId,
                contextHash: `waste:${recipeId}`,
              });
              setWasteSuggestion(env.suggestion ?? null);
              setWasteNoCitation(env.suggestion === null);
              if (env.suggestion) setWasteValue(env.suggestion.value);
            }}
            onAccept={async (tweak) => {
              if (!wasteSuggestion) return;
              const updated = await acceptMutation.mutateAsync({
                organizationId: orgId,
                suggestionId: wasteSuggestion.id,
                value: tweak,
              });
              setWasteSuggestion(updated);
              if (tweak !== undefined) setWasteValue(tweak);
            }}
            onReject={async (reason) => {
              if (!wasteSuggestion) return;
              const updated = await rejectMutation.mutateAsync({
                organizationId: orgId,
                suggestionId: wasteSuggestion.id,
                reason,
              });
              setWasteSuggestion(updated);
            }}
          />
        </section>
      )}

      {recipeId && orgId && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-mute">
            Label preview
          </h2>
          <LabelPreview
            recipeId={recipeId}
            locale={labelLocale}
            onLocaleChange={setLabelLocale}
            previewUrl={labelUrl}
            onPrint={() => {
              printMutation.mutate({
                recipeId,
                organizationId: orgId,
                locale: labelLocale,
              });
            }}
            onDownload={() => {
              window.open(labelUrl, '_blank', 'noopener,noreferrer');
            }}
            error={labelError}
            printing={printMutation.isPending}
            printSuccessJobId={printMutation.data?.ok ? printMutation.data.jobId ?? null : null}
          />
        </section>
      )}
    </div>
  );
}

function extractLabelError(err: unknown): LabelApiError | null {
  if (!err) return null;
  if (err instanceof ApiError) {
    const body = err.body;
    if (
      body !== null &&
      typeof body === 'object' &&
      'code' in body &&
      typeof (body as { code: unknown }).code === 'string'
    ) {
      return body as LabelApiError;
    }
    return { code: `HTTP_${err.status}` };
  }
  return { code: 'UNKNOWN' };
}
