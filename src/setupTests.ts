import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import "fake-indexeddb/auto";

vi.mock("@excalidraw/excalidraw", async () => {
  const React = await import("react");

  return {
    convertToExcalidrawElements: (elements: unknown[] | null) => elements ?? [],
    Excalidraw: ({
      excalidrawAPI,
      renderTopRightUI,
      theme
    }: {
      readonly excalidrawAPI?: (api: object) => void;
      readonly renderTopRightUI?: () => React.ReactNode;
      readonly theme?: string;
    }) => {
      React.useEffect(() => {
        excalidrawAPI?.({
          scrollToContent: vi.fn(),
          updateScene: vi.fn()
        });
      }, [excalidrawAPI]);

      return React.createElement(
        "div",
        { "aria-label": "Mock Excalidraw editor", "data-theme": theme },
        renderTopRightUI?.()
      );
    }
  };
});

if (globalThis.CSS === undefined) {
  Object.defineProperty(globalThis, "CSS", {
    value: {
      supports: () => false
    },
    configurable: true
  });
} else if (globalThis.CSS.supports === undefined) {
  Object.defineProperty(globalThis.CSS, "supports", {
    value: () => false,
    configurable: true
  });
}

if (HTMLImageElement.prototype.decode === undefined) {
  Object.defineProperty(HTMLImageElement.prototype, "decode", {
    value: () => Promise.resolve(),
    configurable: true
  });
}

afterEach(() => {
  cleanup();
});
