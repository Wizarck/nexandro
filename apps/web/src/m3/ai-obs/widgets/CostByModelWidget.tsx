import type { BarRow } from '../api/aiObs.types';
import { BarListWidget } from './BarListWidget';

interface CostByModelWidgetProps {
  data: BarRow[];
  dataUpdatedAt: number;
  onRefresh: () => void;
}

export function CostByModelWidget(props: CostByModelWidgetProps) {
  return (
    <BarListWidget
      eyebrow="Coste por modelo · este mes"
      ariaLabel="Coste por modelo widget"
      data={props.data}
      dataUpdatedAt={props.dataUpdatedAt}
      onRefresh={props.onRefresh}
      emptyTitle="Sin actividad por modelo"
      emptyBody="No se han observado llamadas a modelos en el rango seleccionado."
    />
  );
}
