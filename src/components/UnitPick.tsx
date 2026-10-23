import type { PriceUnit } from '../data/prices';

/** Per item or per kilo, for a price being typed. */
export function UnitPick({ value, onChange, name }: { value: PriceUnit; onChange: (u: PriceUnit) => void; name: string }) {
  return (
    <div className="unit-pick" role="group" aria-label={`המחיר של ${name} הוא`}>
      {([['', 'ליח׳', 'ליחידה'], ['kg', 'לק״ג', 'לקילו']] as const).map(([v, label, full]) => (
        <button key={v || 'item'} type="button" aria-pressed={value === v} aria-label={full} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}
