-- Migración para soportar múltiples perfiles y búsqueda optimizada de RUT

-- 1. Cambiar la columna 'rol' de Usuario a 'roles' (array de texto)
-- Primero renombramos y cambiamos el tipo
ALTER TABLE public."Usuario" RENAME COLUMN rol TO rol_old;
ALTER TABLE public."Usuario" ADD COLUMN roles text[] DEFAULT ARRAY['cajera'::text];

-- Migramos los datos del enum/texto viejo al nuevo array
UPDATE public."Usuario" SET roles = ARRAY[rol_old::text];

-- Eliminamos la columna vieja (opcional, pero limpio)
-- ALTER TABLE public."Usuario" DROP COLUMN rol_old;

-- 2. Crear índice funcional para búsqueda de RUT (sin puntos ni guiones)
-- Esta función ayuda a normalizar en el índice
CREATE OR REPLACE FUNCTION public.normalize_rut(rut text) RETURNS text AS $$
BEGIN
    RETURN lower(replace(replace(rut, '.', ''), '-', ''));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE INDEX IF NOT EXISTS idx_cliente_rut_normalizado ON public."Cliente" (public.normalize_rut(rut));

-- 3. Asegurar tablas de auditoría (si no existen o les faltan columnas)
-- El esquema ya las tiene, pero nos aseguramos de que tengan índices por usuario y fecha
CREATE INDEX IF NOT EXISTS idx_producto_auditoria_usuario_id ON public.producto_auditoria(usuario_id);
CREATE INDEX IF NOT EXISTS idx_producto_auditoria_created_at ON public.producto_auditoria(created_at);
CREATE INDEX IF NOT EXISTS idx_venta_id_usuario_cajera ON public."Venta"(id_usuario_cajera);
CREATE INDEX IF NOT EXISTS idx_venta_fecha_venta ON public."Venta"(fecha_venta);

-- 4. Nueva tabla para auditoría de acciones generales (opcional si alerta_movimiento no basta)
-- Usaremos alerta_movimiento para acciones generales si no hay otra.
