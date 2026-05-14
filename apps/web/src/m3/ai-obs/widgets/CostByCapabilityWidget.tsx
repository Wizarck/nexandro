import type { BarRow } from '../api/aiObs.types';
import { BarListWidget } from './BarListWidget';

interface CostByCapabilityWidgetProps {
  data: BarRow[];
  dataUpdatedAt: number;
  onRefresh: () => void;
}

export function CostByCapabilityWidget(props: CostByCapabilityWidgetProps) {
  return (
    <BarListWidget
      eyebrow="Coste por capacidad · este mes"
      ariaLabel="Coste por capacidad MCP widget"
      data={props.data}
      dataUpdatedAt={props.dataUpdatedAt}
      onRefresh={props.onRefresh}
      emptyTitle="Sin actividad por capacidad"
      emptyBody="Aún no se han registrado capacidades MCP en el rango seleccionado."
    />
  );
}
