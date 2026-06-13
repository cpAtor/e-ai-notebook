import { describe, expect, it } from "vitest";
import {
  canvasItemIdForShape,
  pageTldrawCanvasSnapshotFromTldrawShapes,
  shapeNeedsCanvasItemMeta,
  textCanvasSnapshotFromTldrawShapes,
  toTldrawFreehandDrawingShapeDrafts,
  toTldrawTextShapeDrafts
} from "./tldrawTextAdapter";

describe("tldraw text adapter", () => {
  it("creates tldraw text shape drafts from app-owned Text Canvas Items", () => {
    const drafts = toTldrawTextShapeDrafts(
      [
        {
          id: "canvas_item_invariant",
          pageId: "page_dsa",
          type: "text",
          text: "Binary search invariant",
          tags: ["arrays"]
        }
      ],
      [
        {
          pageId: "page_dsa",
          canvasItemId: "canvas_item_invariant",
          bounds: { x: 32, y: 48, width: 280, height: 72 }
        }
      ]
    );

    expect(drafts).toEqual([
      {
        type: "text",
        x: 32,
        y: 48,
        props: {
          richText: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Binary search invariant" }]
              }
            ]
          },
          w: 280,
          autoSize: true
        },
        meta: {
          canvasItemId: "canvas_item_invariant"
        }
      }
    ]);
  });

  it("extracts text Canvas Items and Canvas Regions from tldraw text shapes", () => {
    const shape = {
      id: "shape:abc123",
      type: "text",
      x: 10,
      y: 20,
      props: {
        w: 200,
        richText: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Queue BFS notes" }]
            }
          ]
        }
      },
      meta: {
        canvasItemId: "canvas_item_bfs"
      }
    };

    expect(
      textCanvasSnapshotFromTldrawShapes("page_dsa", [shape], () => ({
        x: 12,
        y: 24,
        w: 210,
        h: 80
      }))
    ).toEqual({
      textItems: [
        {
          id: "canvas_item_bfs",
          pageId: "page_dsa",
          type: "text",
          text: "Queue BFS notes",
          tags: []
        }
      ],
      regions: [
        {
          pageId: "page_dsa",
          canvasItemId: "canvas_item_bfs",
          bounds: { x: 12, y: 24, width: 210, height: 80 }
        }
      ]
    });
  });

  it("derives app-owned IDs for new tldraw text shapes without relying on raw shape IDs as regions", () => {
    const shape = {
      id: "shape:new-text",
      type: "text",
      x: 0,
      y: 0,
      props: {
        richText: { type: "doc", content: [] }
      },
      meta: {}
    };

    expect(canvasItemIdForShape(shape)).toBe("canvas_item_shape_new-text");
    expect(shapeNeedsCanvasItemMeta(shape)).toBe(true);
  });

  it("creates tldraw draw shape drafts from app-owned Freehand Drawings", () => {
    expect(
      toTldrawFreehandDrawingShapeDrafts([
        {
          id: "canvas_item_sketch",
          pageId: "page_dsa",
          type: "freehand-drawing",
          shape: {
            type: "draw",
            x: 40,
            y: 56,
            rotation: 0,
            props: {
              color: "black",
              segments: [{ type: "free", path: "abc123" }],
              isComplete: true
            }
          }
        }
      ])
    ).toEqual([
      {
        type: "draw",
        x: 40,
        y: 56,
        rotation: 0,
        props: {
          color: "black",
          segments: [{ type: "free", path: "abc123" }],
          isComplete: true
        },
        meta: {
          canvasItemId: "canvas_item_sketch"
        }
      }
    ]);
  });

  it("extracts Freehand Drawings and Canvas Regions without text content", () => {
    const shape = {
      id: "shape:sketch",
      type: "draw",
      x: 10,
      y: 20,
      rotation: 0.2,
      props: {
        color: "black",
        segments: [{ type: "free", path: "encoded-stroke" }],
        isComplete: true
      },
      meta: {
        canvasItemId: "canvas_item_sketch"
      }
    };

    expect(
      pageTldrawCanvasSnapshotFromTldrawShapes("page_dsa", [shape], () => ({
        x: 12,
        y: 24,
        w: 210,
        h: 80
      }))
    ).toEqual({
      textItems: [],
      freehandDrawingItems: [
        {
          id: "canvas_item_sketch",
          pageId: "page_dsa",
          type: "freehand-drawing",
          shape: {
            type: "draw",
            x: 10,
            y: 20,
            rotation: 0.2,
            props: {
              color: "black",
              segments: [{ type: "free", path: "encoded-stroke" }],
              isComplete: true
            }
          }
        }
      ],
      regions: [
        {
          pageId: "page_dsa",
          canvasItemId: "canvas_item_sketch",
          bounds: { x: 12, y: 24, width: 210, height: 80 }
        }
      ]
    });
  });
});
