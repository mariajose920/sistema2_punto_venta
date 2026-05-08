import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Normaliza un texto: quita espacios y convierte a minúsculas.
 */
export function normalizeText(text: string | null | undefined): string {
  if (!text) return "";
  return text.trim().toLowerCase();
}

/**
 * Normaliza un RUT: quita puntos y guiones.
 */
export function normalizeRUT(rut: string | null | undefined): string {
  if (!rut) return "";
  return rut.replace(/\./g, "").replace(/-/g, "").trim().toLowerCase();
}

/**
 * Formatea un monto a moneda local CLP (sin decimales).
 */
export function formatCurrency(amount: number | null | undefined): string {
  return (amount || 0).toLocaleString('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
}
