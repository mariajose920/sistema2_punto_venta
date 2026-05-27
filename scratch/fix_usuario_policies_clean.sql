-- ============================================================
-- LIMPIEZA TOTAL: Policies de public."Usuario"
--
-- Problema:
--   Múltiples policies SELECT duplicadas y/o recursivas
--   sobre la tabla Usuario causan:
--     "infinite recursion detected in policy for relation 'Usuario'"
--
-- Solución:
--   1. Eliminar TODAS las policies existentes de Usuario
--   2. Crear un conjunto mínimo (4 policies):
--      - SELECT: lectura para admin/cajera via JWT (sin recursión)
--      - INSERT: solo admin via JWT
--      - UPDATE: solo admin via JWT (o usuario sobre sí mismo)
--      - DELETE: solo admin via JWT
--   3. Verificar
--
-- ¿Por qué usar auth.jwt() en lugar de USING(true)?
--   - USING(true) permite a CUALQUIER autenticado leer
--     TODOS los datos de Usuario (email, rol, etc.)
--   - auth.jwt() lee el rol desde el token JWT, sin tocar
--     la tabla → 0% riesgo de recursión
--   - Solo admin y cajera pueden leer (proveedor no necesita)
--
-- EJECUTAR EN: Supabase Dashboard → SQL Editor
-- ============================================================

-- ============================================================
-- PASO 1: DIAGNÓSTICO — Policies actuales en Usuario
-- ============================================================

SELECT '>>> POLICIES ACTUALES EN Usuario <<<' AS diagnosis;

SELECT oid::regclass AS table_name,
       pol.polname AS policy_name,
       CASE pol.polcmd
         WHEN 'r' THEN 'SELECT'
         WHEN 'a' THEN 'INSERT'
         WHEN 'w' THEN 'UPDATE'
         WHEN 'd' THEN 'DELETE'
         WHEN '*' THEN 'ALL'
       END AS command,
       pol.polpermissive AS permissive,
       (SELECT string_agg(rolname, ', ') FROM pg_roles WHERE oid = ANY(pol.polroles)) AS roles,
       pg_get_expr(pol.polqual, pol.polrelid) AS using_expr,
       pg_get_expr(pol.polwithcheck, pol.polrelid) AS withcheck_expr
FROM pg_policy pol
JOIN pg_class cls ON cls.oid = pol.polrelid
WHERE cls.relname = 'Usuario'
  AND cls.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
ORDER BY pol.polname;

-- ============================================================
-- PASO 2: ELIMINAR TODAS las policies de Usuario
-- ============================================================

DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT polname
    FROM pg_policy
    WHERE polrelid = (
      SELECT oid FROM pg_class
      WHERE relname = 'Usuario'
        AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public."Usuario"', pol.polname);
    RAISE NOTICE 'Eliminada policy: %', pol.polname;
  END LOOP;
END;
$$;

-- ============================================================
-- PASO 3: CREAR NUEVAS POLICIES (conjunto mínimo)
-- ============================================================
--
-- 3a. SELECT — Lectura para admin y cajera (via JWT, sin recursión)
--      auth.jwt() -> 'user_metadata' ->> 'rol' lee el rol
--      del token JWT directamente. No consulta la tabla Usuario,
--      por lo tanto NO hay recursión.
--
--      Roles permitidos: 'admin', 'cajera'
--      (proveedor no necesita leer Usuario)
-- ============================================================

ALTER TABLE IF EXISTS public."Usuario" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_usuario"
  ON public."Usuario"
  FOR SELECT
  TO authenticated
  USING (
    auth.jwt() -> 'user_metadata' ->> 'rol' IN ('admin', 'cajera')
  );

-- 3b. INSERT — Solo admin puede crear usuarios
CREATE POLICY "insert_usuario"
  ON public."Usuario"
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.jwt() -> 'user_metadata' ->> 'rol' = 'admin'
  );

-- 3c. UPDATE — Admin puede actualizar cualquier usuario;
--      cualquier usuario puede actualizar su propio perfil
CREATE POLICY "update_usuario"
  ON public."Usuario"
  FOR UPDATE
  TO authenticated
  USING (
    auth.jwt() -> 'user_metadata' ->> 'rol' = 'admin'
    OR id = auth.uid()
  )
  WITH CHECK (
    auth.jwt() -> 'user_metadata' ->> 'rol' = 'admin'
    OR id = auth.uid()
  );

-- 3d. DELETE — Solo admin puede eliminar usuarios
CREATE POLICY "delete_usuario"
  ON public."Usuario"
  FOR DELETE
  TO authenticated
  USING (
    auth.jwt() -> 'user_metadata' ->> 'rol' = 'admin'
  );

-- ============================================================
-- PASO 4: VERIFICACIÓN POST-FIX
-- ============================================================

SELECT '>>> POLICIES FINALES EN Usuario <<<' AS verification;

SELECT oid::regclass AS table_name,
       pol.polname AS policy_name,
       CASE pol.polcmd
         WHEN 'r' THEN 'SELECT'
         WHEN 'a' THEN 'INSERT'
         WHEN 'w' THEN 'UPDATE'
         WHEN 'd' THEN 'DELETE'
         WHEN '*' THEN 'ALL'
       END AS command,
       pg_get_expr(pol.polqual, pol.polrelid) AS using_expr,
       pg_get_expr(pol.polwithcheck, pol.polrelid) AS withcheck_expr
FROM pg_policy pol
JOIN pg_class cls ON cls.oid = pol.polrelid
WHERE cls.relname = 'Usuario'
  AND cls.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
ORDER BY pol.polname;

-- ============================================================
-- PRUEBA RÁPIDA DE NO-RECURSIÓN
-- ============================================================
-- Simula la query que hace Historial de Ventas:
--   SELECT id_usuario_cajera, (SELECT nombre FROM "Usuario" u WHERE u.id = v.id_usuario_cajera)
--   FROM "Venta" LIMIT 1;
--
-- Esto debería ejecutarse sin error si la recursión está resuelta.
-- (Descomentar para probar)
--
-- SELECT id_venta, id_usuario_cajera,
--   (SELECT nombre FROM public."Usuario" u WHERE u.id = v.id_usuario_cajera) AS cajera_nombre
-- FROM public."Venta" v
-- LIMIT 5;
