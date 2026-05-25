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
  v_forma_pago_enum forma_pago_venta;
BEGIN
  SELECT * INTO v_pedido
  FROM "Pedido"
  WHERE id = p_pedido_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido no encontrado.';
  END IF;

  IF v_pedido.estado != 'pendiente' THEN
    RAISE EXCEPTION 'El pedido ya no está en estado pendiente. (Estado actual: %)', v_pedido.estado;
  END IF;

  IF p_forma_pago IS NULL OR btrim(lower(p_forma_pago)) = '' THEN
    RAISE EXCEPTION 'Debe seleccionar un método de pago válido.';
  END IF;

  v_forma_pago_enum := lower(trim(p_forma_pago))::forma_pago_venta;

  IF v_forma_pago_enum = 'fiado'::forma_pago_venta AND p_cliente_id IS NULL THEN
    RAISE EXCEPTION 'Se requiere seleccionar un cliente válido para el método de pago fiado.';
  END IF;

  SELECT COALESCE(SUM(subtotal), 0)
  INTO v_total_venta
  FROM "DetallePedido"
  WHERE pedido_id = p_pedido_id;

  IF v_total_venta = 0 THEN
    RAISE EXCEPTION 'El pedido no tiene productos o el total es 0.';
  END IF;

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
    v_forma_pago_enum,
    v_total_venta,
    ROUND(v_total_venta * 0.19),
    v_total_venta,
    'cerrada',
    'Venta generada automáticamente desde pedido web: ' || p_pedido_id
  ) RETURNING id_venta INTO v_venta_id;

  FOR v_detalle IN
    SELECT *
    FROM "DetallePedido"
    WHERE pedido_id = p_pedido_id
  LOOP
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

    UPDATE "Producto"
    SET stock_actual = stock_actual - v_detalle.cantidad
    WHERE id = v_detalle.producto_id;
  END LOOP;

  IF v_forma_pago_enum = 'fiado'::forma_pago_venta THEN
    SELECT * INTO v_cliente
    FROM "Cliente"
    WHERE id = p_cliente_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Cliente seleccionado para fiado no existe.';
    END IF;

    UPDATE "Cliente"
    SET saldo_deudado = COALESCE(saldo_deudado, 0) + v_total_venta
    WHERE id = p_cliente_id;

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

  UPDATE "Pedido"
  SET estado = 'entregado'
  WHERE id = p_pedido_id;

  v_resultado := jsonb_build_object(
    'success', true,
    'venta_id', v_venta_id,
    'total', v_total_venta,
    'mensaje', 'Entrega procesada y venta generada exitosamente.'
  );

  RETURN v_resultado;

EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$$;
