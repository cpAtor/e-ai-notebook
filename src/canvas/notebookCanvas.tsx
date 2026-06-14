import { Excalidraw, convertToExcalidrawElements } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/data/transform";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type {
  ExcalidrawElement,
  ExcalidrawFreeDrawElement,
  ExcalidrawLinearElement,
  OrderedExcalidrawElement
} from "@excalidraw/excalidraw/element/types";
import type {
  CanvasItem,
  CanvasItemId,
  CanvasRegion,
  FreehandDrawingCanvasItem,
  Page,
  PageId,
  TextCanvasItem
} from "../domain/notebook";

export type NotebookCanvasTheme = "light" | "dark";

export interface NotebookCanvasSnapshot {
  readonly textItems: readonly TextCanvasItem[];
  readonly freehandDrawingItems: readonly FreehandDrawingCanvasItem[];
  readonly regions: readonly CanvasRegion[];
}

export interface NotebookCanvasAction {
  readonly id: string;
  readonly label: string;
  readonly group: "notebook" | "theme" | "tools";
  readonly active?: boolean;
  readonly onSelect: () => void;
}

interface NotebookCanvasProps {
  readonly page: Page;
  readonly canvasItems: readonly CanvasItem[];
  readonly canvasRegions: readonly CanvasRegion[];
  readonly highlightedCanvasItemId: CanvasItemId | null;
  readonly theme: NotebookCanvasTheme;
  readonly actions: readonly NotebookCanvasAction[];
  readonly onCanvasChange: (pageId: PageId, snapshot: NotebookCanvasSnapshot) => void;
}

const CANVAS_ITEM_META_KEY = "canvasItemId";
const DEFAULT_TEXT_WIDTH = 280;
const DEFAULT_TEXT_HEIGHT = 72;
const DEFAULT_FREEHAND_WIDTH = 180;
const DEFAULT_FREEHAND_HEIGHT = 90;
const NOTEBOOK_SOURCE = "interview-prep-notebook";

type NotebookExcalidrawElement = ExcalidrawElement & {
  readonly customData?: {
    readonly [CANVAS_ITEM_META_KEY]?: unknown;
    readonly source?: unknown;
  };
};

export const NotebookCanvas = ({
  page,
  canvasItems,
  canvasRegions,
  highlightedCanvasItemId,
  theme,
  actions,
  onCanvasChange
}: NotebookCanvasProps) => {
  const saveTimeoutRef = useRef<number | undefined>(undefined);
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const pageCanvasItems = useMemo(
    () => canvasItems.filter((canvasItem) => canvasItem.pageId === page.id),
    [canvasItems, page.id]
  );
  const pageCanvasRegions = useMemo(
    () => canvasRegions.filter((region) => region.pageId === page.id),
    [canvasRegions, page.id]
  );
  const initialElements = useMemo(
    () => toExcalidrawElements(pageCanvasItems, pageCanvasRegions, theme),
    [pageCanvasItems, pageCanvasRegions, theme]
  );
  const highlightedRegion = useMemo(
    () =>
      highlightedCanvasItemId === null
        ? null
        : (pageCanvasRegions.find(
            (region) => region.canvasItemId === highlightedCanvasItemId
          ) ?? null),
    [highlightedCanvasItemId, pageCanvasRegions]
  );

  const initialData = useMemo(
    () => ({
      elements: initialElements,
      appState: {
        currentItemStrokeColor: defaultStrokeColor(theme),
        currentItemBackgroundColor: "transparent",
        currentItemFontSize: 24,
        currentItemRoughness: 1,
        currentItemStrokeWidth: 2,
        theme,
        viewBackgroundColor: defaultCanvasBackground(theme)
      },
      scrollToContent: true
    }),
    [initialElements, theme]
  );

  useEffect(() => {
    apiRef.current?.updateScene({
      appState: {
        currentItemStrokeColor: defaultStrokeColor(theme),
        currentItemBackgroundColor: "transparent",
        theme,
        viewBackgroundColor: defaultCanvasBackground(theme)
      }
    });
  }, [theme]);

  useEffect(
    () => () => {
      window.clearTimeout(saveTimeoutRef.current);
    },
    []
  );

  const handleChange = (elements: readonly OrderedExcalidrawElement[]) => {
    window.clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = window.setTimeout(() => {
      onCanvasChange(page.id, notebookCanvasSnapshotFromExcalidraw(page.id, elements));
    }, 250);
  };

  return (
    <div
      className="notebook-canvas"
      data-testid="notebook-page-canvas"
      aria-label={`${page.title} Excalidraw Notebook Canvas`}
    >
      {highlightedRegion !== null ? (
        <div
          className="canvas-region-highlight"
          role="status"
          aria-label="Highlighted Canvas Region"
          style={{
            height: `${highlightedRegion.bounds.height}px`,
            left: `${highlightedRegion.bounds.x}px`,
            top: `${highlightedRegion.bounds.y}px`,
            width: `${highlightedRegion.bounds.width}px`
          }}
        />
      ) : null}
      <Excalidraw
        key={page.id}
        autoFocus
        excalidrawAPI={(api) => {
          apiRef.current = api;
        }}
        initialData={initialData}
        name={page.title}
        onChange={handleChange}
        renderTopRightUI={() => <NotebookCanvasMenu actions={actions} />}
        theme={theme}
        UIOptions={{
          canvasActions: {
            changeViewBackgroundColor: true,
            clearCanvas: true,
            export: false,
            loadScene: false,
            saveAsImage: false,
            saveToActiveFile: false,
            toggleTheme: false
          }
        }}
      />
    </div>
  );
};

const NotebookCanvasMenu = ({
  actions
}: {
  readonly actions: readonly NotebookCanvasAction[];
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const groupedActions = actionGroups(actions);

  const selectAction = (action: NotebookCanvasAction) => {
    setIsOpen(false);
    action.onSelect();
  };

  return (
    <div className="notebook-canvas-menu">
      <button
        type="button"
        className="notebook-canvas-menu__button"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      >
        Menu
      </button>
      {isOpen ? (
        <div
          className="notebook-canvas-menu__popover"
          role="menu"
          aria-label="Notebook actions"
        >
          {groupedActions.map((group) => (
            <div
              key={group.id}
              className="notebook-canvas-menu__section"
              role="group"
              aria-label={group.label}
            >
              <span className="notebook-canvas-menu__label">{group.label}</span>
              {group.actions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  className={
                    action.active
                      ? "notebook-canvas-menu__item notebook-canvas-menu__item--active"
                      : "notebook-canvas-menu__item"
                  }
                  aria-pressed={action.active}
                  role="menuitem"
                  onClick={() => selectAction(action)}
                >
                  {action.label}
                </button>
              ))}
            </div>
          ))}
          <div
            className="notebook-canvas-menu__privacy"
            aria-label="Notebook privacy mode"
          >
            Private by Default
          </div>
        </div>
      ) : null}
    </div>
  );
};

const actionGroups = (actions: readonly NotebookCanvasAction[]) =>
  (["notebook", "theme", "tools"] as const)
    .map((group) => ({
      id: group,
      label: groupLabel(group),
      actions: actions.filter((action) => action.group === group)
    }))
    .filter((group) => group.actions.length > 0);

const groupLabel = (group: NotebookCanvasAction["group"]): string => {
  if (group === "notebook") {
    return "Notebook";
  }

  if (group === "theme") {
    return "Theme";
  }

  return "Tools";
};

export const notebookCanvasSnapshotFromExcalidraw = (
  pageId: PageId,
  elements: readonly ExcalidrawElement[]
): NotebookCanvasSnapshot => {
  const textItems: TextCanvasItem[] = [];
  const freehandDrawingItems: FreehandDrawingCanvasItem[] = [];
  const regions: CanvasRegion[] = [];

  for (const element of elements) {
    const canvasItemId = canvasItemIdForExcalidrawElement(element);

    if (element.isDeleted || canvasItemId === null) {
      continue;
    }

    if (element.type === "text") {
      const text = element.text.trim();

      if (text.length === 0) {
        continue;
      }

      textItems.push({
        id: canvasItemId,
        pageId,
        type: "text",
        text,
        tags: []
      });
      regions.push(regionForElement(pageId, canvasItemId, element));
      continue;
    }

    if (element.type === "freedraw" || element.type === "line") {
      freehandDrawingItems.push({
        id: canvasItemId,
        pageId,
        type: "freehand-drawing",
        shape: {
          type: "draw",
          x: element.x,
          y: element.y,
          rotation: element.angle,
          props: freehandPropsFromElement(element)
        }
      });
      regions.push(regionForElement(pageId, canvasItemId, element));
    }
  }

  return { textItems, freehandDrawingItems, regions };
};

const toExcalidrawElements = (
  canvasItems: readonly CanvasItem[],
  regions: readonly CanvasRegion[],
  theme: NotebookCanvasTheme
): readonly OrderedExcalidrawElement[] => {
  const skeletons = canvasItems.flatMap((canvasItem): ExcalidrawElementSkeleton[] => {
    if (canvasItem.type === "text") {
      const bounds = boundsForCanvasItem(canvasItem.id, regions, {
        x: 96,
        y: 96,
        width: DEFAULT_TEXT_WIDTH,
        height: DEFAULT_TEXT_HEIGHT
      });

      return [
        {
          type: "text",
          id: elementIdForCanvasItem(canvasItem.id),
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height,
          text: canvasItem.text,
          originalText: canvasItem.text,
          strokeColor: defaultStrokeColor(theme),
          backgroundColor: "transparent",
          customData: notebookCustomData(canvasItem.id),
          fontSize: 24
        } satisfies ExcalidrawElementSkeleton
      ];
    }

    if (canvasItem.type === "freehand-drawing") {
      return freehandDrawingToSkeleton(canvasItem, regions, theme);
    }

    return [];
  });

  return convertToExcalidrawElements(skeletons, { regenerateIds: false });
};

const freehandDrawingToSkeleton = (
  canvasItem: FreehandDrawingCanvasItem,
  regions: readonly CanvasRegion[],
  theme: NotebookCanvasTheme
): ExcalidrawElementSkeleton[] => {
  const bounds = boundsForCanvasItem(canvasItem.id, regions, {
    x: canvasItem.shape.x,
    y: canvasItem.shape.y,
    width: DEFAULT_FREEHAND_WIDTH,
    height: DEFAULT_FREEHAND_HEIGHT
  });
  const props = canvasItem.shape.props;
  const points = readPointTuples(props.points);

  if (points === null) {
    return [];
  }

  return [
    {
      type: "freedraw",
      id: elementIdForCanvasItem(canvasItem.id),
      x: canvasItem.shape.x,
      y: canvasItem.shape.y,
      width: readNumber(props.width) ?? bounds.width,
      height: readNumber(props.height) ?? bounds.height,
      angle: canvasItem.shape.rotation,
      points,
      pressures: readNumberArray(props.pressures) ?? [],
      simulatePressure: readBoolean(props.simulatePressure) ?? false,
      lastCommittedPoint: null,
      fillStyle: "hachure",
      strokeWidth: readNumber(props.strokeWidth) ?? 2,
      strokeStyle: readStrokeStyle(props.strokeStyle),
      roughness: readNumber(props.roughness) ?? 1,
      opacity: 100,
      roundness: null,
      seed: 1,
      version: 1,
      versionNonce: 1,
      index: null,
      isDeleted: false,
      groupIds: [],
      frameId: null,
      boundElements: null,
      updated: 1,
      link: null,
      locked: false,
      strokeColor: readString(props.strokeColor) ?? defaultStrokeColor(theme),
      backgroundColor: "transparent",
      customData: notebookCustomData(canvasItem.id)
    } satisfies ExcalidrawElementSkeleton
  ];
};

const canvasItemIdForExcalidrawElement = (
  element: ExcalidrawElement
): CanvasItemId | null => {
  const customData = (element as NotebookExcalidrawElement).customData;
  const customCanvasItemId = customData?.[CANVAS_ITEM_META_KEY];

  if (isCanvasItemId(customCanvasItemId)) {
    return customCanvasItemId;
  }

  if (element.type === "text" || element.type === "freedraw" || element.type === "line") {
    return `canvas_item_${element.id.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  }

  return null;
};

const regionForElement = (
  pageId: PageId,
  canvasItemId: CanvasItemId,
  element: ExcalidrawElement
): CanvasRegion => ({
  pageId,
  canvasItemId,
  bounds: {
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height
  }
});

const freehandPropsFromElement = (
  element: ExcalidrawFreeDrawElement | ExcalidrawLinearElement
): Readonly<Record<string, unknown>> => ({
  backgroundColor: element.backgroundColor,
  fillStyle: element.fillStyle,
  height: element.height,
  points: element.points,
  pressures: element.type === "freedraw" ? element.pressures : [],
  roughness: element.roughness,
  simulatePressure: element.type === "freedraw" ? element.simulatePressure : false,
  strokeColor: element.strokeColor,
  strokeStyle: element.strokeStyle,
  strokeWidth: element.strokeWidth,
  width: element.width
});

const boundsForCanvasItem = (
  canvasItemId: CanvasItemId,
  regions: readonly CanvasRegion[],
  fallback: CanvasRegion["bounds"]
): CanvasRegion["bounds"] =>
  regions.find((region) => region.canvasItemId === canvasItemId)?.bounds ?? fallback;

const elementIdForCanvasItem = (canvasItemId: CanvasItemId): string =>
  canvasItemId.replace(/^canvas_item_/, "notebook_");

const notebookCustomData = (canvasItemId: CanvasItemId) => ({
  [CANVAS_ITEM_META_KEY]: canvasItemId,
  source: NOTEBOOK_SOURCE
});

const isCanvasItemId = (value: unknown): value is CanvasItemId =>
  typeof value === "string" && value.startsWith("canvas_item_");

const defaultStrokeColor = (theme: NotebookCanvasTheme): string =>
  theme === "dark" ? "#f5f7ff" : "#172033";

const defaultCanvasBackground = (theme: NotebookCanvasTheme): string =>
  theme === "dark" ? "#1a1f2e" : "#fffdf7";

const readPointTuples = (value: unknown): ExcalidrawFreeDrawElement["points"] | null => {
  if (!Array.isArray(value)) {
    return null;
  }

  const points = value.filter(
    (point): point is ExcalidrawFreeDrawElement["points"][number] =>
      Array.isArray(point) &&
      point.length === 2 &&
      typeof point[0] === "number" &&
      typeof point[1] === "number"
  );

  return points.length === value.length ? points : null;
};

const readString = (value: unknown): string | null =>
  typeof value === "string" ? value : null;

const readNumber = (value: unknown): number | null =>
  typeof value === "number" ? value : null;

const readBoolean = (value: unknown): boolean | null =>
  typeof value === "boolean" ? value : null;

const readNumberArray = (value: unknown): readonly number[] | null =>
  Array.isArray(value) && value.every((item) => typeof item === "number")
    ? value
    : null;

const readStrokeStyle = (value: unknown): ExcalidrawFreeDrawElement["strokeStyle"] =>
  value === "dashed" || value === "dotted" || value === "solid" ? value : "solid";

export const NotebookCanvasMenuSlot = ({ children }: { readonly children: ReactNode }) => (
  <>{children}</>
);
