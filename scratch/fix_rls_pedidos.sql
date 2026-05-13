-- ============================================================
-- FIX: Políticas RLS para Pedido y DetallePedido
-- CAUSA: "TO public" en PostgreSQL/Supabase NO incluye al rol
-- "anon" (usuarios no autenticados). Debe ser TO anon, authenticated
-- para permitir inserts desde el catálogo público.
-- Ejecutar en Supabase → SQL Editor
-- ============================================================

-- 1. Eliminar políticas de INSERT anteriores con TO public
DROP POLICY IF EXISTS "Permitir insertar Pedido a anon y auth" ON public."Pedido";
DROP POLICY IF EXISTS "Permitir insertar DetallePedido a anon y auth" ON public."DetallePedido";

-- 2. Recrear correctamente con TO anon, authenticated
CREATE POLICY "Permitir insertar Pedido a anon y auth"
  ON public."Pedido"
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Permitir insertar DetallePedido a anon y auth"
  ON public."DetallePedido"
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- 3. Verificar que exista la política de SELECT de Producto para anon
-- (por si no se ejecutó antes)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'Producto'
      AND policyname = 'Permitir leer Producto a todos (catalogo publico)'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "Permitir leer Producto a todos (catalogo publico)"
        ON public."Producto"
        FOR SELECT
        TO anon, authenticated
        USING (true)
    $pol$;
  END IF;
END $$;
