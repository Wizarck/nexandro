export type ReadingInputType = 'numeric' | 'checkbox' | 'multi-select';

export interface MultiSelectOption {
  id: string;
  label: string;
}

export type ReadingInputValue = string | boolean | string[];

interface BaseProps {
  /** Optional id for the input — useful for `<label htmlFor>`. */
  id?: string;
  /** Unit suffix shown alongside the numeric input (e.g. "°C"). */
  unit?: string;
  /** Placeholder shown when the value is empty (numeric variant). */
  placeholder?: string;
  className?: string;
  /** Forwarded to the focusable element (aria-label) when no visible label. */
  'aria-label'?: string;
}

export type ReadingInputProps =
  | (BaseProps & {
      inputType: 'numeric';
      value: string;
      onChange: (value: string) => void;
    })
  | (BaseProps & {
      inputType: 'checkbox';
      value: boolean;
      onChange: (value: boolean) => void;
    })
  | (BaseProps & {
      inputType: 'multi-select';
      value: ReadonlyArray<string>;
      options: ReadonlyArray<MultiSelectOption>;
      onChange: (value: string[]) => void;
    });
