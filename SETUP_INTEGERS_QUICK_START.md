# 🚀 INSTRUCCIONES RÁPIDAS DE IMPLEMENTACIÓN

## ✅ ARCHIVOS MODIFICADOS (LISTOS PARA USAR)

```
✓ lib/utils.ts                                          (+normalizeAmount)
✓ app/(dashboard)/productos/ProductosClient.tsx         (inputs: step="1", normalización)
✓ app/(dashboard)/ventas/nueva/page.tsx                 (cálculos normalizados, calculadora)
✓ app/(dashboard)/clientes/page.tsx                     (abono normalizado, compensarSaldo)
✓ scratch/MIGRATION_INTEGERS_ONLY.sql                   (SQL para Supabase)
✓ CHANGELOG_INTEGERS_ONLY.md                            (Documentación completa)
```

---

## 📋 PASOS PARA IMPLEMENTAR

### PASO 1: Ejecutar SQL en Supabase (⏱️ ~2 minutos)

1. Abre **Supabase Dashboard** → SQL Editor
2. Copia TODO el contenido de:
   ```
   scratch/MIGRATION_INTEGERS_ONLY.sql
   ```
3. Pega en el editor SQL
4. Haz click en **RUN** (verde)
5. Espera a que se completen todos los queries

**Resultado esperado:** "Success" sin errores

---

### PASO 2: Validar cambios en BD (Opcional pero recomendado)

Ejecuta en Supabase SQL Editor:

```sql
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
```

**Resultado esperado:** Todos los campos deben mostrar `data_type = bigint`

---

### PASO 3: Actualizar código local (⏱️ ~5 segundos)

Los archivos TypeScript ya están en tu workspace:
- ✅ `lib/utils.ts` 
- ✅ `ProductosClient.tsx`
- ✅ `ventas/nueva/page.tsx`
- ✅ `clientes/page.tsx`

**NO necesitas hacer nada especial**, solo asegúrate de que los cambios están guardados.

---

### PASO 4: Testear en desarrollo

```bash
npm run dev
```

**Casos de prueba:**

#### ✅ Test 1: Crear Producto
1. Ir a **Inventario**
2. Hacer click en **+ Nuevo Producto**
3. Intentar ingresar precio con decimales (ej: `1500.99`)
4. Debería **truncarse a 1500** automáticamente
5. Guardar → Debe guardar como `1500` (sin decimales)

#### ✅ Test 2: Nueva Venta
1. Ir a **Venta Nueva**
2. Abrir **Calculadora** (⚙️)
3. Intentar ingresar:
   - Precio: `500.75` → Debe mostrar como `500`
   - Cantidad: `2.3` → Debe mostrar como `2`
4. Total mostrado debe ser `1000` (500×2, sin decimales)
5. Completar venta → Todo debe guardarse entero

#### ✅ Test 3: Abono Cliente
1. Ir a **Cuentas por Cobrar**
2. Seleccionar cliente con deuda
3. Click en **Abono**
4. Intentar ingresar monto con decimales (ej: `5000.50`)
5. Debería tratarse como `5000` antes de guardar
6. Verificar en historial que se guardó sin decimales

---

## 🔍 VERIFICACIÓN POST-IMPLEMENTACIÓN

### En Supabase Console:
```sql
-- Revisar un registro con monto para confirmar que es entero
SELECT id, nombre, precio_compra, precio_venta_publico, stock_actual
FROM "Producto" 
LIMIT 1;

-- Resultado esperado:
-- precio_compra: 50000 (bigint, sin punto decimal)
-- precio_venta_publico: 89900 (bigint)
-- stock_actual: 150 (bigint)
```

### En la app:
- ✅ No aparecen inputs con `step="0.1"` o `step="0.001"`
- ✅ Al escribir decimales, se truncan automáticamente
- ✅ Todos los montos mostrados sin `.00` ni decimales
- ✅ Los cálculos (descuentos, recargos) resultan en enteros

---

## ⚠️ SI ALGO SALE MAL

### Problema: "Error en SQL migration"
**Solución:**
1. Revisa que copiaste TODO el archivo SQL (incluyendo BEGIN; y COMMIT;)
2. Asegúrate de que NO hay líneas de comentarios sueltas antes del BEGIN
3. Intenta ejecutar línea por línea si es necesario

### Problema: "Inputs todavía aceptan decimales"
**Solución:**
1. Limpia caché del navegador (Ctrl+Shift+Del)
2. Cierra y reabre la app
3. Verifica que los archivos TypeScript fueron guardados correctamente

### Problema: "Valores antiguos en BD tienen decimales"
**Solución:**
- El SQL incluye UPDATE para redondear valores existentes
- Si algunos quedaron con decimales, re-ejecuta el SQL (es idempotente)

---

## 📊 RESUMEN DE NORMALIZACIÓN

| Aspecto | Antes | Después |
|--------|-------|---------|
| **Inputs número** | `type="number"` sin restricción | `type="number" step="1" min="0"` |
| **Decimales ingresados** | Se guardaban como están | Se truncan a entero |
| **Cálculos (recargo, descuento)** | Podían resultar en decimales | Normalizados a entero |
| **Tipo BD** | NUMERIC | BIGINT |
| **Validación BD** | Sin restricción | CHECK constraint |
| **Display** | Podía mostrar `.00` | Nunca decimales |

---

## 🎯 CAMPOS PROTEGIDOS (22 Total)

### Producto (5)
- precio_compra ✓
- precio_venta_publico ✓
- precio_venta_promocion ✓
- stock_actual ✓
- stock_minimo ✓

### Venta (4)
- total_venta ✓
- iva ✓
- subtotal ✓
- recargo ✓

### DetalleVenta (4)
- cantidad ✓
- precio_unitario_venta ✓
- descuento_aplicado ✓
- subtotal ✓

### Cliente (2)
- saldo_deudado ✓
- saldo_favor ✓

### Crédito (2)
- monto_inicial ✓
- saldo_pendiente ✓

### Pago (1)
- monto ✓

### Promoción (1)
- valor ✓

### Compra (1)
- total_compra ✓

### DetalleCompra (2)
- cantidad_comprada ✓
- precio_compra_unitario ✓

---

## ✨ LO QUE NO CAMBIÓ

- ❌ Diseño visual (mismos estilos, colores, layouts)
- ❌ RLS policies en Supabase
- ❌ Campos de texto (nombres, descripciones)
- ❌ Fechas y timestamps
- ❌ Validaciones de duplicados
- ❌ Lógica de negocio (solo agregada normalización)

---

## 📞 RESUMEN FINAL

✅ **Frontend:** Listo (archivos ya modificados)
✅ **Backend SQL:** Listo (archivo MIGRATION_INTEGERS_ONLY.sql)
✅ **Normalización:** 22 campos protegidos
✅ **Sin cambios de diseño:** 100% compatible
✅ **Producción:** Ready to deploy

**Próximo paso:** Ejecutar el SQL en Supabase → ¡Listo!

---

*Documentación creada: 26 de mayo de 2026*
