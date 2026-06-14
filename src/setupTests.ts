import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import "fake-indexeddb/auto";
import type {
  ButtonHTMLAttributes,
  CSSProperties,
  HTMLAttributes,
  ReactNode
} from "react";

vi.mock("@excalidraw/excalidraw", async () => {
  const React = await import("react");
  type MenuProps = {
    readonly children?: ReactNode;
    readonly onSelect?: (event: Event) => void;
  };
  type MenuItemProps = {
    readonly children: ReactNode;
    readonly onSelect?: (event: Event) => void;
    readonly selected?: boolean;
  } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onSelect">;
  type MenuGroupProps = {
    readonly children: ReactNode;
    readonly className?: string;
    readonly style?: CSSProperties;
    readonly title?: string;
  };
  type MenuItemCustomProps = {
    readonly children: ReactNode;
    readonly className?: string;
    readonly selected?: boolean;
  } & HTMLAttributes<HTMLDivElement>;

  const createDefaultItem =
    (label: string) =>
    ({ className }: { readonly className?: string } = {}) =>
      React.createElement(
        "button",
        { className, role: "menuitem", type: "button" },
        label
      );

  const MainMenu = Object.assign(
    ({ children, onSelect }: MenuProps) => {
      const [isOpen, setIsOpen] = React.useState(false);

      return React.createElement(
        "div",
        null,
        React.createElement(
          "button",
          {
            "aria-expanded": isOpen,
            onClick: () => setIsOpen((current) => !current),
            type: "button"
          },
          "Menu"
        ),
        isOpen
          ? React.createElement(
              "div",
              {
                "aria-label": "Excalidraw main menu",
                onClick: (event: React.MouseEvent<HTMLDivElement>) => {
                  onSelect?.(event.nativeEvent);
                  setIsOpen(false);
                },
                role: "menu"
              },
              children
            )
          : null
      );
    },
    {
      DefaultItems: {
        ChangeCanvasBackground: createDefaultItem("Change canvas background"),
        ClearCanvas: createDefaultItem("Clear canvas"),
        Help: createDefaultItem("Help"),
        SearchMenu: createDefaultItem("Find on canvas")
      },
      Group: ({ children, className, style, title }: MenuGroupProps) =>
        React.createElement(
          "div",
          { "aria-label": title, className, role: "group", style },
          children
        ),
      Item: ({
        children,
        onClick,
        onSelect,
        selected,
        ...rest
      }: MenuItemProps) =>
        React.createElement(
          "button",
          {
            ...rest,
            "aria-pressed": selected,
            onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
              onClick?.(event);
              onSelect?.(event.nativeEvent);
            },
            role: "menuitem",
            type: "button"
          },
          children
        ),
      ItemCustom: ({ children, selected, ...rest }: MenuItemCustomProps) =>
        React.createElement(
          "div",
          { ...rest, "aria-selected": selected },
          children
        ),
      Separator: () => React.createElement("hr", { role: "separator" }),
      Trigger: ({
        children,
        onToggle,
        ...rest
      }: {
        readonly children: ReactNode;
        readonly onToggle: () => void;
      } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onSelect">) =>
        React.createElement(
          "button",
          { ...rest, onClick: onToggle, type: "button" },
          children
        )
    }
  );

  return {
    convertToExcalidrawElements: (elements: unknown[] | null) => elements ?? [],
    Excalidraw: ({
      children,
      excalidrawAPI,
      renderTopRightUI,
      theme
    }: {
      readonly children?: ReactNode;
      readonly excalidrawAPI?: (api: object) => void;
      readonly renderTopRightUI?: () => ReactNode;
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
        renderTopRightUI?.(),
        children
      );
    },
    MainMenu
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
