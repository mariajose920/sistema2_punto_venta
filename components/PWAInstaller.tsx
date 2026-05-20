"use client";

import { useEffect, useState } from "react";

export default function PWAInstaller() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
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

    const ua = navigator.userAgent;
    if (/iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream) {
      setIsIOS(true);
    }

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) {
      setShowManualModal(true);
      return;
    }
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setIsInstallable(false);
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
  };

  if (isInstalled) return null;

  const iosSteps = [
    { num: 1, text: 'Toca el botón Compartir (⎋) en la barra de Safari' },
    { num: 2, text: 'Busca y toca "Agregar a pantalla de inicio"' },
    { num: 3, text: 'Confirma con "Agregar" en la esquina superior' },
  ];

  const androidSteps = [
    { num: 1, text: 'Toca los 3 puntos (⋮) en la esquina de Chrome' },
    { num: 2, text: 'Selecciona "Instalar aplicación" o "Agregar a pantalla de inicio"' },
    { num: 3, text: 'Confirma con "Instalar"' },
  ];

  const steps = isIOS ? iosSteps : androidSteps;
  const title = isIOS ? 'Instalar en iPhone' : 'Instalar aplicación';

  return (
    <>
      <button
        onClick={handleInstall}
        className="fixed bottom-24 right-4 z-[999] w-12 h-12 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-2xl shadow-blue-600/40 flex items-center justify-center transition-all active:scale-95"
        aria-label="Instalar app"
        title="Instalar POSMASTER"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      </button>

      {showManualModal && (
        <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowManualModal(false)}>
          <div className="bg-white dark:bg-gray-800 w-full max-w-sm mx-4 mb-24 sm:mb-0 rounded-2xl p-6 shadow-2xl animate-in slide-in-from-bottom-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white font-black">P</div>
                <h3 className="text-lg font-black text-gray-900 dark:text-white">{title}</h3>
              </div>
              <button onClick={() => setShowManualModal(false)} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">✕</button>
            </div>
            <div className="space-y-3">
              {steps.map((s) => (
                <div key={s.num} className="flex items-start gap-3">
                  <span className="w-6 h-6 bg-blue-100 dark:bg-blue-900/30 text-blue-600 rounded-full flex items-center justify-center text-xs font-black shrink-0">{s.num}</span>
                  <p className="text-sm text-gray-600 dark:text-gray-300 leading-snug">{s.text}</p>
                </div>
              ))}
            </div>
            <button onClick={() => setShowManualModal(false)} className="mt-5 w-full py-3 bg-gray-900 text-white font-black rounded-xl text-xs uppercase tracking-widest">Entendido</button>
          </div>
        </div>
      )}

      {isInstallable && deferredPrompt && (
        <div className="fixed bottom-40 left-4 right-4 z-[998] md:left-auto md:right-6 md:w-96 animate-in slide-in-from-bottom-4 duration-500">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white font-black shrink-0">P</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-900 dark:text-white truncate">Instala POSMASTER</p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 font-medium">App en tu pantalla de inicio</p>
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
      )}
    </>
  );
}