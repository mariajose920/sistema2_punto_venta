-- ============================================================
-- FIX DEFINITIVO: Permisos de Producto y Storage
-- Propósito: Eliminar cualquier restricción RLS que impida el guardado.
-- Ejecutar en Supabase → SQL Editor
-- ============================================================

-- 1. Asegurar que la tabla Producto permita INSERT a usuarios autenticados
ALTER TABLE public."Producto" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir todo a autenticados en Producto" ON public."Producto";
CREATE POLICY "Permitir todo a autenticados en Producto"
ON public."Producto"
FOR ALL 
TO authenticated
USING (true)
WITH CHECK (true);

-- 2. Asegurar que la tabla Producto sea legible por todos (para el catálogo)
DROP POLICY IF EXISTS "Lectura publica Producto" ON public."Producto";
CREATE POLICY "Lectura publica Producto"
ON public."Producto"
FOR SELECT
TO public
USING (true);

-- 3. Asegurar permisos en Storage para el bucket 'productos'
-- Si el bucket no tiene RLS, estas políticas lo habilitarán correctamente.

DROP POLICY IF EXISTS "Storage INSERT para autenticados" ON storage.objects;
CREATE POLICY "Storage INSERT para autenticados"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'productos');

DROP POLICY IF EXISTS "Storage SELECT publico" ON storage.objects;
CREATE POLICY "Storage SELECT publico"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'productos');

DROP POLICY IF EXISTS "Storage UPDATE para autenticados" ON storage.objects;
CREATE POLICY "Storage UPDATE para autenticados"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'productos')
WITH CHECK (bucket_id = 'productos');

DROP POLICY IF EXISTS "Storage DELETE para autenticados" ON storage.objects;
CREATE POLICY "Storage DELETE para autenticados"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'productos');
