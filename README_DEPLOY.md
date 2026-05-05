# Guía de Despliegue - Sistema de Punto de Venta 🚀

Este documento contiene los pasos exactos para preparar, subir y desplegar el proyecto en Vercel.

## 1. Instalación y Ejecución Local
Para asegurar que todo funcione en tu computadora antes de subirlo:

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar variables de entorno (Crea el archivo o copialo)
cp .env.example .env.local
# (Luego, abre .env.local en tu editor y coloca tus claves reales de Supabase)

# 3. Ejecutar servidor de desarrollo
npm run dev

# 4. Verificar compilación de producción (comprueba que no hay errores)
npm run build
```

## 2. Subir el Proyecto a GitHub
Abre tu terminal en la carpeta del proyecto (`sistema2_punto_venta`) y ejecuta estos comandos secuencialmente:

```bash
git init
git add .
git commit -m "feat: versión inicial lista para producción"
git branch -M main
# Reemplaza TU_USUARIO por tu nombre de usuario real en GitHub
git remote add origin https://github.com/TU_USUARIO/sistema2_punto_venta.git
git push -u origin main
```
*(Nota: Debes haber creado el repositorio vacío en GitHub antes de ejecutar `git remote add...`).*

## 3. Conectar y Desplegar en Vercel
1. Inicia sesión en [Vercel](https://vercel.com).
2. Haz clic en **Add New... > Project**.
3. Selecciona tu cuenta de GitHub y busca el repositorio `sistema2_punto_venta`. Haz clic en el botón **Import**.
4. En la sección "Configure Project":
   - **Framework Preset**: Vercel detectará que es "Next.js" automáticamente (déjalo así).
   - **Environment Variables**: ¡Este paso es crucial! Expande la sección y agrega las dos variables de tu Supabase:
     - Nombre: `NEXT_PUBLIC_SUPABASE_URL` | Valor: *(Tu URL de Supabase)* -> Clic en **Add**
     - Nombre: `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Valor: *(Tu Anon Key)* -> Clic en **Add**
5. Finalmente, haz clic en el botón azul **Deploy**.

## 4. Obtener la URL Pública
Una vez que el proceso de compilación (Build) termine (tardará entre 1 a 2 minutos), Vercel te mostrará una pantalla de éxito (con confeti 🎉). 

Haz clic en **Continue to Dashboard**. En la parte superior de tu panel, verás tu aplicación y el botón **Visit**. Esa es la URL pública que podrás compartir con tus clientes o usuarios (por ejemplo, `https://sistema2-punto-venta.vercel.app`).
