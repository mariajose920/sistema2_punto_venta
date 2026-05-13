-- ============================================================
-- FIX: Agregar columna 'subtotal' a la tabla DetallePedido
--
-- CAUSA DEL ERROR:
--   "Could not find the 'subtotal' column of 'DetallePedido'
--    in the schema cache"
--
-- La tabla fue creada sin esta columna (setup incompleto).
-- El código en catalogo/page.tsx y pedidos/page.tsx la requiere
-- para insertar detalles y calcular totales correctamente.
--
-- Ejecutar en: Supabase → SQL Editor
-- ============================================================

-- 1. Agregar la columna si no existe
ALTER TABLE public."DetallePedido"
  ADD COLUMN IF NOT EXISTS subtotal NUMERIC NOT NULL DEFAULT 0 CHECK (subtotal >= 0);

-- 2. (Opcional) Si ya hay filas con subtotal = 0 por el DEFAULT,
--    recalcular a partir de cantidad * precio_unitario
UPDATE public."DetallePedido"
  SET subtotal = cantidad * precio_unitario
  WHERE subtotal = 0;

-- 3. Recargar el schema cache de PostgREST para que Supabase
--    reconozca la nueva columna sin reiniciar el proyecto
NOTIFY pgrst, 'reload schema';
