-- Agregar columna imagen_url a la tabla Producto
ALTER TABLE "public"."Producto" ADD COLUMN IF NOT EXISTS "imagen_url" TEXT;

-- Nota: Asegurarse de crear el bucket 'productos' en Supabase Storage
-- con las políticas (RLS) necesarias para permitir lectura pública y subida 
-- para usuarios autenticados (admin/cajera).
