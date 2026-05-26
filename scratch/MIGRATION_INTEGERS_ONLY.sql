-- ========================================================================
-- MIGRATION: Convertir todos los campos monetarios a ENTEROS SOLAMENTE
-- Proyecto: Sistema 2 Punto de Venta
-- ========================================================================
-- Esta migración:
-- 1. Redondea todos los datos existentes a enteros
-- 2. Cambia tipos de campo de NUMERIC a BIGINT
-- 3. Agrega restricciones CHECK para garantizar integridad
-- 4. Aplica a todos los campos de monto, precio, stock, etc.
-- ========================================================================

-- START TRANSACTION (ejecutar todo junto)
BEGIN;

-- ========================================================================
-- 1. TABLA PRODUCTO
-- ========================================================================

-- 1A. Actualizar datos existentes a enteros
UPDATE "Producto" 
SET 
  precio_compra = ROUND(COALESCE(precio_compra, 0))::bigint,
  precio_venta_publico = ROUND(COALESCE(precio_venta_publico, 0))::bigint,
  precio_venta_promocion = CASE 
    WHEN precio_venta_promocion IS NOT NULL THEN ROUND(precio_venta_promocion)::bigint 
    ELSE NULL 
  END,
  stock_actual = ROUND(COALESCE(stock_actual, 0))::bigint,
  stock_minimo = ROUND(COALESCE(stock_minimo, 0))::bigint
WHERE 
  precio_compra != ROUND(precio_compra) OR
  precio_venta_publico != ROUND(precio_venta_publico) OR
  (precio_venta_promocion IS NOT NULL AND precio_venta_promocion != ROUND(precio_venta_promocion)) OR
  stock_actual != ROUND(stock_actual) OR
  stock_minimo != ROUND(stock_minimo);

-- 1B. Cambiar tipos de NUMERIC a BIGINT (con NOT NULL donde aplique)
ALTER TABLE "Producto"
  ALTER COLUMN precio_compra SET DATA TYPE bigint USING ROUND(COALESCE(precio_compra, 0))::bigint,
  ALTER COLUMN precio_compra SET NOT NULL,
  ALTER COLUMN precio_compra SET DEFAULT 0,
  ALTER COLUMN precio_venta_publico SET DATA TYPE bigint USING ROUND(COALESCE(precio_venta_publico, 0))::bigint,
  ALTER COLUMN precio_venta_publico SET NOT NULL,
  ALTER COLUMN precio_venta_publico SET DEFAULT 0,
  ALTER COLUMN precio_venta_promocion SET DATA TYPE bigint USING CASE WHEN precio_venta_promocion IS NOT NULL THEN ROUND(precio_venta_promocion)::bigint ELSE NULL END,
  ALTER COLUMN stock_actual SET DATA TYPE bigint USING ROUND(COALESCE(stock_actual, 0))::bigint,
  ALTER COLUMN stock_actual SET NOT NULL,
  ALTER COLUMN stock_actual SET DEFAULT 0,
  ALTER COLUMN stock_minimo SET DATA TYPE bigint USING ROUND(COALESCE(stock_minimo, 0))::bigint,
  ALTER COLUMN stock_minimo SET NOT NULL,
  ALTER COLUMN stock_minimo SET DEFAULT 5;

-- 1C. Agregar restricciones CHECK
ALTER TABLE "Producto"
  ADD CONSTRAINT check_precio_compra_integer CHECK (precio_compra >= 0),
  ADD CONSTRAINT check_precio_venta_integer CHECK (precio_venta_publico >= 0),
  ADD CONSTRAINT check_precio_promocion_integer CHECK (precio_venta_promocion IS NULL OR precio_venta_promocion >= 0),
  ADD CONSTRAINT check_stock_actual_integer CHECK (stock_actual >= 0),
  ADD CONSTRAINT check_stock_minimo_integer CHECK (stock_minimo >= 0);

-- ========================================================================
-- 2. TABLA VENTA
-- ========================================================================

-- 2A. Actualizar datos existentes a enteros
UPDATE "Venta" 
SET 
  total_venta = ROUND(COALESCE(total_venta, 0))::bigint,
  iva = ROUND(COALESCE(iva, 0))::bigint,
  subtotal = ROUND(COALESCE(subtotal, 0))::bigint,
  recargo = CASE 
    WHEN recargo IS NOT NULL THEN ROUND(recargo)::bigint 
    ELSE NULL 
  END
WHERE 
  total_venta != ROUND(total_venta) OR
  iva != ROUND(iva) OR
  (subtotal IS NOT NULL AND subtotal != ROUND(subtotal)) OR
  (recargo IS NOT NULL AND recargo != ROUND(recargo));

-- 2B. Cambiar tipos de NUMERIC a BIGINT
ALTER TABLE "Venta"
  ALTER COLUMN total_venta SET DATA TYPE bigint USING ROUND(COALESCE(total_venta, 0))::bigint,
  ALTER COLUMN total_venta SET NOT NULL,
  ALTER COLUMN total_venta SET DEFAULT 0,
  ALTER COLUMN iva SET DATA TYPE bigint USING ROUND(COALESCE(iva, 0))::bigint,
  ALTER COLUMN iva SET DEFAULT 0,
  ALTER COLUMN subtotal SET DATA TYPE bigint USING ROUND(COALESCE(subtotal, 0))::bigint,
  ALTER COLUMN subtotal SET DEFAULT 0,
  ALTER COLUMN recargo SET DATA TYPE bigint USING CASE WHEN recargo IS NOT NULL THEN ROUND(recargo)::bigint ELSE NULL END;

-- 2C. Agregar restricciones CHECK
ALTER TABLE "Venta"
  ADD CONSTRAINT check_total_venta_integer CHECK (total_venta >= 0),
  ADD CONSTRAINT check_iva_integer CHECK (iva >= 0),
  ADD CONSTRAINT check_subtotal_integer CHECK (subtotal >= 0),
  ADD CONSTRAINT check_recargo_integer CHECK (recargo IS NULL OR recargo >= 0);

-- ========================================================================
-- 3. TABLA DETALLEVENTA
-- ========================================================================

-- 3A. Actualizar datos existentes a enteros
UPDATE "DetalleVenta" 
SET 
  cantidad = ROUND(COALESCE(cantidad, 1))::bigint,
  precio_unitario_venta = ROUND(COALESCE(precio_unitario_venta, 0))::bigint,
  descuento_aplicado = ROUND(COALESCE(descuento_aplicado, 0))::bigint,
  subtotal = ROUND(COALESCE(subtotal, 0))::bigint
WHERE 
  cantidad != ROUND(cantidad) OR
  precio_unitario_venta != ROUND(precio_unitario_venta) OR
  descuento_aplicado != ROUND(descuento_aplicado) OR
  subtotal != ROUND(subtotal);

-- 3B. Cambiar tipos de NUMERIC a BIGINT
ALTER TABLE "DetalleVenta"
  ALTER COLUMN cantidad SET DATA TYPE bigint USING ROUND(COALESCE(cantidad, 1))::bigint,
  ALTER COLUMN cantidad SET NOT NULL,
  ALTER COLUMN cantidad SET DEFAULT 1,
  ALTER COLUMN precio_unitario_venta SET DATA TYPE bigint USING ROUND(COALESCE(precio_unitario_venta, 0))::bigint,
  ALTER COLUMN precio_unitario_venta SET NOT NULL,
  ALTER COLUMN precio_unitario_venta SET DEFAULT 0,
  ALTER COLUMN descuento_aplicado SET DATA TYPE bigint USING ROUND(COALESCE(descuento_aplicado, 0))::bigint,
  ALTER COLUMN descuento_aplicado SET NOT NULL,
  ALTER COLUMN descuento_aplicado SET DEFAULT 0,
  ALTER COLUMN subtotal SET DATA TYPE bigint USING ROUND(COALESCE(subtotal, 0))::bigint,
  ALTER COLUMN subtotal SET NOT NULL,
  ALTER COLUMN subtotal SET DEFAULT 0;

-- 3C. Agregar restricciones CHECK
ALTER TABLE "DetalleVenta"
  ADD CONSTRAINT check_cantidad_integer CHECK (cantidad >= 1),
  ADD CONSTRAINT check_precio_unitario_venta_integer CHECK (precio_unitario_venta >= 0),
  ADD CONSTRAINT check_descuento_aplicado_integer CHECK (descuento_aplicado >= 0),
  ADD CONSTRAINT check_subtotal_detalle_integer CHECK (subtotal >= 0);

-- ========================================================================
-- 4. TABLA CLIENTE
-- ========================================================================

-- 4A. Actualizar datos existentes a enteros
UPDATE "Cliente" 
SET 
  saldo_deudado = ROUND(COALESCE(saldo_deudado, 0))::bigint,
  saldo_favor = ROUND(COALESCE(saldo_favor, 0))::bigint
WHERE 
  saldo_deudado != ROUND(saldo_deudado) OR
  saldo_favor != ROUND(saldo_favor);

-- 4B. Cambiar tipos de NUMERIC a BIGINT
ALTER TABLE "Cliente"
  ALTER COLUMN saldo_deudado SET DATA TYPE bigint USING ROUND(COALESCE(saldo_deudado, 0))::bigint,
  ALTER COLUMN saldo_deudado SET NOT NULL,
  ALTER COLUMN saldo_deudado SET DEFAULT 0,
  ALTER COLUMN saldo_favor SET DATA TYPE bigint USING ROUND(COALESCE(saldo_favor, 0))::bigint,
  ALTER COLUMN saldo_favor SET NOT NULL,
  ALTER COLUMN saldo_favor SET DEFAULT 0;

-- 4C. Agregar restricciones CHECK
ALTER TABLE "Cliente"
  ADD CONSTRAINT check_saldo_deudado_integer CHECK (saldo_deudado >= 0),
  ADD CONSTRAINT check_saldo_favor_integer CHECK (saldo_favor >= 0);

-- ========================================================================
-- 5. TABLA CREDITO
-- ========================================================================

-- 5A. Actualizar datos existentes a enteros
UPDATE "Credito" 
SET 
  monto_inicial = ROUND(COALESCE(monto_inicial, 0))::bigint,
  saldo_pendiente = ROUND(COALESCE(saldo_pendiente, 0))::bigint
WHERE 
  monto_inicial != ROUND(monto_inicial) OR
  saldo_pendiente != ROUND(saldo_pendiente);

-- 5B. Cambiar tipos de NUMERIC a BIGINT
ALTER TABLE "Credito"
  ALTER COLUMN monto_inicial SET DATA TYPE bigint USING ROUND(COALESCE(monto_inicial, 0))::bigint,
  ALTER COLUMN monto_inicial SET NOT NULL,
  ALTER COLUMN monto_inicial SET DEFAULT 0,
  ALTER COLUMN saldo_pendiente SET DATA TYPE bigint USING ROUND(COALESCE(saldo_pendiente, 0))::bigint,
  ALTER COLUMN saldo_pendiente SET NOT NULL,
  ALTER COLUMN saldo_pendiente SET DEFAULT 0;

-- 5C. Agregar restricciones CHECK
ALTER TABLE "Credito"
  ADD CONSTRAINT check_monto_inicial_integer CHECK (monto_inicial >= 0),
  ADD CONSTRAINT check_saldo_pendiente_integer CHECK (saldo_pendiente >= 0);

-- ========================================================================
-- 6. TABLA PAGO
-- ========================================================================

-- 6A. Actualizar datos existentes a enteros
UPDATE "Pago" 
SET 
  monto = ROUND(COALESCE(monto, 0))::bigint
WHERE 
  monto != ROUND(monto);

-- 6B. Cambiar tipos de NUMERIC a BIGINT
ALTER TABLE "Pago"
  ALTER COLUMN monto SET DATA TYPE bigint USING ROUND(COALESCE(monto, 0))::bigint,
  ALTER COLUMN monto SET NOT NULL,
  ALTER COLUMN monto SET DEFAULT 0;

-- 6C. Agregar restricciones CHECK
ALTER TABLE "Pago"
  ADD CONSTRAINT check_monto_pago_integer CHECK (monto >= 0);

-- ========================================================================
-- 7. TABLA PROMOCION
-- ========================================================================

-- 7A. Actualizar datos existentes a enteros
UPDATE "Promocion" 
SET 
  valor = ROUND(COALESCE(valor, 0))::bigint
WHERE 
  valor != ROUND(valor);

-- 7B. Cambiar tipos de NUMERIC a BIGINT
ALTER TABLE "Promocion"
  ALTER COLUMN valor SET DATA TYPE bigint USING ROUND(COALESCE(valor, 0))::bigint,
  ALTER COLUMN valor SET NOT NULL,
  ALTER COLUMN valor SET DEFAULT 0;

-- 7C. Agregar restricciones CHECK
ALTER TABLE "Promocion"
  ADD CONSTRAINT check_valor_promocion_integer CHECK (valor >= 0);

-- ========================================================================
-- 8. TABLA COMPRA
-- ========================================================================

-- 8A. Actualizar datos existentes a enteros
UPDATE "Compra" 
SET 
  total_compra = ROUND(COALESCE(total_compra, 0))::bigint
WHERE 
  total_compra != ROUND(total_compra);

-- 8B. Cambiar tipos de NUMERIC a BIGINT
ALTER TABLE "Compra"
  ALTER COLUMN total_compra SET DATA TYPE bigint USING ROUND(COALESCE(total_compra, 0))::bigint,
  ALTER COLUMN total_compra SET NOT NULL,
  ALTER COLUMN total_compra SET DEFAULT 0;

-- 8C. Agregar restricciones CHECK
ALTER TABLE "Compra"
  ADD CONSTRAINT check_total_compra_integer CHECK (total_compra >= 0);

-- ========================================================================
-- 9. TABLA DETALLECOMPRA
-- ========================================================================

-- 9A. Actualizar datos existentes a enteros
UPDATE "DetalleCompra" 
SET 
  cantidad_comprada = ROUND(COALESCE(cantidad_comprada, 1))::bigint,
  precio_compra_unitario = ROUND(COALESCE(precio_compra_unitario, 0))::bigint
WHERE 
  cantidad_comprada != ROUND(cantidad_comprada) OR
  precio_compra_unitario != ROUND(precio_compra_unitario);

-- 9B. Cambiar tipos de NUMERIC a BIGINT
ALTER TABLE "DetalleCompra"
  ALTER COLUMN cantidad_comprada SET DATA TYPE bigint USING ROUND(COALESCE(cantidad_comprada, 1))::bigint,
  ALTER COLUMN cantidad_comprada SET NOT NULL,
  ALTER COLUMN cantidad_comprada SET DEFAULT 1,
  ALTER COLUMN precio_compra_unitario SET DATA TYPE bigint USING ROUND(COALESCE(precio_compra_unitario, 0))::bigint,
  ALTER COLUMN precio_compra_unitario SET NOT NULL,
  ALTER COLUMN precio_compra_unitario SET DEFAULT 0;

-- 9C. Agregar restricciones CHECK
ALTER TABLE "DetalleCompra"
  ADD CONSTRAINT check_cantidad_comprada_integer CHECK (cantidad_comprada >= 1),
  ADD CONSTRAINT check_precio_compra_unitario_integer CHECK (precio_compra_unitario >= 0);

-- ========================================================================
-- COMMIT - Finalizar la transacción
-- ========================================================================
COMMIT;

-- ========================================================================
-- VERIFICACIÓN (ejecutar después de confirmar)
-- ========================================================================
-- SELECT table_name, column_name, data_type 
-- FROM information_schema.columns 
-- WHERE table_schema = 'public' 
--   AND column_name IN (
--     'precio_compra', 'precio_venta_publico', 'stock_actual', 'stock_minimo',
--     'total_venta', 'iva', 'subtotal', 'recargo',
--     'cantidad', 'precio_unitario_venta', 'descuento_aplicado',
--     'saldo_deudado', 'saldo_favor',
--     'monto_inicial', 'saldo_pendiente',
--     'monto',
--     'valor',
--     'total_compra',
--     'cantidad_comprada', 'precio_compra_unitario'
--   )
-- ORDER BY table_name, column_name;
