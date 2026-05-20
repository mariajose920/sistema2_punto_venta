"use client";

import { useEffect } from "react";

export default function PWAInstaller() {
  useEffect(() => {
    // Registrar service worker
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((registration) => {
          console.log("✅ Service Worker registrado:", registration);
          
          // Escuchar actualizaciones
          registration.addEventListener("updatefound", () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener("statechange", () => {
                if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                  // Nueva versión disponible
                  console.log("🔄 Actualización disponible");
                  
                  // Mostrar notificación (opcional)
                  if (typeof window !== "undefined" && "Notification" in window) {
                    Notification.requestPermission().then((permission) => {
                      if (permission === "granted") {
                        new Notification("POSMASTER actualizado", {
                          body: "Una nueva versión está disponible. Recarga la página.",
                          icon: "/manifest.json",
                        });
                      }
                    });
                  }
                }
              });
            }
          });
        })
        .catch((error) => {
          console.warn("❌ Error registrando Service Worker:", error);
        });
    }

    // Permitir instalación como PWA en Android
    if ("onbeforeinstallprompt" in window) {
      let deferredPrompt: any;
      
      window.addEventListener("beforeinstallprompt", (e: any) => {
        e.preventDefault();
        deferredPrompt = e;
        console.log("📱 PWA puede ser instalada");
      });
    }
  }, []);

  return null;
}
