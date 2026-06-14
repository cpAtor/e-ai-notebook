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
    DefaultMainMenu: ({ children }: { readonly children?: React.ReactNode }) =>
      React.createElement(
        "div",
        { "data-testid": "tldraw-main-menu" },
        React.createElement("button", { type: "button" }, "Menu"),
        children
      ),
    DefaultMainMenuContent: () =>
      React.createElement("div", { "data-testid": "tldraw-default-main-menu-content" }),
    DefaultStylePanel: () =>
      React.createElement("div", { "data-testid": "tldraw-default-style-panel" }),
    useCanApplySelectionAction: vi.fn(() => false),
    useEditor: () => ({
      menus: {
        clearOpenMenus: vi.fn()
      }
    }),
    Tldraw: ({
      onMount,
      components
    }: {
      readonly onMount?: (
        editor: ReturnType<typeof createMockTldrawEditor>
      ) => void | (() => void);
      readonly components?: {
        readonly StylePanel?: React.ComponentType<object>;
        readonly MainMenu?: React.ComponentType<object>;
        readonly PageMenu?: React.ComponentType<object>;
      };
    }) => {
      React.useEffect(() => onMount?.(createMockTldrawEditor()), [onMount]);

      const StylePanelComponent = components?.StylePanel;
      const MainMenuComponent = components?.MainMenu;
      const PageMenuComponent = components?.PageMenu;

      return React.createElement(
        "div",
        { "aria-label": "Mock tldraw editor" },
        MainMenuComponent
          ? React.createElement(MainMenuComponent, {})
          : null,
        PageMenuComponent === null
          ? null
          : PageMenuComponent
          ? React.createElement(PageMenuComponent, {})
          : React.createElement("button", { type: "button" }, "Page 1"),
        StylePanelComponent
          ? React.createElement(StylePanelComponent, {})
          : null
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
