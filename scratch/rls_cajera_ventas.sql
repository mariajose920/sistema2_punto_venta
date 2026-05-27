-- Habilitar RLS en la tabla Venta
ALTER TABLE public."Venta" ENABLE ROW LEVEL SECURITY;

-- 1. Política para Admin: Puede ver TODO el historial de ventas
DROP POLICY IF EXISTS "Admin ve todas las ventas" ON public."Venta";
CREATE POLICY "Admin ve todas las ventas"
  ON public."Venta" FOR SELECT TO authenticated
  USING (
    ((auth.jwt() -> 'user_metadata') ->> 'rol') = 'admin'
  );

-- 2. Política para Cajeras: Solo pueden ver sus propias ventas
DROP POLICY IF EXISTS "Cajera ve sus propias ventas" ON public."Venta";
CREATE POLICY "Cajera ve sus propias ventas"
  ON public."Venta" FOR SELECT TO authenticated
  USING (
    id_usuario_cajera = auth.uid() AND ((auth.jwt() -> 'user_metadata') ->> 'rol') != 'admin'
  );

-- 3. Permitir que cualquier usuario autenticado registre ventas (INSERT)
DROP POLICY IF EXISTS "Cualquiera puede registrar ventas" ON public."Venta";
CREATE POLICY "Cualquiera puede registrar ventas"
  ON public."Venta" FOR INSERT TO authenticated
  WITH CHECK (true);
