# 📋 RESUMEN DE CAMBIOS: Números Enteros SOLAMENTE (Sin Decimales)

## 🎯 Objetivo Logrado
Todos los campos monetarios (montos, precios, totales, saldos, descuentos, recargos, pagos) ahora:
- ✅ Aceptan SOLO números enteros en el frontend (sin decimales)
- ✅ Se normalizan a enteros ANTES de guardar en Supabase
- ✅ Se validan en la base de datos con tipos BIGINT + restricciones CHECK
- ✅ Nunca mostrarán decimales (.00) en la UI

---

## 📝 ARCHIVOS MODIFICADOS

### 1️⃣ `lib/utils.ts` 
**Cambios:**
- ✅ Agregada función `normalizeAmount(amount)` 
  - Redondea a entero con `Math.round()`
  - Garantiza valor ≥ 0
  - Retorna 0 si es null/undefined

**Línea clave:**
```typescript
export function normalizeAmount(amount: number | null | undefined): number {
  const val = Number(amount || 0);
  const rounded = Math.round(val);
  return Math.max(0, rounded);
}
```

---

### 2️⃣ `app/(dashboard)/productos/ProductosClient.tsx`
**Cambios:**
- ✅ Importada `normalizeAmount` de utils
- ✅ Inputs de PRECIO Y STOCK ahora usan:
  - `type="number"` 
  - `step="1"` (solo enteros)
  - `min="0"` (no negativos)
- ✅ onChange trunca decimales con `Math.floor()` antes de guardar en state
- ✅ Antes de guardar en Supabase: todos los montos pasan por `normalizeAmount()`

**Campos actualizados:**
- `precio_venta_publico` → normalizado antes de insertar/actualizar
- `precio_compra` → normalizado
- `stock_actual` → normalizado
- `stock_minimo` → normalizado

**Ejemplo de input:**
```jsx
<input
  type="number"
  step="1"
  min="0"
  value={formData.precio_venta_publico || 0}
  onChange={e => { 
    const cleaned = Math.floor(Number(e.target.value) || 0); 
    setFormData({ ...formData, precio_venta_publico: Math.max(0, cleaned) }) 
  }}
/>
```

---

### 3️⃣ `app/(dashboard)/ventas/nueva/page.tsx`
**Cambios:**
- ✅ Importada `normalizeAmount`
- ✅ Cálculos de venta normalizados:
  - `subtotalVenta` → `Math.round()` + normalizado
  - `recargoTarjeta` (0.15%) → normalizado a entero
  - `saldoFavorAplicado` → normalizado
  - `totalFinal` → normalizado
- ✅ En CALCULADORA:
  - Inputs usan `step="1"` y `min="0"`
  - Cantidad y precio se truncan con `Math.floor()`
  - Total se normaliza antes de agregar al carrito
- ✅ Al guardar VENTA en Supabase:
  - `subtotal`, `recargo`, `total_venta`, `iva` todos normalizados
  - Cada detalle de venta normalizado
  - Cantidades en `updateQuantity()` normalizadas
  - Crédito creado con montos normalizados
- ✅ Saldos de Cliente actualizados de forma normalizada

**Ejemplo de normalización:**
```typescript
const subtotalVenta = Math.round(cart.reduce((acc, curr) => acc + curr.subtotal, 0));
const recargoTarjeta = normalizeAmount(paymentMethod === 'tarjeta' ? subtotalVenta * 0.0015 : 0);
const totalFinal = normalizeAmount(subtotalVenta + recargoTarjeta - saldoFavorAplicado);

// En payload de Venta:
const ventaPayload: any = {
  id_usuario_cajera: user.id,
  subtotal: normalizeAmount(subtotalVenta),
  recargo: normalizeAmount(recargoTarjeta),
  total_venta: normalizeAmount(totalFinal),
  iva: normalizeAmount(totalFinal * 0.19),
  ...
};
```

---

### 4️⃣ `app/(dashboard)/clientes/page.tsx`
**Cambios:**
- ✅ Importada `normalizeAmount`
- ✅ Función `compensarSaldo()` ahora normaliza entradas y salidas
- ✅ Abono normalizado antes de guardar:
  - `montoAbonoNorm = normalizeAmount(montoAbono)` → guarda en Pago
  - Aplicación de abono a deuda/favor usa valores normalizados
  - Actualización de créditos con montos normalizados
- ✅ Saldos finales de cliente normalizados antes de actualizar en BD

**Ejemplo:**
```typescript
const compensarSaldo = (deuda: number, favor: number): { deuda: number; favor: number } => {
  const d = Math.max(0, normalizeAmount(deuda || 0));
  const f = Math.max(0, normalizeAmount(favor || 0));
  if (d > 0 && f > 0) {
    if (f >= d) return { deuda: 0, favor: f - d };
    return { deuda: d - f, favor: 0 };
  }
  return { deuda: d, favor: f };
};

// Al guardar abono:
const montoAbonoNorm = normalizeAmount(montoAbono);
await supabase.from('Pago').insert([{
  cliente_id: selectedCliente.id,
  monto: montoAbonoNorm,  // ← GARANTIZADO ENTERO
  metodo_pago: metodoPago
}]);
```

---

## 🗄️ SQL: CAMBIOS EN LA BASE DE DATOS

### Archivo: `scratch/MIGRATION_INTEGERS_ONLY.sql`

**Acciones del SQL:**

1. **Para CADA tabla monetaria** (Producto, Venta, DetalleVenta, Cliente, Credito, Pago, Promocion, Compra, DetalleCompra):

   a) **Redondear datos existentes** a enteros
   ```sql
   UPDATE "Producto" 
   SET 
     precio_compra = ROUND(COALESCE(precio_compra, 0))::bigint,
     precio_venta_publico = ROUND(COALESCE(precio_venta_publico, 0))::bigint,
     ...
   ```

   b) **Cambiar tipo** de NUMERIC → BIGINT
   ```sql
   ALTER TABLE "Producto"
     ALTER COLUMN precio_compra SET DATA TYPE bigint USING ROUND(...),
     ALTER COLUMN precio_compra SET NOT NULL,
     ALTER COLUMN precio_compra SET DEFAULT 0,
     ...
   ```

   c) **Agregar restricciones CHECK** para garantizar integridad
   ```sql
   ALTER TABLE "Producto"
     ADD CONSTRAINT check_precio_compra_integer CHECK (precio_compra >= 0),
     ADD CONSTRAINT check_precio_venta_integer CHECK (precio_venta_publico >= 0),
     ...
   ```

2. **Tablas y campos afectados:**

| Tabla | Campos | Tipo Final |
|-------|--------|-----------|
| **Producto** | precio_compra, precio_venta_publico, precio_venta_promocion, stock_actual, stock_minimo | BIGINT |
| **Venta** | total_venta, iva, subtotal, recargo | BIGINT |
| **DetalleVenta** | cantidad, precio_unitario_venta, descuento_aplicado, subtotal | BIGINT |
| **Cliente** | saldo_deudado, saldo_favor | BIGINT |
| **Credito** | monto_inicial, saldo_pendiente | BIGINT |
| **Pago** | monto | BIGINT |
| **Promocion** | valor | BIGINT |
| **Compra** | total_compra | BIGINT |
| **DetalleCompra** | cantidad_comprada, precio_compra_unitario | BIGINT |

---

## ✨ VALIDACIONES FRONTEND IMPLEMENTADAS

### Inputs Monetarios/Cuantitativos:
```jsx
// ANTES (permitía decimales):
<input type="number" value={formData.precio} onChange={...} />

// DESPUÉS (solo enteros):
<input 
  type="number" 
  step="1"           // ← Solo incrementos de 1
  min="0"            // ← No negativos
  value={formData.precio}
  onChange={e => { 
    const cleaned = Math.floor(Number(e.target.value) || 0); 
    setFormData({ ...formData, precio: Math.max(0, cleaned) }) 
  }}
/>
```

### Normalizaciones en lógica:
- ✅ Todas las sumas/restas de montos → redondeadas a entero
- ✅ Todos los descuentos y recargos → normalizados antes de guardar
- ✅ Todos los cálculos de saldos → garantizados como enteros
- ✅ **ANTES de cualquier INSERT/UPDATE en Supabase** → `normalizeAmount()`

---

## 🚀 CÓMO EJECUTAR

### 1. Backend (Base de Datos)
```bash
# En Supabase SQL Editor, ejecutar:
# scratch/MIGRATION_INTEGERS_ONLY.sql
# (Copiar y pegar TODO el contenido, luego RUN)
```

### 2. Frontend (Ya está listo)
- Los archivos TypeScript ya están modificados
- Solo hacer `npm run dev` (o `npm run build`)
- Los cambios son inmediatos

---

## 🔍 VERIFICACIÓN POST-MIGRACIÓN

Después de ejecutar el SQL, verifica:

```sql
-- Revisar tipos de datos en Supabase
SELECT table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND column_name IN (
    'precio_compra', 'precio_venta_publico', 'stock_actual', 'stock_minimo',
    'total_venta', 'iva', 'subtotal', 'recargo',
    'cantidad', 'precio_unitario_venta', 'descuento_aplicado',
    'saldo_deudado', 'saldo_favor',
    'monto_inicial', 'saldo_pendiente',
    'monto', 'valor', 'total_compra',
    'cantidad_comprada', 'precio_compra_unitario'
  )
ORDER BY table_name, column_name;

-- Resultado esperado: TODOS deben mostrar "bigint"
```

---

## 📌 RESUMEN DE CAMPOS NORMALIZADOS

✅ **PRODUCTO** (5 campos)
- precio_compra
- precio_venta_publico
- precio_venta_promocion (nullable)
- stock_actual
- stock_minimo

✅ **VENTA** (4 campos)
- total_venta
- iva
- subtotal
- recargo

✅ **DETALLE VENTA** (4 campos)
- cantidad
- precio_unitario_venta
- descuento_aplicado
- subtotal

✅ **CLIENTE** (2 campos)
- saldo_deudado
- saldo_favor

✅ **CREDITO** (2 campos)
- monto_inicial
- saldo_pendiente

✅ **PAGO** (1 campo)
- monto

✅ **PROMOCION** (1 campo)
- valor

✅ **COMPRA** (1 campo)
- total_compra

✅ **DETALLECOMPRA** (2 campos)
- cantidad_comprada
- precio_compra_unitario

**TOTAL: 22 campos normalizados a ENTEROS**

---

## ⚠️ NOTAS IMPORTANTES

1. **Las fechas NO fueron cambiadas** (solo campos monetarios/cuantitativos)
2. **Los strings (nombres, descripciones) NO fueron afectados**
3. **RLS policies siguen siendo las mismas** (no interfieren)
4. **El SQL debe ejecutarse TODO JUNTO** (es una transacción única)
5. **Después del SQL, hacer refresh en la app** (limpiar caché si es necesario)
6. **La función `normalizeAmount()` es idempotente** (safe llamarla múltiples veces)

---

**Estado:** ✅ LISTO PARA PRODUCCIÓN
**Última actualización:** 26 de mayo de 2026
