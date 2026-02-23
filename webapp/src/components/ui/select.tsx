import { cn } from '@/lib/utils'

type Option = {
  label: string
  value: string
}

type SelectProps = {
  value: string
  options: Option[]
  onChange: (value: string) => void
  className?: string
  disabled?: boolean
}

function Select({ value, options, onChange, className, disabled }: SelectProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={cn(
        'flex h-10 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  )
}

export { Select }
