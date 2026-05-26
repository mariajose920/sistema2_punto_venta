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
 * Normaliza un monto a número entero positivo (sin decimales).
 * - Redondea a entero con Math.round()
 * - Retorna 0 si es null/undefined
 * - Retorna 0 si es negativo
 */
export function normalizeAmount(amount: number | null | undefined): number {
  const val = Number(amount || 0);
  const rounded = Math.round(val);
  return Math.max(0, rounded);
}

/**
 * Redondea un monto monetario a entero (sin decimales).
 * Ideal para agregaciones y cálculos antes de mostrar.
 */
export function roundMoney(amount: number | null | undefined): number {
  return Math.round(amount || 0);
}

/**
 * Formatea un monto a moneda local CLP.
 * Garantiza que siempre muestra como entero (sin decimales).
 */
export function formatCurrency(amount: number | null | undefined): string {
  const rounded = Math.round(amount || 0);
  return rounded.toLocaleString('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
}

/**
 * Logea mensajes en consola únicamente en entorno de desarrollo.
 */
export function debugLog(message?: any, ...optionalParams: any[]): void {
  if (process.env.NODE_ENV === 'development') {
    console.log(message, ...optionalParams);
  }
}

/**
 * Logea errores en consola de manera segura en producción (sin exponer detalles internos sensibles).
 */
export function debugError(message: string, errorObj?: any): void {
  if (process.env.NODE_ENV === 'development') {
    console.error(message, errorObj);
  } else {
    // En producción logea solo un mensaje genérico seguro sin detalles de Supabase o base de datos
    console.error(message);
  }
}
