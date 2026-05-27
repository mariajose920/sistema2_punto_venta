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

const cleanRUTInternal = (rut: string) => (rut || '').replace(/[^0-9kK]/g, '').toUpperCase();

export const validateRUT = (rut: string) => {
  const clean = cleanRUTInternal(rut);
  if (clean.length < 2) return false;
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  let sum = 0;
  let mul = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += parseInt(body.charAt(i)) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  const res = 11 - (sum % 11);
  const calculatedDV = res === 11 ? '0' : res === 10 ? 'K' : res.toString();
  return calculatedDV === dv;
};

export const formatRUTVisual = (rut: string) => {
  const clean = cleanRUTInternal(rut);
  if (clean.length < 2) return clean;
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  let formatted = '';
  for (let i = body.length - 1, j = 1; i >= 0; i--, j++) {
    formatted = body.charAt(i) + formatted;
    if (j % 3 === 0 && i !== 0) formatted = '.' + formatted;
  }
  return `${formatted}-${dv}`;
};

/**
 * Calcula un puntaje de relevancia/similitud entre un producto y un término de búsqueda.
 * Retorna > 0 si hay coincidencia relevante, priorizando:
 * 1. Coincidencia exacta
 * 2. Comienza con
 * 3. Palabra comienza con
 * 4. Contiene en cualquier otra parte
 * 5. Similitud difusa
 */
export function getProductSearchScore(
  product: { nombre?: string | null; codigo_barra?: string | null },
  query: string
): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;

  const name = (product.nombre || "").trim().toLowerCase();
  const code = String(product.codigo_barra || "").trim().toLowerCase();

  // Relación de longitud como desempate dentro de cada grupo (nombres más cortos o matches proporcionalmente mayores primero)
  const lengthRatio = q.length / name.length;

  // 1. Coincidencia exacta
  if (code === q) return 100000 + lengthRatio * 100;
  if (name === q) return 90000 + lengthRatio * 100;

  // 2. Productos cuyo nombre comienza con el texto buscado
  if (name.startsWith(q)) return 80000 + lengthRatio * 100;

  // 3. Productos donde alguna palabra comienza con el texto buscado
  const words = name.split(/\s+/);
  if (words.some(w => w.startsWith(q))) return 70000 + lengthRatio * 100;

  // 4. Productos donde el texto aparece en cualquier otra parte (contiene)
  if (name.includes(q)) return 60000 + lengthRatio * 100;
  if (code && code.includes(q)) return 50000 + lengthRatio * 100;

  // 5. Coincidencia difusa (tolerancia a errores leves)
  const qTokens = q.split(/\s+/).filter(Boolean);
  const nameTokens = name.split(/\s+/).filter(Boolean);

  let matchedTokens = 0;
  let tokenScore = 0;

  for (const qTok of qTokens) {
    let bestTokScore = 0;
    for (const nTok of nameTokens) {
      if (nTok === qTok) {
        bestTokScore = Math.max(bestTokScore, 1000);
      } else if (nTok.startsWith(qTok)) {
        bestTokScore = Math.max(bestTokScore, 800);
      } else if (nTok.includes(qTok)) {
        bestTokScore = Math.max(bestTokScore, 500);
      } else {
        if (qTok.length > 2) {
          const editDist = getEditDistance(qTok, nTok);
          const maxLen = Math.max(qTok.length, nTok.length);
          if (editDist <= 2) {
            const similarity = (maxLen - editDist) / maxLen;
            bestTokScore = Math.max(bestTokScore, Math.round(similarity * 400));
          }
        }
      }
    }
    if (bestTokScore > 0) {
      matchedTokens++;
      tokenScore += bestTokScore;
    }
  }

  if (matchedTokens > 0) {
    const tokenMatchRatio = matchedTokens / qTokens.length;
    return Math.round(tokenScore * tokenMatchRatio) + lengthRatio * 10;
  }

  return 0;
}

// Implementación rápida y optimizada de distancia de Levenshtein para typos
function getEditDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // sustitución
          matrix[i][j - 1] + 1,     // inserción
          matrix[i - 1][j] + 1      // eliminación
        );
      }
    }
  }
  return matrix[b.length][a.length];
}
