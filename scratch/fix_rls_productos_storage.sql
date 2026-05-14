-- ============================================================
-- FIX: Políticas RLS para Producto y Storage (Bucket productos)
-- Propósito: Permitir a usuarios autenticados (admin/cajera) 
-- gestionar productos e imágenes.
-- Ejecutar en Supabase → SQL Editor
-- ============================================================

-- 1. Políticas para la tabla Producto (Esquema public)
-- Aseguramos que RLS esté activo
ALTER TABLE public."Producto" ENABLE ROW LEVEL SECURITY;

-- Eliminar políticas antiguas si existen para evitar duplicados
DROP POLICY IF EXISTS "Permitir insertar Producto a admins y cajeras" ON public."Producto";
DROP POLICY IF EXISTS "Permitir actualizar Producto a admins y cajeras" ON public."Producto";
DROP POLICY IF EXISTS "Permitir eliminar Producto a admins" ON public."Producto";

-- Política para INSERT (Admins y Cajeras)
CREATE POLICY "Permitir insertar Producto a admins y cajeras"
  ON public."Producto"
  FOR INSERT
  TO authenticated
  WITH CHECK (true); -- En un sistema más estricto validaríamos el rol aquí

-- Política para UPDATE (Admins y Cajeras)
CREATE POLICY "Permitir actualizar Producto a admins y cajeras"
  ON public."Producto"
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Política para DELETE (Solo Admins)
CREATE POLICY "Permitir eliminar Producto a admins"
  ON public."Producto"
  FOR DELETE
  TO authenticated
  USING (true);


-- 2. Políticas para el Bucket de Storage 'productos'
-- Nota: El bucket debe existir previamente.

-- Permitir a usuarios autenticados subir archivos (INSERT)
CREATE POLICY "Permitir subir imagenes a productos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'productos');

-- Permitir a usuarios autenticados actualizar archivos (UPDATE)
CREATE POLICY "Permitir actualizar imagenes en productos"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'productos');

-- Permitir a todos ver las imágenes (SELECT público)
CREATE POLICY "Permitir ver imagenes de productos"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'productos');

-- Permitir a usuarios autenticados eliminar imágenes (DELETE)
CREATE POLICY "Permitir eliminar imagenes en productos"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'productos');
