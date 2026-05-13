-- Tabla Pedido
CREATE TABLE public."Pedido" (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nombre_cliente TEXT NOT NULL,
    rut_cliente TEXT NOT NULL,
    telefono_cliente TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'entregado', 'cancelado')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Tabla DetallePedido
CREATE TABLE public."DetallePedido" (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    pedido_id UUID NOT NULL REFERENCES public."Pedido"(id) ON DELETE CASCADE,
    producto_id UUID NOT NULL REFERENCES public."Producto"(id) ON DELETE RESTRICT,
    cantidad INTEGER NOT NULL CHECK (cantidad > 0),
    precio_unitario NUMERIC NOT NULL CHECK (precio_unitario >= 0),
    subtotal NUMERIC NOT NULL CHECK (subtotal >= 0)
);

-- Habilitar RLS
ALTER TABLE public."Pedido" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."DetallePedido" ENABLE ROW LEVEL SECURITY;

-- Políticas para Pedido
-- Permitir insertar a cualquiera (anon y autenticado)
CREATE POLICY "Permitir insertar Pedido a anon y auth" ON public."Pedido"
    FOR INSERT 
    TO public
    WITH CHECK (true);

-- Permitir leer/actualizar/borrar solo a usuarios autenticados
CREATE POLICY "Permitir leer Pedido a autenticados" ON public."Pedido"
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Permitir actualizar Pedido a autenticados" ON public."Pedido"
    FOR UPDATE
    TO authenticated
    USING (true);

CREATE POLICY "Permitir borrar Pedido a autenticados" ON public."Pedido"
    FOR DELETE
    TO authenticated
    USING (true);

-- Políticas para DetallePedido
CREATE POLICY "Permitir insertar DetallePedido a anon y auth" ON public."DetallePedido"
    FOR INSERT
    TO public
    WITH CHECK (true);

CREATE POLICY "Permitir leer DetallePedido a autenticados" ON public."DetallePedido"
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Permitir actualizar DetallePedido a autenticados" ON public."DetallePedido"
    FOR UPDATE
    TO authenticated
    USING (true);

CREATE POLICY "Permitir borrar DetallePedido a autenticados" ON public."DetallePedido"
    FOR DELETE
    TO authenticated
    USING (true);

-- Política para que el catálogo lea los productos públicamente sin iniciar sesión
-- Verificamos si existe ya una para anon, si no, la creamos
CREATE POLICY "Permitir leer Producto a todos (catalogo publico)" ON public."Producto"
    FOR SELECT
    TO public
    USING (true);
