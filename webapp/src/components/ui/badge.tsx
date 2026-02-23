import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva('inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold', {
  variants: {
    variant: {
      default: 'bg-teal-100 text-teal-800',
      neutral: 'bg-slate-100 text-slate-700',
      danger: 'bg-rose-100 text-rose-700',
      success: 'bg-emerald-100 text-emerald-700',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
})

interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge }
