const SCRIPT_SRC = "https://accounts.google.com/gsi/client";

interface GoogleIdApi {
  initialize(config: { client_id: string; callback: (response: { credential: string }) => void }): void;
  renderButton(parent: HTMLElement, options: { type: "standard"; size: "large"; width: number }): void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleIdApi } };
  }
}

let loading: Promise<GoogleIdApi> | null = null;

/** Carga el script de Google Identity Services una sola vez. */
export function loadGoogleIdentity(): Promise<GoogleIdApi> {
  loading ??= new Promise((resolve, reject) => {
    const ready = () => {
      const api = window.google?.accounts.id;

      if (api) resolve(api);
      else reject(new Error("Google Identity no está disponible"));
    };

    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = ready;
    script.onerror = () => {
      loading = null;
      reject(new Error("No se pudo cargar Google"));
    };

    document.head.append(script);
  });

  return loading;
}
