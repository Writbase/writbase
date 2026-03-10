import { type HTMLAttributes } from 'react'

const colorMap = {
  gray: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
  blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  green: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  yellow:
    'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
  red: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
  purple:
    'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
} as const

type BadgeColor = keyof typeof colorMap

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  color?: BadgeColor
}

export function Badge({
  color = 'gray',
  className = '',
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colorMap[color]} ${className}`}
      {...props}
    >
      {children}
    </span>
  )
}
