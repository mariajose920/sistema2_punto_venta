import { supabase } from '@/lib/supabase';
import { normalizeText, formatRUTVisual, validateRUT } from '@/lib/utils';
import { Database } from '@/types/database.types';

type ClienteRow = Database['public']['Tables']['Cliente']['Row'];

interface SaveClienteData {
  nombre: string;
  rut: string;
  telefono: string;
}

/**
 * Guarda o actualiza un cliente, aplicando todas las validaciones de negocio.
 * 
 * @param data Datos del cliente a guardar.
 * @param excludeId ID del cliente actual (si es una actualización) para excluirlo de la validación de duplicados.
 * @returns El cliente guardado.
 * @throws Error si falla la validación o la inserción/actualización.
 */
export async function saveCliente(data: SaveClienteData, excludeId?: string): Promise<ClienteRow> {
  const nombreNorm = normalizeText(data.nombre);
  if (!nombreNorm) {
    throw new Error('El nombre es obligatorio.');
  }

  if (!data.rut) {
    throw new Error('El RUT es obligatorio.');
  }

  const rutNormalizado = formatRUTVisual(data.rut);
  if (!validateRUT(rutNormalizado)) {
    throw new Error('El RUT ingresado no es válido (Módulo 11).');
  }

  const ignoreId = excludeId || '00000000-0000-0000-0000-000000000000';

  // Validar duplicado de NOMBRE
  const { data: nombreExistente } = await (supabase.from('Cliente') as any)
    .select('id')
    .eq('nombre', nombreNorm)
    .neq('id', ignoreId)
    .maybeSingle();

  if (nombreExistente) {
    throw new Error(`Ya existe un cliente registrado con el nombre: "${nombreNorm}".`);
  }

  // Validar duplicado de RUT
  const { data: existente } = await (supabase.from('Cliente') as any)
    .select('id, nombre')
    .eq('rut', rutNormalizado)
    .neq('id', ignoreId)
    .maybeSingle();

  if (existente) {
    throw new Error(`Ya existe un cliente registrado con el RUT: ${rutNormalizado} (${existente.nombre}).`);
  }

  const finalData = {
    nombre: nombreNorm,
    rut: rutNormalizado,
    telefono: data.telefono || ''
  };

  if (excludeId) {
    const { data: updated, error } = await (supabase.from('Cliente') as any)
      .update(finalData)
      .eq('id', excludeId)
      .select()
      .single();

    if (error) throw error;
    return updated as ClienteRow;
  } else {
    const { data: inserted, error } = await (supabase.from('Cliente') as any)
      .insert([{
        ...finalData,
        saldo_deudado: 0,
        saldo_favor: 0
      }])
      .select()
      .single();

    if (error) throw error;
    return inserted as ClienteRow;
  }
}
