import { describe, expect, it } from "vitest";
import type {
  ExcalidrawFreeDrawElement,
  ExcalidrawTextElement
} from "@excalidraw/excalidraw/element/types";
import {
  notebookCanvasElementsFromItems,
  notebookCanvasSnapshotFromExcalidraw
} from "./notebookCanvas";

describe("Notebook Canvas Excalidraw adapter", () => {
  it("extracts text and freehand Canvas Items with app-owned Canvas Regions", () => {
    const textElement: ExcalidrawTextElement = {
      ...baseElement,
      id: "text_1",
      type: "text",
      x: 120,
      y: 80,
      width: 260,
      height: 64,
      text: "Binary search invariant",
      originalText: "Binary search invariant",
      fontSize: 24,
      fontFamily: 1,
      textAlign: "left",
      verticalAlign: "top",
      containerId: null,
      autoResize: true,
      lineHeight: 1.25 as ExcalidrawTextElement["lineHeight"],
      customData: {
        canvasItemId: "canvas_item_trace"
      }
    };
    const freehandElement: ExcalidrawFreeDrawElement = {
      ...baseElement,
      id: "draw_1",
      type: "freedraw",
      x: 24,
      y: 36,
      width: 180,
      height: 90,
      points: [
        [0, 0],
        [20, 30]
      ] as ExcalidrawFreeDrawElement["points"],
      pressures: [0.5, 0.7],
      simulatePressure: true,
      lastCommittedPoint: null,
      customData: {
        canvasItemId: "canvas_item_sketch"
      }
    };

    expect(
      notebookCanvasSnapshotFromExcalidraw("page_dsa", [
        textElement,
        freehandElement
      ])
    ).toEqual({
      textItems: [
        {
          id: "canvas_item_trace",
          pageId: "page_dsa",
          type: "text",
          text: "Binary search invariant",
          tags: []
        }
      ],
      freehandDrawingItems: [
        {
          id: "canvas_item_sketch",
          pageId: "page_dsa",
          type: "freehand-drawing",
          shape: {
            type: "draw",
            x: 24,
            y: 36,
            rotation: 0,
            props: {
              backgroundColor: "transparent",
              fillStyle: "hachure",
              height: 90,
              points: [
                [0, 0],
                [20, 30]
              ],
              pressures: [0.5, 0.7],
              roughness: 1,
              simulatePressure: true,
              strokeColor: "#172033",
              strokeStyle: "solid",
              strokeWidth: 2,
              width: 180
            }
          }
        }
      ],
      regions: [
        {
          pageId: "page_dsa",
          canvasItemId: "canvas_item_trace",
          bounds: { x: 120, y: 80, width: 260, height: 64 }
        },
        {
          pageId: "page_dsa",
          canvasItemId: "canvas_item_sketch",
          bounds: { x: 24, y: 36, width: 180, height: 90 }
        }
      ]
    });
  });

  it("derives app-owned Canvas Item IDs for new native elements", () => {
    const textElement: ExcalidrawTextElement = {
      ...baseElement,
      id: "shape:new-text",
      type: "text",
      x: 0,
      y: 0,
      text: "Queue BFS notes",
      originalText: "Queue BFS notes",
      fontSize: 24,
      fontFamily: 1,
      textAlign: "left",
      verticalAlign: "top",
      containerId: null,
      autoResize: true,
      lineHeight: 1.25 as ExcalidrawTextElement["lineHeight"]
    };

    expect(
      notebookCanvasSnapshotFromExcalidraw("page_dsa", [textElement]).textItems[0]?.id
    ).toBe("canvas_item_shape_new-text");
  });

  it("renders metadata Canvas Items as Notebook-owned Excalidraw elements", () => {
    const elements = notebookCanvasElementsFromItems(
      [
        {
          id: "canvas_item_link",
          pageId: "page_dsa",
          type: "link-card",
          url: "https://example.com/two-sum",
          note: "Practice source",
          tags: ["arrays"]
        },
        {
          id: "canvas_item_code",
          pageId: "page_dsa",
          type: "code-block",
          code: "const seen = new Map();",
          tags: ["hash map"]
        },
        {
          id: "canvas_item_image",
          pageId: "page_dsa",
          type: "image",
          dataUrl: "data:image/png;base64,ZGlhZ3JhbQ==",
          mediaType: "image/png",
          caption: "Failover sketch",
          tags: ["availability"]
        },
        {
          id: "canvas_item_diagram",
          pageId: "page_dsa",
          type: "diagram",
          kind: "sticky-note",
          label: "Queue absorbs spikes",
          tags: ["backpressure"]
        }
      ],
      [
        {
          pageId: "page_dsa",
          canvasItemId: "canvas_item_link",
          bounds: { x: 12, y: 24, width: 320, height: 120 }
        }
      ],
      "light"
    );

    expect(elements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "notebook_link",
          type: "text",
          x: 12,
          y: 24,
          customData: expect.objectContaining({
            canvasItemId: "canvas_item_link",
            canvasItemType: "link-card"
          }),
          text: expect.stringContaining("https://example.com/two-sum")
        }),
        expect.objectContaining({
          id: "notebook_code",
          type: "text",
          customData: expect.objectContaining({
            canvasItemId: "canvas_item_code",
            canvasItemType: "code-block"
          }),
          text: expect.stringContaining("const seen = new Map();")
        }),
        expect.objectContaining({
          id: "notebook_image",
          type: "text",
          customData: expect.objectContaining({
            canvasItemId: "canvas_item_image",
            canvasItemType: "image"
          }),
          text: expect.stringContaining("Failover sketch")
        }),
        expect.objectContaining({
          id: "notebook_diagram",
          type: "text",
          customData: expect.objectContaining({
            canvasItemId: "canvas_item_diagram",
            canvasItemType: "diagram"
          }),
          text: expect.stringContaining("Queue absorbs spikes")
        })
      ])
    );
  });

  it("syncs metadata Canvas Item regions without rewriting them as Text Canvas Items", () => {
    const linkCardElement: ExcalidrawTextElement = {
      ...baseElement,
      id: "notebook_link",
      type: "text",
      x: 48,
      y: 64,
      width: 320,
      height: 120,
      text: "Link Card\nhttps://example.com/two-sum",
      originalText: "Link Card\nhttps://example.com/two-sum",
      fontSize: 20,
      fontFamily: 1,
      textAlign: "left",
      verticalAlign: "top",
      containerId: null,
      autoResize: true,
      lineHeight: 1.25 as ExcalidrawTextElement["lineHeight"],
      customData: {
        canvasItemId: "canvas_item_link",
        canvasItemType: "link-card"
      }
    };

    expect(
      notebookCanvasSnapshotFromExcalidraw("page_dsa", [linkCardElement])
    ).toEqual({
      textItems: [],
      freehandDrawingItems: [],
      regions: [
        {
          pageId: "page_dsa",
          canvasItemId: "canvas_item_link",
          bounds: { x: 48, y: 64, width: 320, height: 120 }
        }
      ]
    });
  });
});

const baseElement = {
  x: 0,
  y: 0,
  strokeColor: "#172033",
  backgroundColor: "transparent",
  fillStyle: "hachure",
  strokeWidth: 2,
  strokeStyle: "solid",
  roundness: null,
  roughness: 1,
  opacity: 100,
  width: 100,
  height: 100,
  angle: 0,
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
  locked: false
} satisfies Omit<ExcalidrawTextElement, "id" | "type" | "fontSize" | "fontFamily" | "text" | "textAlign" | "verticalAlign" | "containerId" | "originalText" | "autoResize" | "lineHeight">;
