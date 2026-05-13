-- ============================================================
-- Agrega columna fuente_datos a la tabla Producto
--
-- Propósito: Registrar el origen del producto al crearlo.
--   'manual'   → ingresado a mano por el usuario
--   'api'      → autocompletado desde Open Food Facts u otra API
--   'interno'  → producto local sin código EAN (código interno)
--
-- Ejecutar en: Supabase → SQL Editor
-- ============================================================

ALTER TABLE public."Producto"
  ADD COLUMN IF NOT EXISTS fuente_datos TEXT NOT NULL DEFAULT 'manual'
    CHECK (fuente_datos IN ('manual', 'api', 'interno'));

-- Marcar productos existentes sin código de barras como 'interno'
UPDATE public."Producto"
  SET fuente_datos = 'interno'
  WHERE codigo_barra IS NULL OR codigo_barra = '';

NOTIFY pgrst, 'reload schema';
