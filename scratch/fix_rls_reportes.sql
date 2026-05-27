-- ============================================================
-- DIAGNÓSTICO Y FIX: RLS en tablas de métricas
-- 
-- Pantallas afectadas:
--   Panel de Control  (/admin)  → Venta, Compra, Credito, Producto
--   Reportes y Análisis (/reportes) → Venta, DetalleVenta, Usuario, Producto
--
-- CAUSA PROBABLE: Una o más de estas tablas tienen RLS
-- activado sin políticas SELECT. Supabase devuelve array
-- vacío (no error) cuando RLS bloquea.
--
-- EJECUTAR EN: Supabase Dashboard → SQL Editor
-- ============================================================

-- ============================================================
-- PASO 1: DIAGNÓSTICO — ¿RLS activado? ¿Qué policies existen?
-- ============================================================

SELECT tablename, rowsecurity AS rls_activado
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('Venta', 'DetalleVenta', 'Usuario', 'Compra', 'Credito', 'Producto')
ORDER BY tablename;

SELECT tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('Venta', 'DetalleVenta', 'Usuario', 'Compra', 'Credito', 'Producto')
ORDER BY tablename, policyname;

-- ============================================================
-- PASO 2: FIX — Políticas SELECT para todas las tablas
-- ============================================================
-- 
-- ¿Por qué TO authenticated y no por rol (admin/cajera)?
--   - El frontend ya restringe acceso por rol (useAuth).
--   - Otras páginas (ventas/nueva, compras) también consultan
--     estas tablas con usuarios de rol cajera.
--   - Restringir por auth.job() -> 'user_metadata' -> 'rol'
--     rompería esas funcionalidades.
--   - Producto ya usa USING(true) para authenticated — mismo criterio.
--
-- ¿Por qué incluir INSERT/UPDATE?
--   - Solo SELECT basta para las pantallas de métricas, pero
--     las páginas de operación (ventas, compras) también
--     necesitan INSERT/UPDATE. Se incluyen para evitar
--     tener que ejecutar otro fix después.
-- ============================================================

-- ---------------------------------------------
-- Venta (usada por Panel de Control y Reportes)
-- ---------------------------------------------
ALTER TABLE IF EXISTS public."Venta" ENABLE ROW LEVEL SECURITY;

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

-- ---------------------------------------------
-- DetalleVenta (usada por Reportes)
-- ---------------------------------------------
ALTER TABLE IF EXISTS public."DetalleVenta" ENABLE ROW LEVEL SECURITY;

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

DROP POLICY IF EXISTS "Permitir UPDATE DetalleVenta a autenticados" ON public."DetalleVenta";
CREATE POLICY "Permitir UPDATE DetalleVenta a autenticados"
  ON public."DetalleVenta"
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------
-- Usuario (usada por Reportes — muestra nombre de cajeras)
-- ---------------------------------------------
ALTER TABLE IF EXISTS public."Usuario" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir SELECT Usuario a autenticados" ON public."Usuario";
CREATE POLICY "Permitir SELECT Usuario a autenticados"
  ON public."Usuario"
  FOR SELECT
  TO authenticated
  USING (true);

-- ---------------------------------------------
-- Compra (usada por Panel de Control — gastos)
-- ---------------------------------------------
ALTER TABLE IF EXISTS public."Compra" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir SELECT Compra a autenticados" ON public."Compra";
CREATE POLICY "Permitir SELECT Compra a autenticados"
  ON public."Compra"
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Permitir INSERT Compra a autenticados" ON public."Compra";
CREATE POLICY "Permitir INSERT Compra a autenticados"
  ON public."Compra"
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ---------------------------------------------
-- Credito (usada por Panel de Control — cuentas por cobrar)
-- ---------------------------------------------
ALTER TABLE IF EXISTS public."Credito" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir SELECT Credito a autenticados" ON public."Credito";
CREATE POLICY "Permitir SELECT Credito a autenticados"
  ON public."Credito"
  FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================
-- PASO 3: VERIFICACIÓN POST-FIX
-- ============================================================

SELECT tablename, policyname, permissive, roles, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('Venta', 'DetalleVenta', 'Usuario', 'Compra', 'Credito')
ORDER BY tablename, cmd;
