-- Añadir columna 'activo' a la tabla Categoria para permitir la suspensión de categorías
ALTER TABLE "Categoria" ADD COLUMN activo BOOLEAN DEFAULT true;
