// ============================================================================
// CrewQuote Pro — Reusable UI Component Library
// ============================================================================

import React from 'react'
import { clsx } from 'clsx'
import {
  AlertCircle, AlertTriangle, CheckCircle, Info, X, ChevronLeft,
} from 'lucide-react'

// ── Button ─────────────────────────────────────────────────────────────────

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'outline'
type ButtonSize    = 'xs' | 'sm' | 'md' | 'lg'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
}

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:   'bg-blue-600 hover:bg-blue-700 text-white shadow-sm',
  secondary: 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 shadow-sm',
  ghost:     'hover:bg-gray-100 text-gray-600',
  danger:    'bg-red-600 hover:bg-red-700 text-white shadow-sm',
  success:   'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm',
  outline:   'border border-blue-600 text-blue-600 hover:bg-blue-50',
}

const BUTTON_SIZES: Record<ButtonSize, string> = {
  xs: 'px-2 py-1 text-xs rounded gap-1',
  sm: 'px-3 py-1.5 text-sm rounded-md gap-1.5',
  md: 'px-4 py-2 text-sm rounded-lg gap-2',
  lg: 'px-5 py-2.5 text-base rounded-xl gap-2',
}

export function Button({
  children, variant = 'primary', size = 'md', loading, disabled, className, ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center font-medium transition-colors duration-150',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        (disabled || loading) && 'opacity-50 cursor-not-allowed',
        className,
      )}
      {...props}
    >
      {loading ? <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" /> : children}
    </button>
  )
}

// ── Form Field Wrapper ─────────────────────────────────────────────────────

interface FieldProps {
  label?: string
  error?: string
  required?: boolean
  hint?: string
  children: React.ReactNode
  className?: string
}

export function Field({ label, error, required, hint, children, className }: FieldProps) {
  return (
    <div className={clsx('space-y-1', className)}>
      {label && (
        <label className="block text-sm font-medium text-gray-700">
          {label}
          {required && <span className="ml-1 text-red-500">*</span>}
        </label>
      )}
      {children}
      {hint  && !error && <p className="text-xs text-gray-400">{hint}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}

// ── Input ──────────────────────────────────────────────────────────────────

const inputBase =
  'w-full px-3 py-2 text-sm border rounded-lg bg-white placeholder:text-gray-400 ' +
  'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ' +
  'transition-colors duration-150'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
  required?: boolean
}

export function Input({ label, error, hint, required, className, ...props }: InputProps) {
  return (
    <Field label={label} error={error} hint={hint} required={required}>
      <input
        className={clsx(inputBase, error ? 'border-red-300' : 'border-gray-200', className)}
        {...props}
      />
    </Field>
  )
}

// ── Select ─────────────────────────────────────────────────────────────────

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  required?: boolean
}

export function Select({ label, error, required, children, className, ...props }: SelectProps) {
  return (
    <Field label={label} error={error} required={required}>
      <select
        className={clsx(inputBase, 'appearance-none', error ? 'border-red-300' : 'border-gray-200', className)}
        {...props}
      >
        {children}
      </select>
    </Field>
  )
}

// ── Textarea ───────────────────────────────────────────────────────────────

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
  required?: boolean
}

export function Textarea({ label, error, required, className, ...props }: TextareaProps) {
  return (
    <Field label={label} error={error} required={required}>
      <textarea
        className={clsx(inputBase, 'resize-none', error ? 'border-red-300' : 'border-gray-200', className)}
        {...props}
      />
    </Field>
  )
}

// ── Badge ──────────────────────────────────────────────────────────────────

interface BadgeProps {
  children: React.ReactNode
  className?: string
}

export function Badge({ children, className }: BadgeProps) {
  return (
    <span className={clsx('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', className)}>
      {children}
    </span>
  )
}

// ── Card ───────────────────────────────────────────────────────────────────

interface CardProps {
  children: React.ReactNode
  className?: string
  onClick?: () => void
  padding?: 'none' | 'sm' | 'md' | 'lg'
}

const CARD_PADDING = { none: '', sm: 'p-4', md: 'p-5', lg: 'p-6' }

export function Card({ children, className, onClick, padding = 'none' }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={clsx(
        'bg-white rounded-xl border border-gray-200 shadow-sm',
        onClick && 'cursor-pointer hover:border-blue-200 transition-colors',
        CARD_PADDING[padding],
        className,
      )}
    >
      {children}
    </div>
  )
}

// ── Stat Card ──────────────────────────────────────────────────────────────

interface StatCardProps {
  title: string
  value: React.ReactNode
  subtitle?: string
  icon: React.ElementType
  color?: 'blue' | 'green' | 'amber' | 'red' | 'purple'
}

const STAT_COLORS = {
  blue:   { icon: 'text-blue-600',    bg: 'bg-blue-50'    },
  green:  { icon: 'text-emerald-600', bg: 'bg-emerald-50' },
  amber:  { icon: 'text-amber-600',   bg: 'bg-amber-50'   },
  red:    { icon: 'text-red-600',     bg: 'bg-red-50'     },
  purple: { icon: 'text-purple-600',  bg: 'bg-purple-50'  },
}

export function StatCard({ title, value, subtitle, icon: Icon, color = 'blue' }: StatCardProps) {
  const c = STAT_COLORS[color]
  return (
    <Card padding="md">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="mt-2 text-2xl font-bold text-gray-900 leading-none">{value}</p>
          {subtitle && <p className="mt-1.5 text-xs text-gray-500">{subtitle}</p>}
        </div>
        <div className={clsx('p-2.5 rounded-lg', c.bg)}>
          <Icon size={20} className={c.icon} />
        </div>
      </div>
    </Card>
  )
}

// ── Page Header ────────────────────────────────────────────────────────────

interface PageHeaderProps {
  title: string
  subtitle?: string
  actions?: React.ReactNode
  back?: boolean
  onBack?: () => void
}

export function PageHeader({ title, subtitle, actions, back, onBack }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div className="flex items-center gap-2">
        {back && (
          <button
            onClick={onBack}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
          >
            <ChevronLeft size={20} />
          </button>
        )}
        <div>
          <h1 className="text-xl font-bold text-gray-900 leading-tight">{title}</h1>
          {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {actions && (
        <div className="flex items-center gap-2 flex-wrap">{actions}</div>
      )}
    </div>
  )
}

// ── Empty State ────────────────────────────────────────────────────────────

interface EmptyStateProps {
  icon: React.ElementType
  title: string
  description: string
  action?: React.ReactNode
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center py-16 px-4 text-center">
      <div className="p-4 bg-gray-100 rounded-2xl mb-4">
        <Icon size={28} className="text-gray-400" />
      </div>
      <h3 className="text-base font-semibold text-gray-900 mb-1">{title}</h3>
      <p className="text-sm text-gray-500 mb-6 max-w-xs">{description}</p>
      {action}
    </div>
  )
}

// ── Modal ──────────────────────────────────────────────────────────────────

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  children: React.ReactNode
}

const MODAL_SIZES = {
  sm: 'max-w-md',
  md: 'max-w-2xl',
  lg: 'max-w-4xl',
  xl: 'max-w-6xl',
}

export function Modal({ open, onClose, title, size = 'md', children }: ModalProps) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className={clsx('relative bg-white rounded-2xl shadow-2xl w-full max-h-[90vh] flex flex-col', MODAL_SIZES[size])}>
        {title && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <h2 className="text-base font-semibold text-gray-900">{title}</h2>
            <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
              <X size={18} className="text-gray-500" />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-auto">{children}</div>
      </div>
    </div>
  )
}

// ── Alert ──────────────────────────────────────────────────────────────────

type AlertType = 'info' | 'warning' | 'error' | 'success'

interface AlertProps {
  type?: AlertType
  message: string
  className?: string
}

const ALERT_STYLES: Record<AlertType, { bg: string; icon: React.ElementType }> = {
  info:    { bg: 'bg-blue-50 border-blue-200 text-blue-800',   icon: Info          },
  warning: { bg: 'bg-amber-50 border-amber-200 text-amber-800', icon: AlertTriangle },
  error:   { bg: 'bg-red-50 border-red-200 text-red-800',      icon: AlertCircle   },
  success: { bg: 'bg-green-50 border-green-200 text-green-800', icon: CheckCircle  },
}

export function Alert({ type = 'info', message, className }: AlertProps) {
  const { bg, icon: Icon } = ALERT_STYLES[type]
  return (
    <div className={clsx('flex items-start gap-2.5 p-3 rounded-lg border', bg, className)}>
      <Icon size={15} className="mt-0.5 flex-shrink-0" />
      <p className="text-sm">{message}</p>
    </div>
  )
}

// ── Tabs ───────────────────────────────────────────────────────────────────

interface Tab { id: string; label: string; count?: number }

interface TabsProps {
  tabs: Tab[]
  active: string
  onChange: (id: string) => void
}

export function Tabs({ tabs, active, onChange }: TabsProps) {
  return (
    <div className="flex border-b border-gray-200 mb-5">
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={clsx(
            'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
            active === tab.id
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-600 hover:text-gray-900',
          )}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span className={clsx('ml-2 px-1.5 py-0.5 rounded-full text-xs',
              active === tab.id ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
            )}>
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

// ── Summary Row ────────────────────────────────────────────────────────────

export function SummaryRow({ label, value, bold = false }: { label: string; value: React.ReactNode; bold?: boolean }) {
  return (
    <div className={clsx('flex justify-between text-sm py-1', bold ? 'font-semibold text-gray-900' : 'text-gray-600')}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  )
}
