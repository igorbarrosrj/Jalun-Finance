import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatarMoeda(valor: string | number | null): string {
  if (valor === null || valor === undefined) return '—'
  const num = typeof valor === 'string' ? parseFloat(valor) : valor
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(num)
}

export function formatarData(data: string | Date | null): string {
  if (!data) return '—'
  return new Intl.DateTimeFormat('pt-BR').format(new Date(data))
}
