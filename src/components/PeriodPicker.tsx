import { Input, Select } from './ui';
import { PERIOD_LABELS, type Period, type PeriodPreset } from '../lib/period';

export function PeriodPicker({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={value.preset}
        onChange={e => onChange({ ...value, preset: e.target.value as PeriodPreset })}
        className="w-40"
        aria-label="Period"
      >
        {(Object.keys(PERIOD_LABELS) as PeriodPreset[]).map(p => (
          <option key={p} value={p}>{PERIOD_LABELS[p]}</option>
        ))}
      </Select>
      {value.preset === 'custom' && (
        <>
          <Input type="date" value={value.from || ''} max={value.to} onChange={e => onChange({ ...value, from: e.target.value })} className="w-40" aria-label="From" />
          <span className="text-xs text-ink-3">to</span>
          <Input type="date" value={value.to || ''} min={value.from} onChange={e => onChange({ ...value, to: e.target.value })} className="w-40" aria-label="To" />
        </>
      )}
    </div>
  );
}
