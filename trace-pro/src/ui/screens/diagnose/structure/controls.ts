/**
 * Structure lens controls: layout, focus, ownership-% visibility, fit / reset, and the four
 * geometry sliders.
 *
 * Ported from the `.strctl` / `.stradj` markup and `strParams` / `strSyncLabels` (original lines
 * 787-796, 1233-1235). Every control is a real `<button>` or a real `<input>` — the original's
 * layout segments were `div`s with `.onclick` assigned, so they were unreachable by keyboard — and
 * every handler attaches with addEventListener.
 */
import { el, replace } from '../../../primitives/dom.js';
import { parity } from '../../../parity.js';
import type { StructureGraphSettings, StructureLayoutName } from './graph.js';

const STRUCTURE_LAYOUTS: { id: StructureLayoutName; label: string; hint: string }[] = [
  { id: 'vertical', label: 'Vertical', hint: 'Product at the top, owners above the owned' },
  { id: 'horizontal', label: 'Horizontal', hint: 'Product at the left, depth running right' },
  { id: 'radial', label: 'Radial', hint: 'Product at the centre, depth as radius' },
  { id: 'dynamic', label: 'Dynamic', hint: 'Force-relaxed rows — settles, then holds still' },
];

const STRUCTURE_DENSITY = ['None', 'Big only', 'Medium', 'All'];

export interface StructureSliderSpec {
  id: 'spacing' | 'linkLength' | 'curvature' | 'labelDensity';
  label: string;
  min: number;
  max: number;
  value: number;
}

const STRUCTURE_SLIDERS: StructureSliderSpec[] = [
  { id: 'spacing', label: 'Node spacing', min: 40, max: 240, value: 100 },
  { id: 'linkLength', label: 'Link length', min: 40, max: 240, value: 100 },
  { id: 'curvature', label: 'Curvature', min: 0, max: 100, value: 60 },
  { id: 'labelDensity', label: 'Label density', min: 0, max: 3, value: 3 },
];

/** The resting settings. `vertical` is the default because it is the only snapshot-stable layout. */
export function structureDefaultSettings(): StructureGraphSettings {
  return { layout: 'vertical', spacing: 1, linkLength: 1, curvature: 0.6, labelDensity: 3, focus: '', showPercent: true };
}

function structureSliderText(id: StructureSliderSpec['id'], raw: number): string {
  if (id === 'curvature') return `${raw}%`;
  if (id === 'labelDensity') return STRUCTURE_DENSITY[raw] ?? 'All';
  return `${(raw / 100).toFixed(1)}×`;
}

function structureSliderValue(id: StructureSliderSpec['id'], raw: number): number {
  return id === 'labelDensity' ? raw : raw / 100;
}

export interface StructureControlsHandle {
  /** Live settings object; the lens reads it on every render. */
  readonly settings: StructureGraphSettings;
  /** Push the focused entity in from shared Diagnose state without re-rendering the controls. */
  setFocus(code: string): void;
}

export interface StructureControlsCallbacks {
  onChange(): void;
  onFit(): void;
}

/** Build the two toolbars into `host` and return a live handle onto their values. */
export function structureRenderControls(
  host: HTMLElement,
  settings: StructureGraphSettings,
  callbacks: StructureControlsCallbacks
): StructureControlsHandle {
  const layoutGroup = el('div', {
    class: 'seg-group',
    role: 'group',
    'aria-label': 'Graph layout',
    ...parity('structure.layout_options'),
  });
  const layoutButtons = STRUCTURE_LAYOUTS.map((option) => {
    const button = el('button', {
      type: 'button',
      class: settings.layout === option.id ? 'seg on' : 'seg',
      'data-layout': option.id,
      'aria-pressed': settings.layout === option.id ? 'true' : 'false',
      title: option.hint,
      text: option.label,
    });
    button.addEventListener('click', () => {
      settings.layout = option.id;
      for (const other of layoutButtons) {
        const on = other === button;
        other.className = on ? 'seg on' : 'seg';
        other.setAttribute('aria-pressed', on ? 'true' : 'false');
      }
      callbacks.onChange();
    });
    return button;
  });
  // No whitespace between the segments: the segmented control reads as one word-run, as it did.
  layoutGroup.append(...layoutButtons);

  const focusInput = el('input', {
    type: 'search',
    class: 'focus-input',
    id: 'structure-focus',
    placeholder: 'Focus an entity code…',
    autocomplete: 'off',
    'aria-label': 'Focus an entity code or name; other entities fade back',
  });
  focusInput.value = settings.focus;
  focusInput.addEventListener('input', () => {
    settings.focus = focusInput.value;
    callbacks.onChange();
  });

  const percentToggle = el('button', {
    type: 'button',
    class: 'btn',
    'aria-pressed': settings.showPercent ? 'true' : 'false',
    title: 'Ownership % on each edge — the holder’s share of the entity below it (held units ÷ units outstanding)',
    text: 'Show %',
  });
  percentToggle.addEventListener('click', () => {
    settings.showPercent = !settings.showPercent;
    percentToggle.setAttribute('aria-pressed', settings.showPercent ? 'true' : 'false');
    callbacks.onChange();
  });

  const fitButton = el('button', { type: 'button', class: 'btn', text: '◎ Fit', title: 'Frame the whole structure' });
  fitButton.addEventListener('click', () => callbacks.onFit());

  const resetButton = el('button', { type: 'button', class: 'btn', text: 'Reset', title: 'Back to the default geometry and no focus' });

  const toolbar = el('div', { class: 'toolbar', id: 'structure-tools' }, [
    layoutGroup,
    focusInput,
    percentToggle,
    fitButton,
    resetButton,
  ]);

  /* --- the four sliders. `.stradj` reads as one line of live readouts, hence the spacers. --- */
  const sliderHost = el('div', { class: 'toolbar toolbar-sliders', ...parity('structure.slider_labels') });
  const readouts = new Map<StructureSliderSpec['id'], HTMLElement>();
  const inputs = new Map<StructureSliderSpec['id'], HTMLInputElement>();

  STRUCTURE_SLIDERS.forEach((spec, index) => {
    const readout = el('b', { class: 'slider-value', text: structureSliderText(spec.id, spec.value) });
    const input = el('input', {
      type: 'range',
      min: spec.min,
      max: spec.max,
      value: spec.value,
      id: `structure-slider-${spec.id}`,
      'aria-label': spec.label,
    });
    input.addEventListener('input', () => {
      const raw = Number(input.value);
      readout.textContent = structureSliderText(spec.id, raw);
      settings[spec.id] = structureSliderValue(spec.id, raw);
      callbacks.onChange();
    });
    readouts.set(spec.id, readout);
    inputs.set(spec.id, input);
    const label = el('label', { class: 'slider-label', for: input.id }, [`${spec.label} `, readout]);
    if (index > 0) sliderHost.append(document.createTextNode(' '));
    sliderHost.append(el('div', { class: 'slider-group' }, [label, input]));
  });
  sliderHost.append(
    document.createTextNode(' '),
    el('span', { class: 'status-line', text: 'Drag nodes · scroll to zoom · hover to highlight a branch' })
  );

  resetButton.addEventListener('click', () => {
    for (const spec of STRUCTURE_SLIDERS) {
      const input = inputs.get(spec.id);
      const readout = readouts.get(spec.id);
      if (input) input.value = String(spec.value);
      if (readout) readout.textContent = structureSliderText(spec.id, spec.value);
      settings[spec.id] = structureSliderValue(spec.id, spec.value);
    }
    focusInput.value = '';
    settings.focus = '';
    callbacks.onChange();
  });

  replace(host, toolbar, sliderHost);

  return {
    settings,
    setFocus(code: string): void {
      if (focusInput.value === code) return;
      focusInput.value = code;
      settings.focus = code;
    },
  };
}

/** The three-colour legend, verbatim in substance and in reading order. */
export function structureRenderLegend(): HTMLElement {
  const legend = el('div', { class: 'graph-legend', ...parity('structure.legend') });
  const swatch = (colour: string, text: string, title: string): HTMLElement =>
    el('span', { class: 'legend-item', title }, [
      el('i', { 'aria-hidden': 'true', style: `background:${colour}` }),
      text,
    ]);
  legend.append(
    swatch('#0A1226', 'Feeder', 'Top-level feeder — the product holds it directly'),
    swatch('#1F4A4F', 'SPV / holding', 'An intermediate holding vehicle'),
    swatch('#6E2932', 'Ultimate', 'Lowest level — prices from NAV ÷ units'),
    el('span', {
      class: 'status-line',
      text: 'Node size ∝ derived MV. Drag · scroll to zoom · hover to highlight.',
      title: 'Derived MV is the look-through value at current marks',
    })
  );
  return legend;
}
