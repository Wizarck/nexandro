import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In } from 'typeorm';
import {
  SUPPORTED_LOCALES,
  type LabelData,
  type LabelIngredientRow,
  type LabelLocale,
  type LabelMacros,
  type LabelOrg,
  type LabelPageSize,
  type LabelRecipe,
} from '@nexandro/label-renderer';
import { Ingredient } from '../../ingredients/domain/ingredient.entity';
import { IngredientsService } from '../../ingredients/application/ingredients.service';
import { Organization } from '../../iam/domain/organization.entity';
import { Recipe } from '../../recipes/domain/recipe.entity';
import { RecipesAllergensService } from '../../recipes/application/recipes-allergens.service';
import { walkRecipeTreeLeaves } from '../../recipes/application/recipe-tree-walker';
import {
  LabelOrganizationNotFoundError,
  LabelRecipeNotFoundError,
  MissingMandatoryFieldsError,
  UnsupportedLocaleError,
} from './errors';

const MACRO_KEYS_REQUIRED = [
  'kcal',
  'fat',
  'saturated_fat',
  'carbohydrates',
  'sugars',
  'protein',
  'salt',
] as const;

/**
 * Builds a `LabelData` from a Recipe + Org context. Centralises:
 * - Article 18 ingredient ordering (descending mass)
 * - Article 21 per-ingredient allergen carry-over (RecipesAllergensService)
 * - Macro rollup (IngredientsService.getMacroRollup)
 * - Article 9 mandatory-field validation: throws `MissingMandatoryFieldsError`
 *   listing every missing field (refusal-on-incomplete per FR36)
 * - Locale validation: throws `UnsupportedLocaleError` for unknown locales
 *
 * Page size resolves from `Organization.labelFields.pageSize` defaulting to 'a4'.
 */
@Injectable()
export class LabelDataResolver {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly allergensService: RecipesAllergensService,
    private readonly ingredientsService: IngredientsService,
  ) {}

  async resolve(
    organizationId: string,
    recipeId: string,
    requestedLocale: string | undefined,
  ): Promise<LabelData> {
    const org = await this.dataSource
      .getRepository(Organization)
      .findOneBy({ id: organizationId });
    if (!org) throw new LabelOrganizationNotFoundError(organizationId);

    const localeStr = requestedLocale ?? org.defaultLocale;
    if (!SUPPORTED_LOCALES.includes(localeStr as LabelLocale)) {
      throw new UnsupportedLocaleError(localeStr, SUPPORTED_LOCALES);
    }
    const locale = localeStr as LabelLocale;

    const recipe = await this.dataSource
      .getRepository(Recipe)
      .findOneBy({ id: recipeId, organizationId });
    if (!recipe) throw new LabelRecipeNotFoundError(recipeId);

    const pageSize = (org.labelFields.pageSize ?? 'a4') as LabelPageSize;

    // Walk tree once: per-ingredient mass aggregation.
    const massByIngredientId = new Map<string, number>();
    let totalNetMassG = 0;
    await walkRecipeTreeLeaves(
      this.dataSource.manager,
      organizationId,
      recipeId,
      (ctx) => {
        const ingredientId = ctx.line.ingredientId;
        if (!ingredientId) return;
        const massG = ctx.scaledQuantity * ctx.cumulativeYieldWaste;
        massByIngredientId.set(
          ingredientId,
          (massByIngredientId.get(ingredientId) ?? 0) + massG,
        );
        totalNetMassG += massG;
      },
      { onMissingSubRecipe: 'skip' },
    );

    // Resolve ingredient names + allergens via the rollup. The allergens rollup
    // also runs walkRecipeTreeLeaves but we already have the mass walk; re-walk
    // is acceptable in M2 (≤2 walks for a label render is well within budget).
    const allergensRollup = await this.allergensService.getAllergensRollup(
      organizationId,
      recipeId,
    );

    const ingredientIds = [...massByIngredientId.keys()];
    const ingredients =
      ingredientIds.length === 0
        ? []
        : await this.dataSource
            .getRepository(Ingredient)
            .findBy({ id: In(ingredientIds) });
    const ingredientById = new Map(ingredients.map((i) => [i.id, i]));

    const ingredientList: LabelIngredientRow[] = ingredientIds
      .map((id) => {
        const ing = ingredientById.get(id);
        const massG = massByIngredientId.get(id) ?? 0;
        const allergens = allergensRollup.byIngredient[id] ?? [];
        return {
          name: (ing?.name ?? id).toLowerCase(),
          netMassG: roundMass(massG),
          allergens,
        };
      })
      .sort((a, b) => b.netMassG - a.netMassG);

    const macroRollup = await this.ingredientsService.getMacroRollup(
      organizationId,
      recipeId,
    );
    const macros = mapMacros(macroRollup.per100g);

    const orgBlock: LabelOrg = {
      businessName: org.labelFields.businessName ?? '',
      contactInfo: org.labelFields.contactInfo,
      postalAddress: org.labelFields.postalAddress ?? {
        street: '',
        city: '',
        postalCode: '',
        country: '',
      },
      brandMarkUrl: org.labelFields.brandMarkUrl,
    };

    const recipeBlock: LabelRecipe = {
      id: recipe.id,
      name: recipe.name,
      portions: recipe.portions ?? 1,
      totalNetMassG: roundMass(totalNetMassG),
      ingredientList,
      allergens: allergensRollup.aggregated,
      crossContamination:
        allergensRollup.crossContamination.note &&
        allergensRollup.crossContamination.allergens.length > 0
          ? {
              note: allergensRollup.crossContamination.note,
              allergens: allergensRollup.crossContamination.allergens,
            }
          : undefined,
      macros,
    };

    const data: LabelData = { recipe: recipeBlock, org: orgBlock, locale, pageSize };
    this.validateMandatoryFields(data);
    return data;
  }

  private validateMandatoryFields(data: LabelData): void {
    const missing: string[] = [];
    if (!data.org.businessName.trim()) missing.push('org.businessName');
    if (!data.org.postalAddress.street.trim()) missing.push('org.postalAddress.street');
    if (!data.org.postalAddress.city.trim()) missing.push('org.postalAddress.city');
    if (!data.org.postalAddress.postalCode.trim()) missing.push('org.postalAddress.postalCode');
    if (!data.org.postalAddress.country.trim()) missing.push('org.postalAddress.country');
    if (!data.recipe.name.trim()) missing.push('recipe.name');
    if (data.recipe.ingredientList.length === 0) missing.push('recipe.ingredientList');
    if (data.recipe.totalNetMassG <= 0) missing.push('recipe.totalNetMassG');
    for (const k of MACRO_KEYS_REQUIRED) {
      const value = readMacro(data.recipe.macros, k);
      if (value === null || !Number.isFinite(value)) {
        missing.push(`recipe.macros.${k}`);
      }
    }
    if (missing.length > 0) {
      throw new MissingMandatoryFieldsError(missing);
    }
  }
}

function roundMass(g: number): number {
  return Math.round(g * 100) / 100;
}

/**
 * Maps the per-100g macro keys returned by `IngredientsService.getMacroRollup`
 * to the typed `LabelMacros` shape consumed by the renderer. Missing keys
 * are returned as `NaN` so the mandatory-field validator surfaces them by
 * name.
 */
function mapMacros(per100g: Record<string, number>): LabelMacros {
  return {
    kcalPer100g: per100g.kcal ?? Number.NaN,
    fatPer100g: per100g.fat ?? Number.NaN,
    saturatedFatPer100g: per100g.saturated_fat ?? Number.NaN,
    carbohydratesPer100g: per100g.carbohydrates ?? Number.NaN,
    sugarsPer100g: per100g.sugars ?? Number.NaN,
    proteinPer100g: per100g.protein ?? Number.NaN,
    saltPer100g: per100g.salt ?? Number.NaN,
  };
}

function readMacro(macros: LabelMacros, key: (typeof MACRO_KEYS_REQUIRED)[number]): number | null {
  switch (key) {
    case 'kcal':
      return macros.kcalPer100g;
    case 'fat':
      return macros.fatPer100g;
    case 'saturated_fat':
      return macros.saturatedFatPer100g;
    case 'carbohydrates':
      return macros.carbohydratesPer100g;
    case 'sugars':
      return macros.sugarsPer100g;
    case 'protein':
      return macros.proteinPer100g;
    case 'salt':
      return macros.saltPer100g;
  }
}
