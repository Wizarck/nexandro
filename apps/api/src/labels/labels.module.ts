import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  IppPrintAdapter,
  PrintAdapterRegistry,
} from '@nexandro/label-renderer';
import { Ingredient } from '../ingredients/domain/ingredient.entity';
import { IngredientsModule } from '../ingredients/ingredients.module';
import { Organization } from '../iam/domain/organization.entity';
import { Recipe } from '../recipes/domain/recipe.entity';
import { RecipesModule } from '../recipes/recipes.module';
import { LabelDataResolver } from './application/label-data.resolver';
import {
  LABEL_PRINT_ADAPTER_REGISTRY,
  LabelsService,
} from './application/labels.service';
import { LabelsController } from './interface/labels.controller';
import { OrgLabelFieldsController } from './interface/org-label-fields.controller';

/**
 * Labels bounded-context. Wires the resolver + service + controllers + the
 * shared `PrintAdapterRegistry`.
 *
 * Adapter registration: this module ships `IppPrintAdapter` registered with
 * default config (overridden when an org's `labelFields.printAdapter.config`
 * is read at print time). Future adapters (`PhomemoLabelifeAdapter`, etc.)
 * register here as new slices land.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Recipe, Organization, Ingredient]),
    RecipesModule,
    IngredientsModule,
  ],
  controllers: [LabelsController, OrgLabelFieldsController],
  providers: [
    LabelDataResolver,
    LabelsService,
    {
      provide: LABEL_PRINT_ADAPTER_REGISTRY,
      useFactory: (): PrintAdapterRegistry => {
        const registry = new PrintAdapterRegistry();
        registry.register('ipp', (config) => {
          const url = typeof config.url === 'string' ? config.url : '';
          if (!url) {
            throw new Error("IppPrintAdapter requires `config.url` (the printer's IPP endpoint)");
          }
          const queue = typeof config.queue === 'string' ? config.queue : undefined;
          const apiKey = typeof config.apiKey === 'string' ? config.apiKey : undefined;
          const timeoutMs =
            typeof config.timeoutMs === 'number' ? config.timeoutMs : undefined;
          return new IppPrintAdapter({ url, queue, apiKey, timeoutMs });
        });
        // Future adapters register here as new slices land:
        //   registry.register('phomemo-labelife', (config) => new PhomemoLabelifeAdapter(config));
        //   registry.register('zebra-zpl', (config) => new ZebraZplAdapter(config));
        //   registry.register('printnode-saas', (config) => new PrintNodeSaasAdapter(config));
        return registry;
      },
    },
  ],
  exports: [LabelsService, LabelDataResolver, LABEL_PRINT_ADAPTER_REGISTRY],
})
export class LabelsModule {}
