-- ============================================================
-- DIAGNÓSTICO Y FIX: RLS en Venta, DetalleVenta, Usuario
-- 
-- CAUSA PROBABLE: Una o más de estas tablas tienen RLS
-- activado sin políticas SELECT, por lo que supabase
-- devuelve arrays vacíos (no error) a usuarios autenticados.
--
-- La página Reportes ejecuta:
--   supabase.from('Venta').select('*')
--   supabase.from('DetalleVenta').select('*, Producto(*)')
--   supabase.from('Producto').select('*')
--   supabase.from('Usuario').select('*')
--
-- EJECUTAR EN: Supabase Dashboard → SQL Editor
-- ============================================================

-- ============================
-- PASO 1: DIAGNÓSTICO
-- ============================

-- 1a. ¿RLS está habilitado en cada tabla?
SELECT tablename, rowsecurity AS rls_activado
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('Venta', 'DetalleVenta', 'Usuario', 'Producto')
ORDER BY tablename;

-- 1b. ¿Qué políticas existen para esas tablas?
SELECT tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('Venta', 'DetalleVenta', 'Usuario', 'Producto')
ORDER BY tablename, policyname;

-- ============================
-- PASO 2: FIX — Agregar políticas SELECT faltantes
-- ============================

-- Venta
ALTER TABLE public."Venta" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir SELECT Venta a autenticados" ON public."Venta";
CREATE POLICY "Permitir SELECT Venta a autenticados"
  ON public."Venta"
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Permitir INSERT Venta a autenticados" ON public."Venta";
CREATE POLICY "Permitir INSERT Venta a autenticados"
  ON public."Venta"
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir UPDATE Venta a autenticados" ON public."Venta";
CREATE POLICY "Permitir UPDATE Venta a autenticados"
  ON public."Venta"
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- DetalleVenta
ALTER TABLE public."DetalleVenta" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir SELECT DetalleVenta a autenticados" ON public."DetalleVenta";
CREATE POLICY "Permitir SELECT DetalleVenta a autenticados"
  ON public."DetalleVenta"
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Permitir INSERT DetalleVenta a autenticados" ON public."DetalleVenta";
CREATE POLICY "Permitir INSERT DetalleVenta a autenticados"
  ON public."DetalleVenta"
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Usuario
ALTER TABLE public."Usuario" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir SELECT Usuario a autenticados" ON public."Usuario";
CREATE POLICY "Permitir SELECT Usuario a autenticados"
  ON public."Usuario"
  FOR SELECT
  TO authenticated
  USING (true);

-- ============================
-- PASO 3: VERIFICACIÓN POST-FIX
-- ============================

SELECT tablename, policyname, permissive, roles, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('Venta', 'DetalleVenta', 'Usuario')
ORDER BY tablename, cmd;
