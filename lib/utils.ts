/**
 * Normaliza un texto para ser guardado en la base de datos:
 * - Quita espacios innecesarios
 * - Convierte a minúsculas
 */
export const normalizeText = (text: string | null | undefined): string => {
  if (!text) return '';
  return text.trim().toLowerCase();
};

/**
 * Limpia un RUT de puntos, guiones y espacios para comparaciones o guardado limpio
 */
export const cleanRUT = (rut: string | null | undefined): string => {
  if (!rut) return '';
  return rut.replace(/[\.\-]/g, '').trim().toLowerCase();
};

/**
 * Formatea un número a moneda chilena (o formato entero estándar)
 */
export const formatCurrency = (amount: number): string => {
  return Math.round(amount).toLocaleString('es-CL');
};

/**
 * Retorna un entero crudo como string, sin decimales ni formato (puntos/comas)
 */
export const formatRawInt = (val: number | string | null | undefined): string => {
  if (val === null || val === undefined) return '0';
  const num = typeof val === 'string' ? parseInt(val, 10) : val;
  if (isNaN(num)) return '0';
  return Math.round(num).toString();
};

/**
 * Registra una acción en la tabla de Auditoría
 */
export const logAction = async (supabase: any, {
  usuario_id,
  email_usuario,
  accion,
  modulo,
  detalle,
  metadata = {}
}: {
  usuario_id: string;
  email_usuario: string;
  accion: 'creacion' | 'edicion' | 'eliminacion' | 'venta' | 'abono' | 'acceso' | 'compra';
  modulo: 'productos' | 'clientes' | 'compras' | 'ventas' | 'usuarios' | 'proveedores';
  detalle: string;
  metadata?: any;
}) => {
  try {
    await supabase.from('Auditoria').insert([{
      usuario_id,
      email_usuario: email_usuario.toLowerCase(),
      accion,
      modulo,
      detalle: detalle.toLowerCase(),
      metadata,
      fecha: new Date().toISOString()
    }]);
  } catch (err) {
    console.error('Error en auditoría:', err);
  }
};

/**
 * Valida un RUT chileno
 */
export const validateRUT = (rut: string): boolean => {
  const clean = cleanRUT(rut).toUpperCase();
  if (clean.length < 2) return false;
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  
  let sum = 0;
  let mul = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += parseInt(body.charAt(i)) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  
  const expectedDV = 11 - (sum % 11);
  const finalDV = expectedDV === 11 ? '0' : expectedDV === 10 ? 'K' : expectedDV.toString();
  
  return dv === finalDV;
};

/**
 * Formatea un RUT a formato 12.345.678-9
 */
export const formatRUT = (rut: string): string => {
  const clean = cleanRUT(rut).toUpperCase();
  if (clean.length < 2) return clean;
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  
  let formattedBody = '';
  for (let i = body.length - 1, j = 1; i >= 0; i--, j++) {
    formattedBody = body.charAt(i) + formattedBody;
    if (j % 3 === 0 && i !== 0) formattedBody = '.' + formattedBody;
  }
  
  return `${formattedBody}-${dv}`;
};
