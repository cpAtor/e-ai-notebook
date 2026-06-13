import type {
  CanvasBounds,
  CanvasItemId,
  CanvasRegion,
  FreehandDrawingCanvasItem,
  PageId,
  TextCanvasItem
} from "../domain/notebook";

const CANVAS_ITEM_META_KEY = "canvasItemId";
const DEFAULT_TEXT_WIDTH = 260;
const DEFAULT_TEXT_HEIGHT = 64;

type RichTextNode = {
  type?: string;
  text?: string;
  content?: unknown[];
};

type TldrawRichText = {
  type: string;
  content: unknown[];
};

interface TldrawShape {
  readonly id: string;
  readonly type: string;
  readonly x: number;
  readonly y: number;
  readonly rotation?: number;
  readonly props?: unknown;
  readonly meta?: Readonly<Record<string, unknown>>;
}

interface TldrawBounds {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface TextShapeDraft {
  readonly type: "text";
  readonly x: number;
  readonly y: number;
  readonly props: {
    readonly richText: TldrawRichText;
    readonly w: number;
    readonly autoSize: boolean;
  };
  readonly meta: {
    readonly [CANVAS_ITEM_META_KEY]: CanvasItemId;
  };
}

export interface PageTextCanvasSnapshot {
  readonly textItems: readonly TextCanvasItem[];
  readonly regions: readonly CanvasRegion[];
}

export interface FreehandDrawingShapeDraft {
  readonly type: "draw";
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
  readonly props: Readonly<Record<string, unknown>>;
  readonly meta: {
    readonly [CANVAS_ITEM_META_KEY]: CanvasItemId;
  };
}

export interface PageTldrawCanvasSnapshot {
  readonly textItems: readonly TextCanvasItem[];
  readonly freehandDrawingItems: readonly FreehandDrawingCanvasItem[];
  readonly regions: readonly CanvasRegion[];
}

export const toTldrawTextShapeDrafts = (
  textItems: readonly TextCanvasItem[],
  regions: readonly CanvasRegion[]
): readonly TextShapeDraft[] =>
  textItems.map((textItem) => {
    const region = regions.find((candidate) => candidate.canvasItemId === textItem.id);
    const bounds = region?.bounds ?? {
      x: 96,
      y: 96,
      width: DEFAULT_TEXT_WIDTH,
      height: DEFAULT_TEXT_HEIGHT
    };

    return {
      type: "text",
      x: bounds.x,
      y: bounds.y,
      props: {
        richText: toRichText(textItem.text),
        w: bounds.width,
        autoSize: true
      },
      meta: {
        [CANVAS_ITEM_META_KEY]: textItem.id
      }
    };
  });

export const toTldrawFreehandDrawingShapeDrafts = (
  drawingItems: readonly FreehandDrawingCanvasItem[]
): readonly FreehandDrawingShapeDraft[] =>
  drawingItems.map((drawingItem) => ({
    type: "draw",
    x: drawingItem.shape.x,
    y: drawingItem.shape.y,
    rotation: drawingItem.shape.rotation,
    props: drawingItem.shape.props,
    meta: {
      [CANVAS_ITEM_META_KEY]: drawingItem.id
    }
  }));

export const textCanvasSnapshotFromTldrawShapes = (
  pageId: PageId,
  shapes: readonly TldrawShape[],
  getBounds: (shape: TldrawShape) => TldrawBounds | undefined
): PageTextCanvasSnapshot => {
  const snapshot = pageTldrawCanvasSnapshotFromTldrawShapes(
    pageId,
    shapes,
    getBounds
  );

  return {
    textItems: snapshot.textItems,
    regions: snapshot.regions.filter((region) =>
      snapshot.textItems.some((textItem) => textItem.id === region.canvasItemId)
    )
  };
};

export const pageTldrawCanvasSnapshotFromTldrawShapes = (
  pageId: PageId,
  shapes: readonly TldrawShape[],
  getBounds: (shape: TldrawShape) => TldrawBounds | undefined
): PageTldrawCanvasSnapshot => {
  const textItems: TextCanvasItem[] = [];
  const freehandDrawingItems: FreehandDrawingCanvasItem[] = [];
  const regions: CanvasRegion[] = [];

  for (const shape of shapes) {
    if (shape.type !== "text" && shape.type !== "draw") {
      continue;
    }

    const canvasItemId = canvasItemIdForShape(shape);
    const bounds = boundsForShape(shape, getBounds(shape));

    if (shape.type === "draw") {
      const props = drawingShapeProps(shape.props);

      if (props === null) {
        continue;
      }

      freehandDrawingItems.push({
        id: canvasItemId,
        pageId,
        type: "freehand-drawing",
        shape: {
          type: "draw",
          x: shape.x,
          y: shape.y,
          rotation: shape.rotation ?? 0,
          props
        }
      });
      regions.push({
        pageId,
        canvasItemId,
        bounds
      });
      continue;
    }

    const shapeProps = textShapeProps(shape.props);
    const text = plainTextFromRichText(shapeProps.richText).trim();

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
    regions.push({
      pageId,
      canvasItemId,
      bounds
    });
  }

  return { textItems, freehandDrawingItems, regions };
};

export const canvasItemIdForShape = (shape: TldrawShape): CanvasItemId => {
  const metaCanvasItemId = shape.meta?.[CANVAS_ITEM_META_KEY];

  if (isCanvasItemId(metaCanvasItemId)) {
    return metaCanvasItemId;
  }

  return `canvas_item_${shape.id.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
};

export const shapeNeedsCanvasItemMeta = (shape: TldrawShape): boolean =>
  (shape.type === "text" || shape.type === "draw") &&
  !isCanvasItemId(shape.meta?.[CANVAS_ITEM_META_KEY]);

const boundsForShape = (
  shape: TldrawShape,
  tldrawBounds: TldrawBounds | undefined
): CanvasBounds => ({
  x: tldrawBounds?.x ?? shape.x,
  y: tldrawBounds?.y ?? shape.y,
  width: tldrawBounds?.w ?? textShapeProps(shape.props).w ?? DEFAULT_TEXT_WIDTH,
  height: tldrawBounds?.h ?? DEFAULT_TEXT_HEIGHT
});

const toRichText = (text: string): TldrawRichText => ({
  type: "doc",
  content: text.split(/\r?\n/).map((line) => ({
    type: "paragraph",
    content: line.length > 0 ? [{ type: "text", text: line }] : []
  }))
});

const plainTextFromRichText = (node: unknown): string => {
  if (!isRichTextNode(node)) {
    return "";
  }

  if (typeof node.text === "string") {
    return node.text;
  }

  if (node.content === undefined) {
    return "";
  }

  return node.content
    .map((child) => plainTextFromRichText(child))
    .filter((text) => text.length > 0)
    .join("\n");
};

const isCanvasItemId = (value: unknown): value is CanvasItemId =>
  typeof value === "string" && value.startsWith("canvas_item_");

const isRichTextNode = (value: unknown): value is RichTextNode =>
  typeof value === "object" && value !== null;

const textShapeProps = (props: unknown): { richText?: unknown; w?: number } => {
  if (typeof props !== "object" || props === null) {
    return {};
  }

  const shapeProps = props as Record<string, unknown>;
  const w = typeof shapeProps.w === "number" ? shapeProps.w : undefined;

  return {
    richText: shapeProps.richText,
    ...(w === undefined ? {} : { w })
  };
};

const drawingShapeProps = (
  props: unknown
): Readonly<Record<string, unknown>> | null => {
  if (typeof props !== "object" || props === null) {
    return null;
  }

  return props as Readonly<Record<string, unknown>>;
};
