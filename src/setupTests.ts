import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import "fake-indexeddb/auto";

interface MockTldrawShape {
  readonly id: string;
  readonly type: string;
  readonly x: number;
  readonly y: number;
  readonly props?: unknown;
  readonly meta?: Record<string, unknown>;
}

const createMockTldrawEditor = () => {
  const shapes: MockTldrawShape[] = [];
  const listeners = new Set<() => void>();

  return {
    createShapes: (nextShapes: readonly MockTldrawShape[]) => {
      shapes.push(...nextShapes);
    },
    getCurrentPageShapes: () => shapes,
    getShapePageBounds: (shape: MockTldrawShape) => ({
      x: shape.x,
      y: shape.y,
      w: 260,
      h: 64
    }),
    setCurrentTool: () => undefined,
    updateShape: (nextShape: MockTldrawShape) => {
      const shapeIndex = shapes.findIndex((shape) => shape.id === nextShape.id);

      if (shapeIndex >= 0) {
        shapes[shapeIndex] = {
          ...shapes[shapeIndex],
          ...nextShape
        };
      }
    },
    store: {
      listen: (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      }
    }
  };
};

vi.mock("tldraw", async () => {
  const React = await import("react");

  return {
    iconTypes: [],
    Tldraw: ({
      onMount
    }: {
      readonly onMount?: (
        editor: ReturnType<typeof createMockTldrawEditor>
      ) => void | (() => void);
    }) => {
      React.useEffect(() => onMount?.(createMockTldrawEditor()), [onMount]);

      return React.createElement("div", {
        "aria-label": "Mock tldraw editor"
      });
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
