-- 1. Modificar relación en DetalleVenta para que no bloquee el borrado
ALTER TABLE public."DetalleVenta"
  DROP CONSTRAINT IF EXISTS "DetalleVenta_id_producto_fkey";

ALTER TABLE public."DetalleVenta"
  ADD CONSTRAINT "DetalleVenta_id_producto_fkey"
  FOREIGN KEY (id_producto) REFERENCES public."Producto"(id)
  ON DELETE SET NULL;

-- 2. Modificar relación en DetalleCompra para que no bloquee el borrado (si existe)
-- Nota: Si DetalleCompra.id_producto no permite NULL, usamos CASCADE para borrar el historial de compra de ese producto
ALTER TABLE public."DetalleCompra"
  DROP CONSTRAINT IF EXISTS "DetalleCompra_id_producto_fkey";

ALTER TABLE public."DetalleCompra"
  ADD CONSTRAINT "DetalleCompra_id_producto_fkey"
  FOREIGN KEY (id_producto) REFERENCES public."Producto"(id)
  ON DELETE CASCADE;

-- 3. Confirmar las políticas de borrado en Producto
-- Asegurar que los admins puedan borrar en la tabla Producto
DROP POLICY IF EXISTS "Permitir DELETE Producto a admin" ON public."Producto";
CREATE POLICY "Permitir DELETE Producto a admin"
  ON public."Producto" FOR DELETE TO authenticated
  USING (
    ((auth.jwt() -> 'user_metadata') ->> 'rol') = 'admin'
  );
