import { supabase } from './supabase';

export type AuditLogModulo = 'productos' | 'ventas' | 'clientes' | 'usuarios' | 'pedidos' | 'configuracion';
export type AuditLogAccion = 
  | 'creacion' 
  | 'edicion' 
  | 'eliminacion' 
  | 'anulacion' 
  | 'cambio_precio' 
  | 'cambio_stock' 
  | 'activacion' 
  | 'desactivacion';

export interface AuditLogInsert {
  id_usuario: string;
  modulo: AuditLogModulo;
  accion: AuditLogAccion;
  entidad_afectada: string;
  id_entidad: string;
  descripcion: string;
  old_values?: any;
  new_values?: any;
}

/**
 * Registra una acción administrativa en el historial de movimientos de auditoría.
 */
export async function logActivity(log: AuditLogInsert) {
  try {
    const { error } = await (supabase.from('AuditLog') as any)
      .insert({
        id_usuario: log.id_usuario,
        modulo: log.modulo,
        accion: log.accion,
        entidad_afectada: log.entidad_afectada,
        id_entidad: log.id_entidad,
        descripcion: log.descripcion,
        old_values: log.old_values || {},
        new_values: log.new_values || {},
      });
    if (error) {
      console.error('Error insertando log de auditoría:', error);
    }
  } catch (err) {
    console.error('Excepción al registrar actividad:', err);
  }
}
