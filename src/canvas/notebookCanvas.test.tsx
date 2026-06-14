import { describe, expect, it } from "vitest";
import type {
  ExcalidrawFreeDrawElement,
  ExcalidrawTextElement
} from "@excalidraw/excalidraw/element/types";
import { notebookCanvasSnapshotFromExcalidraw } from "./notebookCanvas";

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
