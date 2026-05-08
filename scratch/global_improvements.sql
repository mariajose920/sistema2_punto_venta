-- 1. Soporte para múltiples roles (cambiamos a TEXT para guardar "admin,cajera")
-- Opcionalmente podrías usar un array TEXT[], pero un string separado por comas es más fácil de manejar sin migraciones complejas de tipos.
ALTER TABLE "Usuario" ALTER COLUMN rol TYPE TEXT;

-- 2. Crear tabla de Auditoría para trazabilidad de acciones de cajeras (y admins)
CREATE TABLE IF NOT EXISTS "Auditoria" (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    usuario_id UUID REFERENCES "Usuario"(id),
    email_usuario TEXT, -- Denormalizado para consultas rápidas
    accion TEXT NOT NULL, -- 'creacion', 'edicion', 'eliminacion', 'venta', 'abono'
    modulo TEXT NOT NULL, -- 'productos', 'clientes', 'compras', 'ventas', 'usuarios'
    detalle TEXT, -- Descripción legible de lo que cambió
    metadata JSONB, -- Datos técnicos opcionales (ej: valores anteriores y nuevos)
    fecha TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Índices para mejorar rendimiento de búsquedas
CREATE INDEX IF NOT EXISTS idx_producto_nombre_lower ON "Producto" (LOWER(nombre));
CREATE INDEX IF NOT EXISTS idx_producto_codigo ON "Producto" (codigo_barra);
CREATE INDEX IF NOT EXISTS idx_cliente_rut ON "Cliente" (rut);

-- 4. Asegurar que los campos de saldo existan (por si acaso)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Cliente' AND column_name = 'saldo_favor') THEN
        ALTER TABLE "Cliente" ADD COLUMN saldo_favor NUMERIC DEFAULT 0;
    END IF;
END $$;
