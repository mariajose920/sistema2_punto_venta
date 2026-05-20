"use client";

import { useEffect, useState } from "react";

export default function PWAInstaller() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((registration) => {
          registration.addEventListener("updatefound", () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener("statechange", () => {
                if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                  if (typeof window !== "undefined" && "Notification" in window) {
                    Notification.requestPermission().then((permission) => {
                      if (permission === "granted") {
                        new Notification("POSMASTER actualizado", {
                          body: "Una nueva versión está disponible. Recarga la página.",
                        });
                      }
                    });
                  }
                }
              });
            }
          });
        })
        .catch(() => {});
    }

    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    window.addEventListener("beforeinstallprompt", handler);

    window.addEventListener("appinstalled", () => {
      setIsInstallable(false);
      setIsInstalled(true);
      setDeferredPrompt(null);
    });

    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
    }

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setIsInstallable(false);
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
  };

  if (isInstalled || !isInstallable) return null;

  return (
    <div className="fixed bottom-24 left-4 right-4 z-[999] md:left-auto md:right-6 md:w-96 animate-in slide-in-from-bottom-4 duration-500">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-3">
        <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white font-black shrink-0">
          P
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-gray-900 dark:text-white truncate">
            Instala POSMASTER
          </p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 font-medium">
            Acceso rápido desde tu pantalla de inicio
          </p>
        </div>
        <button
          onClick={handleInstall}
          className="shrink-0 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black rounded-xl uppercase tracking-wider transition-all active:scale-95"
        >
          Instalar
        </button>
        <button
          onClick={() => setIsInstallable(false)}
          className="shrink-0 p-2 text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Cerrar"
        >
          ✕
        </button>
      </div>
    </div>
  );
}