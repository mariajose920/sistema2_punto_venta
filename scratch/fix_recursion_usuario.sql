-- ============================================================
-- FIX: Infinite recursion en policy de Usuario
--
-- Error en Historial de Ventas:
--   infinite recursion detected in policy for relation "Usuario"
--
-- Causa: La query en historial/page.tsx:L46 hace:
--   supabase.from('Venta').select(`...,
--     usuario:id_usuario_cajera(nombre)`)
--
-- Esto dispara RLS sobre Usuario. Si Usuario tiene una policy
-- que hace subconsulta SELECT a la misma tabla Usuario (ej:
-- para verificar el rol del usuario actual), se produce
-- recursión infinita.
--
-- Ejemplo de policy que causa recursión:
--   CREATE POLICY "X" ON "Usuario"
--     USING ((SELECT rol FROM "Usuario" WHERE id = auth.uid()) = 'admin');
--
-- Solución:
--   1. Eliminar TODAS las policies SELECT de Usuario
--      (cualquiera sea su nombre)
--   2. Crear una sola policy NO recursiva que usa auth.jwt()
--      en lugar de subconsulta a la tabla
--
-- EJECUTAR EN: Supabase Dashboard → SQL Editor
-- ============================================================

-- ============================================================
-- PASO 1: DIAGNÓSTICO — ¿Qué policies existen en Usuario?
-- ============================================================

SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'Usuario'
ORDER BY policyname;

-- ============================================================
-- PASO 2: ELIMINAR TODAS las policies SELECT de Usuario
-- ============================================================
--
-- Usamos un bloque DO para iterar y dropear cada policy
-- que tenga cmd = 'SELECT'. Esto elimina cualquier policy
-- recursiva que exista, sin importar su nombre.
-- ============================================================

DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'Usuario'
      AND cmd = 'SELECT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public."Usuario"', pol.policyname);
    RAISE NOTICE 'Dropped policy: %', pol.policyname;
  END LOOP;
END;
$$;

-- ============================================================
-- PASO 3: CREAR POLICY SEGURA (sin recursión)
-- ============================================================
--
-- Usamos auth.jwt() -> 'user_metadata' ->> 'rol' para leer
-- el rol desde el token JWT directamente, sin tocar la tabla.
--
-- auth.jwt() devuelve el payload completo del JWT. La metadata
-- del usuario está en el campo "user_metadata.rol" (según la
-- configuración del proyecto, ver AuthContext.tsx:L74).
--
-- Beneficios:
--   - Sin subconsultas → sin recursión
--   - Solo admins y cajeras pueden leer la tabla Usuario
--   - Las nested queries desde Venta (usuario:id_usuario_cajera)
--     funcionan porque el token del usuario autenticado tiene el rol
-- ============================================================

ALTER TABLE IF EXISTS public."Usuario" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir SELECT Usuario a autenticados" ON public."Usuario";
CREATE POLICY "Permitir SELECT Usuario a autenticados"
  ON public."Usuario"
  FOR SELECT
  TO authenticated
  USING (
    auth.jwt() -> 'user_metadata' ->> 'rol' IN ('admin', 'cajera')
  );

-- ============================================================
-- PASO 4: VERIFICACIÓN POST-FIX
-- ============================================================
--
-- Debe mostrar UNA sola policy con qual = "auth.jwt()..."
-- y roles = "{authenticated}"
-- ============================================================

SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'Usuario'
ORDER BY policyname;

-- Si la query SELECT de Usuario sigue fallando, verificar
-- que el JWT del usuario contenga user_metadata.rol.
-- Para depurar, ejecutar:
--   SELECT auth.jwt() -> 'user_metadata' ->> 'rol' AS rol_desde_jwt;
