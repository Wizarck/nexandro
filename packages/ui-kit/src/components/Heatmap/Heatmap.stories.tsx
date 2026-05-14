import type { Meta, StoryObj } from '@storybook/react';
import { Heatmap } from './Heatmap';

const meta: Meta<typeof Heatmap> = {
  title: 'AI Observability/Heatmap',
  component: Heatmap,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Fixed-grid heatmap consumed by j8 UsageHeatmapWidget. Cells are keyboard-navigable buttons (arrow keys); Space/Enter fires onCellClick. OKLCH lightness ramp 0..5 maps to call-count density.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'));

function weeklyPattern(): number[][] {
  // Friday 09–11 spike pattern from the j8 mock.
  const cells = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => 0),
  );
  // Light morning activity Lun..Jue 04–10
  for (let d = 0; d < 5; d++) {
    for (let h = 4; h <= 10; h++) {
      cells[d]![h] = 30 + (h - 4) * 6;
    }
  }
  // Friday spike at 09:00–11:00
  cells[4]![9] = 142;
  cells[4]![10] = 130;
  cells[4]![11] = 95;
  // Saturday low
  for (let h = 7; h <= 11; h++) cells[5]![h] = 18;
  return cells;
}

export const WeeklyHeatmap: Story = {
  args: {
    rows: 7,
    cols: 24,
    rowLabels: DAYS,
    colLabels: HOURS,
    cells: weeklyPattern(),
    max: 150,
    cellAriaLabel: (r, c, v) => `${DAYS[r]} ${HOURS[c]}h: ${v} llamadas`,
  },
};

export const EmptyHeatmap: Story = {
  args: {
    rows: 7,
    cols: 24,
    rowLabels: DAYS,
    colLabels: HOURS,
    cells: Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0)),
    max: 0,
    cellAriaLabel: (r, c) => `${DAYS[r]} ${HOURS[c]}h: sin actividad`,
  },
};
