-- ============================================================
-- SISTEMA DE CIERRE DE CAJA — SQL COMPLETO
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. TABLA CAJA
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public."Caja" (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_caja     INTEGER NOT NULL DEFAULT 1,
  fecha_apertura  TIMESTAMPTZ NOT NULL DEFAULT now(),
  fecha_cierre    TIMESTAMPTZ,
  id_usuario_apertura UUID NOT NULL REFERENCES public."Usuario"(id),
  id_usuario_cierre   UUID REFERENCES public."Usuario"(id),
  monto_inicial   BIGINT NOT NULL DEFAULT 0,
  monto_esperado  BIGINT,
  monto_declarado BIGINT,
  diferencia      BIGINT,
  estado          TEXT NOT NULL DEFAULT 'abierta'
                    CHECK (estado IN ('abierta', 'cerrada', 'cerrada_con_descuadre')),
  observacion     TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_caja_estado ON public."Caja"(estado);
CREATE INDEX IF NOT EXISTS idx_caja_fecha ON public."Caja"(fecha_apertura DESC);

-- ──────────────────────────────────────────────────────────────
-- 2. TABLA SOLICITUD DE SEGUNDA CAJA
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public."SolicitudCaja" (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_cajera         UUID NOT NULL REFERENCES public."Usuario"(id),
  motivo            TEXT NOT NULL,
  estado            TEXT NOT NULL DEFAULT 'pendiente'
                      CHECK (estado IN ('pendiente', 'aprobada', 'rechazada')),
  id_admin_responde UUID REFERENCES public."Usuario"(id),
  id_caja_creada    UUID REFERENCES public."Caja"(id),
  respuesta_admin   TEXT,
  created_at        TIMESTAMPTZ DEFAULT now(),
  responded_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_solicitud_estado ON public."SolicitudCaja"(estado);

-- ──────────────────────────────────────────────────────────────
-- 3. TABLA NOTIFICACIONES DEL ADMIN
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public."NotificacionAdmin" (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo        TEXT NOT NULL CHECK (tipo IN ('descuadre', 'solicitud_caja', 'alerta')),
  titulo      TEXT NOT NULL,
  mensaje     TEXT NOT NULL,
  leida       BOOLEAN NOT NULL DEFAULT false,
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notif_leida ON public."NotificacionAdmin"(leida, created_at DESC);

-- ──────────────────────────────────────────────────────────────
-- 4. AGREGAR id_caja A VENTA
-- ──────────────────────────────────────────────────────────────
ALTER TABLE public."Venta"
  ADD COLUMN IF NOT EXISTS id_caja UUID REFERENCES public."Caja"(id);

CREATE INDEX IF NOT EXISTS idx_venta_id_caja ON public."Venta"(id_caja);

-- ──────────────────────────────────────────────────────────────
-- 5. RLS (Row Level Security)
-- ──────────────────────────────────────────────────────────────

-- Caja
ALTER TABLE public."Caja" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir SELECT Caja a autenticados" ON public."Caja";
CREATE POLICY "Permitir SELECT Caja a autenticados"
  ON public."Caja" FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Permitir INSERT Caja a autenticados" ON public."Caja";
CREATE POLICY "Permitir INSERT Caja a autenticados"
  ON public."Caja" FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir UPDATE Caja a autenticados" ON public."Caja";
CREATE POLICY "Permitir UPDATE Caja a autenticados"
  ON public."Caja" FOR UPDATE TO authenticated USING (true);

-- SolicitudCaja
ALTER TABLE public."SolicitudCaja" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir SELECT SolicitudCaja a autenticados" ON public."SolicitudCaja";
CREATE POLICY "Permitir SELECT SolicitudCaja a autenticados"
  ON public."SolicitudCaja" FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Permitir INSERT SolicitudCaja a autenticados" ON public."SolicitudCaja";
CREATE POLICY "Permitir INSERT SolicitudCaja a autenticados"
  ON public."SolicitudCaja" FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir UPDATE SolicitudCaja a autenticados" ON public."SolicitudCaja";
CREATE POLICY "Permitir UPDATE SolicitudCaja a autenticados"
  ON public."SolicitudCaja" FOR UPDATE TO authenticated USING (true);

-- NotificacionAdmin
ALTER TABLE public."NotificacionAdmin" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir SELECT NotificacionAdmin a autenticados" ON public."NotificacionAdmin";
CREATE POLICY "Permitir SELECT NotificacionAdmin a autenticados"
  ON public."NotificacionAdmin" FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Permitir INSERT NotificacionAdmin a autenticados" ON public."NotificacionAdmin";
CREATE POLICY "Permitir INSERT NotificacionAdmin a autenticados"
  ON public."NotificacionAdmin" FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir UPDATE NotificacionAdmin a autenticados" ON public."NotificacionAdmin";
CREATE POLICY "Permitir UPDATE NotificacionAdmin a autenticados"
  ON public."NotificacionAdmin" FOR UPDATE TO authenticated USING (true);

-- ──────────────────────────────────────────────────────────────
-- 6. VERIFICACIÓN
-- ──────────────────────────────────────────────────────────────
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('Caja', 'SolicitudCaja', 'NotificacionAdmin')
ORDER BY tablename;

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'Venta'
  AND column_name = 'id_caja';
