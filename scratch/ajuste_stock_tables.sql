-- ============================================================
-- SISTEMA DE AJUSTE DE STOCK CON PERMISOS Y AUDITORÍA
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- 1. Tabla de solicitudes de ajuste de stock (cajera pide permiso al admin)
CREATE TABLE IF NOT EXISTS public."SolicitudAjusteStock" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cajera_id uuid NOT NULL,
  producto_id uuid NOT NULL,
  ajuste integer NOT NULL,
  motivo text,
  estado text NOT NULL DEFAULT 'pendiente', -- 'pendiente' | 'aprobada' | 'rechazada'
  admin_id uuid,
  tipo_aprobacion text, -- 'una_vez' | 'temporal'
  duracion_minutos integer,
  expira_en timestamptz,
  responded_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- 2. Tabla de auditoría de todos los ajustes realizados
CREATE TABLE IF NOT EXISTS public."AjusteStock" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id uuid NOT NULL,
  usuario_id uuid NOT NULL,
  ajuste integer NOT NULL,
  stock_antes integer NOT NULL,
  stock_despues integer NOT NULL,
  tipo text NOT NULL DEFAULT 'directo', -- 'directo' | 'autorizado_temporal'
  solicitud_id uuid REFERENCES public."SolicitudAjusteStock"(id),
  created_at timestamptz DEFAULT now()
);

-- 3. Habilitar RLS
ALTER TABLE public."SolicitudAjusteStock" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."AjusteStock" ENABLE ROW LEVEL SECURITY;

-- 4. Políticas RLS para SolicitudAjusteStock
DROP POLICY IF EXISTS "Cualquiera puede crear solicitudes de ajuste" ON public."SolicitudAjusteStock";
CREATE POLICY "Cualquiera puede crear solicitudes de ajuste"
  ON public."SolicitudAjusteStock" FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Usuarios autenticados leen solicitudes de ajuste" ON public."SolicitudAjusteStock";
CREATE POLICY "Usuarios autenticados leen solicitudes de ajuste"
  ON public."SolicitudAjusteStock" FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Usuarios autenticados actualizan solicitudes de ajuste" ON public."SolicitudAjusteStock";
CREATE POLICY "Usuarios autenticados actualizan solicitudes de ajuste"
  ON public."SolicitudAjusteStock" FOR UPDATE TO authenticated USING (true);

-- 5. Políticas RLS para AjusteStock
DROP POLICY IF EXISTS "Cualquiera puede registrar ajustes de stock" ON public."AjusteStock";
CREATE POLICY "Cualquiera puede registrar ajustes de stock"
  ON public."AjusteStock" FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Usuarios autenticados leen ajustes de stock" ON public."AjusteStock";
CREATE POLICY "Usuarios autenticados leen ajustes de stock"
  ON public."AjusteStock" FOR SELECT TO authenticated USING (true);
