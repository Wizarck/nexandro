import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Heatmap, bucketFor } from './Heatmap';

const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'));

function zeroMatrix(): number[][] {
  return Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
}

describe('Heatmap', () => {
  it('renders 7×24 cells when supplied with that shape', () => {
    render(
      <Heatmap
        rows={7}
        cols={24}
        rowLabels={DAYS}
        colLabels={HOURS}
        cells={zeroMatrix()}
        max={0}
        cellAriaLabel={(r, c, v) => `${DAYS[r]} ${HOURS[c]}h: ${v} llamadas`}
      />,
    );
    const cells = screen.getAllByRole('gridcell');
    expect(cells).toHaveLength(7 * 24);
  });

  it('disclosures each cell value via aria-label', () => {
    const cells = zeroMatrix();
    cells[4]![9] = 142;
    render(
      <Heatmap
        rows={7}
        cols={24}
        rowLabels={DAYS}
        colLabels={HOURS}
        cells={cells}
        max={150}
        cellAriaLabel={(r, c, v) => `${DAYS[r]} ${HOURS[c]}h: ${v} llamadas`}
      />,
    );
    expect(screen.getByLabelText('Vie 09h: 142 llamadas')).toBeInTheDocument();
  });

  it('clicking a cell fires onCellClick with (row, col, value)', () => {
    const cells = zeroMatrix();
    cells[1]![5] = 7;
    const onCellClick = vi.fn();
    render(
      <Heatmap
        rows={7}
        cols={24}
        rowLabels={DAYS}
        colLabels={HOURS}
        cells={cells}
        max={10}
        cellAriaLabel={(r, c, v) => `${DAYS[r]} ${HOURS[c]}h: ${v}`}
        onCellClick={onCellClick}
      />,
    );
    const target = screen.getByLabelText('Mar 05h: 7');
    fireEvent.click(target);
    expect(onCellClick).toHaveBeenCalledWith(1, 5, 7);
  });

  it('Arrow keys move focus between cells', () => {
    render(
      <Heatmap
        rows={7}
        cols={24}
        rowLabels={DAYS}
        colLabels={HOURS}
        cells={zeroMatrix()}
        max={0}
        cellAriaLabel={(r, c) => `${DAYS[r]} ${HOURS[c]}h`}
      />,
    );
    const first = screen.getByLabelText('Lun 00h');
    first.focus();
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(screen.getByLabelText('Lun 01h'));
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByLabelText('Mar 01h'));
  });
});

describe('bucketFor', () => {
  it('returns 0 for value 0', () => {
    expect(bucketFor(0, 100)).toBe(0);
  });
  it('returns 0 for max 0 regardless of value', () => {
    expect(bucketFor(50, 0)).toBe(0);
  });
  it('returns 5 for value at max', () => {
    expect(bucketFor(100, 100)).toBe(5);
  });
  it('returns 3 for value at 50 % of max', () => {
    expect(bucketFor(50, 100)).toBe(3);
  });
  it('returns 1 for value at 10 % of max', () => {
    expect(bucketFor(10, 100)).toBe(1);
  });
});
