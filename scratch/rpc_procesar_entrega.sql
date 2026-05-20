CREATE OR REPLACE FUNCTION procesar_entrega_pedido(
  p_pedido_id UUID,
  p_usuario_id UUID,
  p_forma_pago TEXT,
  p_cliente_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pedido RECORD;
  v_detalle RECORD;
  v_total_venta NUMERIC := 0;
  v_venta_id UUID;
  v_cliente RECORD;
  v_resultado JSONB;
BEGIN
  -- 1. Verificar si el pedido existe y obtener sus datos con bloqueo (FOR UPDATE) para evitar concurrencia
  SELECT * INTO v_pedido FROM "Pedido" WHERE id = p_pedido_id FOR UPDATE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido no encontrado.';
  END IF;
  
  IF v_pedido.estado != 'pendiente' THEN
    RAISE EXCEPTION 'El pedido ya no está en estado pendiente. (Estado actual: %)', v_pedido.estado;
  END IF;

  -- 2. Validar Fiado y Cliente
  IF p_forma_pago = 'fiado' AND p_cliente_id IS NULL THEN
    RAISE EXCEPTION 'Se requiere seleccionar un cliente válido para el método de pago fiado.';
  END IF;

  -- 3. Calcular el total de la venta sumando los subtotales de los detalles del pedido
  SELECT COALESCE(SUM(subtotal), 0) INTO v_total_venta FROM "DetallePedido" WHERE pedido_id = p_pedido_id;

  IF v_total_venta = 0 THEN
    RAISE EXCEPTION 'El pedido no tiene productos o el total es 0.';
  END IF;

  -- 4. Crear la Venta
  -- Se asume que el enum/dominio de "Venta"."forma_pago" acepta el valor de p_forma_pago
  INSERT INTO "Venta" (
    id_usuario_cajera,
    id_cliente,
    forma_pago,
    total_venta,
    iva,
    subtotal,
    estado,
    observacion
  ) VALUES (
    p_usuario_id,
    p_cliente_id,
    p_forma_pago::text, -- Ajustar el cast si en Supabase es un tipo Enum específico (ej. p_forma_pago::"tipo_forma_pago")
    v_total_venta,
    ROUND(v_total_venta * 0.19),
    v_total_venta,
    'cerrada',
    'Venta generada automáticamente desde pedido web: ' || p_pedido_id
  ) RETURNING id_venta INTO v_venta_id;

  -- 5. Crear los Detalles de Venta y Descontar Stock
  FOR v_detalle IN SELECT * FROM "DetallePedido" WHERE pedido_id = p_pedido_id LOOP
    
    -- Insertar en DetalleVenta
    INSERT INTO "DetalleVenta" (
      id_venta,
      id_producto,
      cantidad,
      precio_unitario_venta,
      subtotal,
      descuento_aplicado
    ) VALUES (
      v_venta_id,
      v_detalle.producto_id,
      v_detalle.cantidad,
      v_detalle.precio_unitario,
      v_detalle.subtotal,
      0
    );

    -- Descontar el stock del producto
    UPDATE "Producto"
    SET stock_actual = stock_actual - v_detalle.cantidad
    WHERE id = v_detalle.producto_id;
    
    -- Opcional: Validar si el stock quedó negativo
    -- IF (SELECT stock_actual FROM "Producto" WHERE id = v_detalle.producto_id) < 0 THEN
    --   RAISE EXCEPTION 'Stock insuficiente para el producto ID %', v_detalle.producto_id;
    -- END IF;

  END LOOP;

  -- 6. Manejo específico para "fiado" (Actualizar cliente y crear crédito)
  IF p_forma_pago = 'fiado' THEN
    -- Obtener cliente con bloqueo
    SELECT * INTO v_cliente FROM "Cliente" WHERE id = p_cliente_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Cliente seleccionado para fiado no existe.';
    END IF;

    -- Actualizar saldo deudado del cliente
    UPDATE "Cliente"
    SET saldo_deudado = COALESCE(saldo_deudado, 0) + v_total_venta
    WHERE id = p_cliente_id;

    -- Registrar el Crédito asociado a la venta
    INSERT INTO "Credito" (
      cliente_id,
      venta_id,
      monto_inicial,
      saldo_pendiente,
      estado
    ) VALUES (
      p_cliente_id,
      v_venta_id,
      v_total_venta,
      v_total_venta,
      'vigente'
    );
  END IF;

  -- 7. Actualizar el estado del pedido (en lugar de eliminarlo) para mantener el historial
  UPDATE "Pedido"
  SET estado = 'entregado'
  WHERE id = p_pedido_id;

  -- 8. Retornar éxito y datos relevantes de la transacción
  v_resultado := jsonb_build_object(
    'success', true,
    'venta_id', v_venta_id,
    'total', v_total_venta,
    'mensaje', 'Entrega procesada y venta generada exitosamente.'
  );

  RETURN v_resultado;

EXCEPTION WHEN OTHERS THEN
  -- Si ocurre cualquier error, PostgreSQL hará ROLLBACK automáticamente de toda la transacción.
  -- Simplemente relanzamos la excepción para que el cliente (Next.js) reciba el error.
  RAISE;
END;
$$;
