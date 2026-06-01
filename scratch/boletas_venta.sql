-- ============================================================
-- BOLETA ELECTRONICA EN VENTAS
-- Ejecutar en Supabase Dashboard -> SQL Editor
-- ============================================================

ALTER TABLE public."Venta"
  ADD COLUMN IF NOT EXISTS requiere_boleta BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS estado_boleta TEXT NOT NULL DEFAULT 'pendiente',
  ADD COLUMN IF NOT EXISTS folio_boleta TEXT,
  ADD COLUMN IF NOT EXISTS track_id_sii TEXT,
  ADD COLUMN IF NOT EXISTS respuesta_sii JSONB,
  ADD COLUMN IF NOT EXISTS fecha_emision_boleta TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS url_pdf_boleta TEXT,
  ADD COLUMN IF NOT EXISTS xml_boleta TEXT;

ALTER TABLE public."Venta"
  DROP CONSTRAINT IF EXISTS venta_estado_boleta_check;

ALTER TABLE public."Venta"
  ADD CONSTRAINT venta_estado_boleta_check
  CHECK (estado_boleta IN ('pendiente', 'emitida', 'rechazada'));

CREATE INDEX IF NOT EXISTS idx_venta_estado_boleta
  ON public."Venta"(estado_boleta, fecha_venta DESC);

CREATE INDEX IF NOT EXISTS idx_venta_folio_boleta
  ON public."Venta"(folio_boleta);

-- Recomendado para ventas historicas: no requieren boleta hasta que el usuario la emita.
UPDATE public."Venta"
SET requiere_boleta = false
WHERE requiere_boleta IS NULL;
