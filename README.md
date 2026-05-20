# 🚀 POSMASTER - Sistema de Punto de Venta PWA

Sistema moderno de gestión de ventas, inventario y clientes. **Funciona como aplicación web y nativa en móvil**.

## ✨ Características Principales

- ✅ **Responsive** - Funciona perfectamente en móvil, tablet y computadora
- 📱 **Instalable como App** - PWA con soporte para instalación nativa
- 💾 **Sincronización automática** - Datos siempre actualizados
- 📊 **Gestión de inventario** - Control de stock, categorías y productos
- 👥 **Gestión de clientes** - Historial de compras y saldos
- 💰 **Punto de venta** - Sistema de ventas con múltiples formas de pago
- 📈 **Reportes** - Análisis de ventas y rentabilidad
- 🔐 **Seguridad** - Autenticación y control de roles

## 🌐 Responsividad Mejorada

### ✅ Pantallas Adaptadas
- **Historial de ventas**: Tablas en desktop → Cards en móvil
- **Lista de productos**: Grid responsive (1-4 columnas)
- **Lista de clientes**: Modo table/grid toggleable
- **Tamaños de fuente**: Aumentados automáticamente en móvil

### 🎯 Breakpoints
- `sm: 640px` - Teléfonos pequeños
- `md: 768px` - Tablets
- `lg: 1024px` - Laptops
- `xl: 1280px` - Desktops

## 📱 Instalación como App

### ¿Es gratis instalar como app?
**Sí**, es totalmente gratuito. Solo es una instalación del navegador.

### ¿Dónde están los pasos?
👉 **Lee [INSTALL_PWA.md](INSTALL_PWA.md)** para instrucciones completas por dispositivo.

### Pasos rápidos:

**iPhone/iPad:**
1. Abre en Safari
2. Toca compartir → "Añadir a pantalla de inicio"

**Android:**
1. Abre en Chrome
2. Toca el botón "Instalar" que aparece abajo

**Windows/Mac:**
1. Abre en Chrome/Edge
2. Toca el ícono "Instalar" arriba a la derecha

## 🏃 Inicio Rápido

### Desarrollo Local
```bash
npm install
npm run dev
```
Abre [http://localhost:3000](http://localhost:3000)

### Build para Producción
```bash
npm run build
npm start
```

## 📋 Requisitos

- Node.js 18+
- Navegador moderno (Chrome, Firefox, Safari, Edge)
- Conexión a internet (para sincronización)

## 🔧 Configuración PWA

La app está pre-configurada para PWA:
- ✅ `manifest.json` - Metadatos de la app
- ✅ `sw.js` - Service Worker para caché
- ✅ Iconos adaptables (maskable)
- ✅ Shortcuts para acciones rápidas
- ✅ Modo offline parcial

## 📂 Estructura del Proyecto

```
app/
├── (dashboard)/          # Rutas protegidas
│   ├── cajera/          # Módulo de ventas
│   ├── productos/       # Inventario (RESPONSIVE)
│   ├── clientes/        # Clientes (RESPONSIVE)
│   ├── ventas/
│   │   └── historial/   # Historial (RESPONSIVE)
│   └── ...
├── login/               # Autenticación
└── layout.tsx           # Layout principal
components/
├── PWAInstaller.tsx     # Botón para instalar app
├── Sidebar.tsx          # Navegación
└── ...
public/
├── manifest.json        # Configuración PWA
├── sw.js               # Service Worker
└── ...
```

## 🎨 Diseño Responsivo

### Cambios Implementados

1. **globals.css**
   - Aumentó tamaños de fuente en móvil
   - Mejor legibilidad en pantallas pequeñas
   - Optimización para touch

2. **Páginas Principales**
   - Historial de ventas: Tabla → Cards
   - Lista de productos: Grid adaptable
   - Lista de clientes: Vista dual (table/grid)

3. **Componentes**
   - Padding dinámico según pantalla
   - Iconos escalables
   - Botones con min-height de 44px (móvil)

## 🔐 Seguridad y Privacidad

- Autenticación con Supabase
- Cifrado HTTPS obligatorio
- Datos almacenados localmente (no compartidos)
- Service Worker sin acceso a datos sensibles

## 📊 Performance

- Carga inicial: < 3 segundos
- Caché automático de assets
- Sincronización en background
- Optimización de imágenes
- Compresión de datos

## 🐛 Solución de Problemas

### "No aparece el botón de instalar"
```bash
# Asegúrate de HTTPS en producción
# En desarrollo, verifica http://localhost:3000
```

### "La app no sincroniza"
- Verifica conexión a internet
- Recarga la aplicación (Ctrl+R)
- Limpia el caché del navegador

### "Las fuentes se ven pequeñas en móvil"
- El sistema se ajusta automáticamente
- Usa Ctrl++ para aumentar zoom si es necesario

## 📞 Soporte

Para preguntas sobre:
- **PWA/Instalación**: Ver [INSTALL_PWA.md](INSTALL_PWA.md)
- **Responsive Design**: Revisar [RESPONSIVE_GUIDE.md](RESPONSIVE_GUIDE.md)
- **Deploy**: Ver [README_DEPLOY.md](README_DEPLOY.md)

## 📝 Licencia

Proyecto privado. Todos los derechos reservados.

---

**¡Listo para usar en cualquier dispositivo!** 🎉

Instala ahora siguiendo los pasos en [INSTALL_PWA.md](INSTALL_PWA.md)
