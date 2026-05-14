import type { BarRow } from '../api/aiObs.types';
import { BarListWidget } from './BarListWidget';

interface CostByTagWidgetProps {
  data: BarRow[];
  dataUpdatedAt: number;
  onRefresh: () => void;
}

/**
 * Widget #7 (eligia-dashboard cross-pollination, NFR-OBS-10). Groups
 * spend by the `opentrattos.tag` span attribute. Tagless calls fall
 * under `(sin tag)`.
 */
export function CostByTagWidget(props: CostByTagWidgetProps) {
  return (
    <BarListWidget
      eyebrow="Coste por tag · este mes"
      ariaLabel="Coste por tag widget"
      data={props.data}
      dataUpdatedAt={props.dataUpdatedAt}
      onRefresh={props.onRefresh}
      emptyTitle="Sin tags registrados"
      emptyBody="Etiqueta tus capacidades MCP con `opentrattos.tag` para ver el desglose."
    />
  );
}
