import {
  Excalidraw,
  MainMenu,
  convertToExcalidrawElements
} from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import { ReactNode, useEffect, useMemo, useRef } from "react";
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
  DiagramItemKind,
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
const CANVAS_ITEM_TYPE_META_KEY = "canvasItemType";
const DEFAULT_TEXT_WIDTH = 280;
const DEFAULT_TEXT_HEIGHT = 72;
const DEFAULT_FREEHAND_WIDTH = 180;
const DEFAULT_FREEHAND_HEIGHT = 90;
const NOTEBOOK_SOURCE = "interview-prep-notebook";

type NotebookExcalidrawElement = ExcalidrawElement & {
  readonly customData?: {
    readonly [CANVAS_ITEM_META_KEY]?: unknown;
    readonly [CANVAS_ITEM_TYPE_META_KEY]?: unknown;
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
    () => notebookCanvasElementsFromItems(pageCanvasItems, pageCanvasRegions, theme),
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
      >
        <NotebookMainMenu actions={actions} />
      </Excalidraw>
    </div>
  );
};

const NotebookMainMenu = ({
  actions
}: {
  readonly actions: readonly NotebookCanvasAction[];
}) => {
  const groupedActions = actionGroups(actions);

  return (
    <MainMenu>
      <MainMenu.DefaultItems.SearchMenu />
      <MainMenu.DefaultItems.ChangeCanvasBackground />
      <MainMenu.DefaultItems.ClearCanvas />
      <MainMenu.DefaultItems.Help />
      <MainMenu.Separator />
      {groupedActions.map((group) => (
        <MainMenu.Group key={group.id} title={group.label}>
          {group.actions.map((action) => (
            <MainMenu.Item
              key={action.id}
              selected={action.active}
              onSelect={() => action.onSelect()}
            >
              {action.label}
            </MainMenu.Item>
          ))}
        </MainMenu.Group>
      ))}
      <MainMenu.Separator />
      <MainMenu.ItemCustom
        className="notebook-main-menu-note"
        aria-label="Notebook privacy mode"
      >
        Private by Default
      </MainMenu.ItemCustom>
    </MainMenu>
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
    const canvasItemType = canvasItemTypeForExcalidrawElement(element);

    if (element.isDeleted || canvasItemId === null) {
      continue;
    }

    if (canvasItemType !== null && canvasItemType !== "text" && canvasItemType !== "freehand-drawing") {
      regions.push(regionForElement(pageId, canvasItemId, element));
      continue;
    }

    if (element.type === "text" && (canvasItemType === null || canvasItemType === "text")) {
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

    if (
      (element.type === "freedraw" || element.type === "line") &&
      (canvasItemType === null || canvasItemType === "freehand-drawing")
    ) {
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

export const notebookCanvasElementsFromItems = (
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

    return metadataCanvasItemToSkeleton(canvasItem, regions, theme);
  });

  return convertToExcalidrawElements(skeletons, { regenerateIds: false });
};

const metadataCanvasItemToSkeleton = (
  canvasItem: Exclude<CanvasItem, TextCanvasItem | FreehandDrawingCanvasItem>,
  regions: readonly CanvasRegion[],
  theme: NotebookCanvasTheme
): ExcalidrawElementSkeleton[] => {
  const bounds = boundsForCanvasItem(
    canvasItem.id,
    regions,
    defaultBoundsForMetadataCanvasItem(canvasItem)
  );

  return [
    {
      type: "text",
      id: elementIdForCanvasItem(canvasItem.id),
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      text: metadataCanvasItemText(canvasItem),
      originalText: metadataCanvasItemText(canvasItem),
      strokeColor: metadataCanvasItemStrokeColor(canvasItem, theme),
      backgroundColor: metadataCanvasItemBackgroundColor(canvasItem, theme),
      customData: notebookCustomData(canvasItem.id, canvasItem.type),
      fontSize: canvasItem.type === "code-block" ? 18 : 20
    } satisfies ExcalidrawElementSkeleton
  ];
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

const canvasItemTypeForExcalidrawElement = (
  element: ExcalidrawElement
): CanvasItem["type"] | null => {
  const customData = (element as NotebookExcalidrawElement).customData;
  const customCanvasItemType = customData?.[CANVAS_ITEM_TYPE_META_KEY];

  return isCanvasItemType(customCanvasItemType) ? customCanvasItemType : null;
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

const notebookCustomData = (
  canvasItemId: CanvasItemId,
  canvasItemType?: CanvasItem["type"]
) => ({
  [CANVAS_ITEM_META_KEY]: canvasItemId,
  ...(canvasItemType === undefined ? {} : { [CANVAS_ITEM_TYPE_META_KEY]: canvasItemType }),
  source: NOTEBOOK_SOURCE
});

const isCanvasItemId = (value: unknown): value is CanvasItemId =>
  typeof value === "string" && value.startsWith("canvas_item_");

const isCanvasItemType = (value: unknown): value is CanvasItem["type"] =>
  value === "text" ||
  value === "link-card" ||
  value === "code-block" ||
  value === "image" ||
  value === "freehand-drawing" ||
  value === "diagram";

const defaultBoundsForMetadataCanvasItem = (
  canvasItem: Exclude<CanvasItem, TextCanvasItem | FreehandDrawingCanvasItem>
): CanvasRegion["bounds"] => {
  if (canvasItem.type === "link-card") {
    return { x: 0, y: 0, width: 320, height: 120 };
  }

  if (canvasItem.type === "code-block") {
    return { x: 0, y: 140, width: 520, height: 220 };
  }

  if (canvasItem.type === "image") {
    return { x: 0, y: 380, width: 360, height: 240 };
  }

  if (canvasItem.kind === "arrow") {
    return { x: 420, y: 80, width: 260, height: 48 };
  }

  if (canvasItem.kind === "label") {
    return { x: 420, y: 80, width: 220, height: 56 };
  }

  if (canvasItem.kind === "sticky-note") {
    return { x: 420, y: 80, width: 220, height: 160 };
  }

  return { x: 420, y: 80, width: 240, height: 120 };
};

const metadataCanvasItemText = (
  canvasItem: Exclude<CanvasItem, TextCanvasItem | FreehandDrawingCanvasItem>
): string => {
  if (canvasItem.type === "link-card") {
    return joinCanvasItemLines([
      "Link Card",
      canvasItem.url,
      canvasItem.note
    ]);
  }

  if (canvasItem.type === "code-block") {
    return joinCanvasItemLines(["Code Block", canvasItem.code]);
  }

  if (canvasItem.type === "image") {
    return joinCanvasItemLines([
      "Image Item",
      canvasItem.caption || canvasItem.mediaType
    ]);
  }

  return joinCanvasItemLines([
    `Diagram Item: ${diagramKindLabel(canvasItem.kind)}`,
    canvasItem.label
  ]);
};

const joinCanvasItemLines = (lines: readonly string[]): string =>
  lines.filter((line) => line.trim().length > 0).join("\n");

const diagramKindLabel = (kind: DiagramItemKind): string => {
  if (kind === "sticky-note") {
    return "Sticky Note";
  }

  return kind.charAt(0).toUpperCase() + kind.slice(1);
};

const metadataCanvasItemStrokeColor = (
  canvasItem: Exclude<CanvasItem, TextCanvasItem | FreehandDrawingCanvasItem>,
  theme: NotebookCanvasTheme
): string => {
  if (canvasItem.type === "link-card") {
    return theme === "dark" ? "#b8c5ff" : "#314ee8";
  }

  if (canvasItem.type === "code-block") {
    return theme === "dark" ? "#dbe8ff" : "#172033";
  }

  if (canvasItem.type === "image") {
    return theme === "dark" ? "#d7c4ff" : "#5f3dc4";
  }

  return theme === "dark" ? "#ffe0a3" : "#7a4a00";
};

const metadataCanvasItemBackgroundColor = (
  canvasItem: Exclude<CanvasItem, TextCanvasItem | FreehandDrawingCanvasItem>,
  theme: NotebookCanvasTheme
): string => {
  if (canvasItem.type === "link-card") {
    return theme === "dark" ? "#243156" : "#eef2ff";
  }

  if (canvasItem.type === "code-block") {
    return theme === "dark" ? "#20283d" : "#f1f5f9";
  }

  if (canvasItem.type === "image") {
    return theme === "dark" ? "#33284d" : "#f3edff";
  }

  return theme === "dark" ? "#4a3418" : "#fff3c4";
};

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
