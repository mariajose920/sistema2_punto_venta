-- SQL para asegurar que la tabla Usuario tenga todas las columnas necesarias
-- Ejecuta esto en el SQL Editor de Supabase si tienes errores de columnas faltantes.

DO $$ 
BEGIN 
    -- 1. Asegurar columna 'nombre'
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Usuario' AND column_name = 'nombre') THEN
        ALTER TABLE "Usuario" ADD COLUMN nombre TEXT;
    END IF;

    -- 2. Asegurar columna 'apellido'
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Usuario' AND column_name = 'apellido') THEN
        ALTER TABLE "Usuario" ADD COLUMN apellido TEXT;
    END IF;

    -- 3. Asegurar columna 'activo'
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Usuario' AND column_name = 'activo') THEN
        ALTER TABLE "Usuario" ADD COLUMN activo BOOLEAN DEFAULT true;
    END IF;

    -- 4. Asegurar columna 'rol' (por si acaso no existe o necesita el check)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Usuario' AND column_name = 'rol') THEN
        ALTER TABLE "Usuario" ADD COLUMN rol TEXT DEFAULT 'cajera';
    END IF;
END $$;

-- Actualizar usuarios existentes que tengan 'activo' como NULL
UPDATE "Usuario" SET activo = true WHERE activo IS NULL;
UPDATE "Usuario" SET nombre = '' WHERE nombre IS NULL;
UPDATE "Usuario" SET apellido = '' WHERE apellido IS NULL;
