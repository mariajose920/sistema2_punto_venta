export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      Usuario: {
        Row: {
          id: string
          email: string
          nombre: string | null
          apellido: string | null
          rut_dni: string | null
          rol: 'admin' | 'cajera' | 'proveedor'
          activo: boolean
          created_at: string
        }
        Insert: {
          id: string
          email: string
          nombre?: string | null
          apellido?: string | null
          rut_dni?: string | null
          rol: 'admin' | 'cajera' | 'proveedor'
          activo?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          email?: string
          nombre?: string | null
          apellido?: string | null
          rut_dni?: string | null
          rol?: 'admin' | 'cajera' | 'proveedor'
          activo?: boolean
          created_at?: string
        }
      }
      Producto: {
        Row: {
          id: string
          codigo_barra: string | null
          nombre: string
          categoria: string
          precio_compra: number
          precio_venta_publico: number
          precio_venta_promocion: number | null
          stock_actual: number
          stock_minimo: number
          id_proveedor: string | null
          fuente_datos: 'manual' | 'api' | 'interno'
          created_at: string
        }
        Insert: {
          id?: string
          codigo_barra?: string | null
          nombre: string
          categoria: string
          precio_compra: number
          precio_venta_publico: number
          precio_venta_promocion?: number | null
          stock_actual: number
          stock_minimo?: number
          id_proveedor?: string | null
          fuente_datos?: 'manual' | 'api' | 'interno'
          created_at?: string
        }
        Update: {
          id?: string
          codigo_barra?: string | null
          nombre?: string
          categoria?: string
          precio_compra?: number
          precio_venta_publico?: number
          precio_venta_promocion?: number | null
          stock_actual?: number
          stock_minimo?: number
          id_proveedor?: string | null
          fuente_datos?: 'manual' | 'api' | 'interno'
          created_at?: string
        }
      }
      Cliente: {
        Row: {
          id: string
          nombre: string
          telefono: string
          saldo_deudado: number
          saldo_favor: number
          rut: string
          created_at: string
        }
        Insert: {
          id?: string
          nombre: string
          telefono?: string
          saldo_deudado?: number
          saldo_favor?: number
          rut: string
          created_at?: string
        }
        Update: {
          id?: string
          nombre?: string
          telefono?: string
          saldo_deudado?: number
          saldo_favor?: number
          rut?: string
          created_at?: string
        }
      }
      Venta: {
        Row: {
          id_venta: string
          fecha_venta: string
          id_usuario_cajera: string
          id_cliente: string | null
          forma_pago: 'efectivo' | 'tarjeta' | 'transferencia' | 'fiado'
          total_venta: number
          iva: number
          estado: 'abierta' | 'cerrada' | 'anulada'
          observacion: string | null
          recargo: number | null
          subtotal: number | null
        }
        Insert: {
          id_venta?: string
          fecha_venta?: string
          id_usuario_cajera: string
          id_cliente?: string | null
          forma_pago: 'efectivo' | 'tarjeta' | 'transferencia' | 'fiado'
          total_venta: number
          iva?: number
          estado?: 'abierta' | 'cerrada' | 'anulada'
          observacion?: string | null
          recargo?: number | null
          subtotal?: number | null
        }
        Update: {
          id_venta?: string
          fecha_venta?: string
          id_usuario_cajera?: string
          id_cliente?: string | null
          forma_pago?: 'efectivo' | 'tarjeta' | 'transferencia' | 'fiado'
          total_venta?: number
          iva?: number
          estado?: 'abierta' | 'cerrada' | 'anulada'
          observacion?: string | null
          recargo?: number | null
          subtotal?: number | null
        }
      }
      DetalleVenta: {
        Row: {
          id_detalle_venta: string
          id_venta: string
          id_producto: string | null
          cantidad: number
          precio_unitario_venta: number
          descuento_aplicado: number
          subtotal: number
        }
        Insert: {
          id_detalle_venta?: string
          id_venta: string
          id_producto?: string | null
          cantidad: number
          precio_unitario_venta: number
          descuento_aplicado?: number
          subtotal: number
        }
        Update: {
          id_detalle_venta?: string
          id_venta?: string
          id_producto?: string | null
          cantidad?: number
          precio_unitario_venta?: number
          descuento_aplicado?: number
          subtotal?: number
        }
      }
      Proveedor: {
        Row: {
          id_proveedor: string
          nombre_empresa: string
          rut_empresa: string
          telefono_: string
          correo_: string
          direccion: string
          created_at: string
        }
        Insert: {
          id_proveedor: string
          nombre_empresa: string
          rut_empresa?: string
          telefono_?: string
          correo_?: string
          direccion?: string
          created_at?: string
        }
        Update: {
          id_proveedor?: string
          nombre_empresa?: string
          rut_empresa?: string
          telefono_?: string
          correo_?: string
          direccion?: string
          created_at?: string
        }
      }
      Compra: {
        Row: {
          id_compra: string
          fecha_compra: string
          id_proveedor: string
          numero_factura: string | null
          forma_pago_compra: 'efectivo' | 'transferencia' | 'credito' | string
          total_compra: number
        }
        Insert: {
          id_compra?: string
          fecha_compra?: string
          id_proveedor: string
          numero_factura?: string | null
          forma_pago_compra: 'efectivo' | 'transferencia' | 'credito' | string
          total_compra: number
        }
        Update: {
          id_compra?: string
          fecha_compra?: string
          id_proveedor?: string
          numero_factura?: string | null
          forma_pago_compra?: 'efectivo' | 'transferencia' | 'credito' | string
          total_compra?: number
        }
      }
      DetalleCompra: {
        Row: {
          id_detalle_compra: string
          id_compra: string
          id_producto: string
          cantidad_comprada: number
          precio_compra_unitario: number
          fecha_vencimiento: string | null
        }
        Insert: {
          id_detalle_compra?: string
          id_compra: string
          id_producto: string
          cantidad_comprada: number
          precio_compra_unitario: number
          fecha_vencimiento?: string | null
        }
        Update: {
          id_detalle_compra?: string
          id_compra?: string
          id_producto?: string
          cantidad_comprada?: number
          precio_compra_unitario?: number
          fecha_vencimiento?: string | null
        }
      }
      Credito: {
        Row: {
          id: string
          cliente_id: string
          venta_id: string
          monto_inicial: number
          saldo_pendiente: number
          estado: 'vigente' | 'pagado'
          created_at: string
        }
        Insert: {
          id?: string
          cliente_id: string
          venta_id: string
          monto_inicial: number
          saldo_pendiente: number
          estado?: 'vigente' | 'pagado'
          created_at?: string
        }
        Update: {
          id?: string
          cliente_id?: string
          venta_id?: string
          monto_inicial?: number
          saldo_pendiente?: number
          estado?: 'vigente' | 'pagado' | string
          created_at?: string
        }
      }
      Pago: {
        Row: {
          id: string
          cliente_id: string
          monto: number
          metodo_pago: string
          created_at: string
        }
        Insert: {
          id?: string
          cliente_id: string
          monto: number
          metodo_pago?: string
          created_at?: string
        }
        Update: {
          id?: string
          cliente_id?: string
          monto?: number
          metodo_pago?: string
          created_at?: string
        }
      }
      Promocion: {
        Row: {
          id: string
          nombre: string
          tipo: 'porcentaje' | 'fijo' | '2x1'
          valor: number
          fecha_inicio: string
          fecha_fin: string
          activa: boolean
        }
        Insert: {
          id?: string
          nombre: string
          tipo: 'porcentaje' | 'fijo' | '2x1'
          valor: number
          fecha_inicio: string
          fecha_fin: string
          activa?: boolean
        }
        Update: {
          id?: string
          nombre?: string
          tipo?: 'porcentaje' | 'fijo' | '2x1' | string
          valor?: number
          fecha_inicio?: string
          fecha_fin?: string
          activa?: boolean
        }
      }
      Pedido: {
        Row: {
          id: string
          nombre_cliente: string
          rut_cliente: string
          telefono_cliente: string
          estado: 'pendiente' | 'entregado' | 'cancelado'
          created_at: string
        }
        Insert: {
          id?: string
          nombre_cliente: string
          rut_cliente: string
          telefono_cliente: string
          estado?: 'pendiente' | 'entregado' | 'cancelado'
          created_at?: string
        }
        Update: {
          id?: string
          nombre_cliente?: string
          rut_cliente?: string
          telefono_cliente?: string
          estado?: 'pendiente' | 'entregado' | 'cancelado'
          created_at?: string
        }
      }
      DetallePedido: {
        Row: {
          id: string
          pedido_id: string
          producto_id: string
          cantidad: number
          precio_unitario: number
          subtotal: number
        }
        Insert: {
          id?: string
          pedido_id: string
          producto_id: string
          cantidad: number
          precio_unitario: number
          subtotal: number
        }
        Update: {
          id?: string
          pedido_id?: string
          producto_id?: string
          cantidad?: number
          precio_unitario?: number
          subtotal?: number
        }
      }
      Categoria: {
        Row: {
          id: string
          nombre: string
        }
        Insert: {
          id?: string
          nombre: string
        }
        Update: {
          id?: string
          nombre?: string
        }
      }
    }
  }
}
