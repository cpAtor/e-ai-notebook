declare global {
  interface Window {
    EXCALIDRAW_ASSET_PATH?: string | readonly string[];
  }
}

window.EXCALIDRAW_ASSET_PATH = "/excalidraw-assets/";

export {};
