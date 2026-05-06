import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number | null | undefined): string {
  const value = Number(amount)
  if (Number.isNaN(value)) return '-'

  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(value))
}

export function formatDate(date: string | Date | null | undefined): string {
  const value = date == null ? '' : date
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '-'

  return new Intl.DateTimeFormat('en-KE', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(parsed)
}

export function formatMonth(date: string | null | undefined): string {
  if (!date) return '-'
  const parsed = new Date(date.includes('T') ? date : `${date}-01`)
  if (Number.isNaN(parsed.getTime())) return '-'

  return new Intl.DateTimeFormat('en-KE', {
    year: 'numeric',
    month: 'long',
  }).format(parsed)
}

export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export function validatePhone(phone: string): boolean {
  return /^(\+254|0)[1-9]\d{8}$/.test(phone.replace(/\s/g, ''))
}

