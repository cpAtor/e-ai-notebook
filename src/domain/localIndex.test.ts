import { describe, expect, it } from "vitest";
import {
  addCodeBlockCanvasItem,
  addDiagramCanvasItem,
  addImageCanvasItem,
  addLinkCardCanvasItem,
  addBlankPage,
  createStarterNotebook,
  replacePageCanvasItems,
  replacePageTextCanvasItems,
  STARTER_INBOX_SECTION_ID
} from "./notebook";
import { buildLocalIndex, searchLocalIndex } from "./localIndex";

describe("Local Index", () => {
  it("indexes Notebook path material and Text Canvas Items as rebuildable derived state", () => {
    const starterNotebook = createStarterNotebook();

    const notebookWithPage = addBlankPage(starterNotebook, STARTER_INBOX_SECTION_ID, "page_search");
    const notebookWithText = replacePageTextCanvasItems(
      notebookWithPage,
      "page_search",
      [
        {
          id: "canvas_item_trace",
          pageId: "page_search",
          type: "text",
          text: "Binary search invariant",
          tags: ["arrays"]
        }
      ],
      [
        {
          pageId: "page_search",
          canvasItemId: "canvas_item_trace",
          bounds: { x: 120, y: 80, width: 260, height: 64 }
        }
      ]
    );

    const index = buildLocalIndex(notebookWithText);

    expect(index.map((entry) => entry.id)).toEqual(
      expect.arrayContaining(["page:page_search", "text:canvas_item_trace"])
    );
    expect(searchLocalIndex(index, "interview prep")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "page:page_search",
          notebookPath: "Interview Prep Notebook / Inbox / Untitled Page",
          sourceLabel: "Notebook path"
        }),
        expect.objectContaining({
          id: "text:canvas_item_trace",
          notebookPath: "Interview Prep Notebook / Inbox / Untitled Page",
          sourceLabel: "Text Canvas Item"
        })
      ])
    );
    expect(searchLocalIndex(index, "arrays")).toEqual([
      expect.objectContaining({
        id: "text:canvas_item_trace",
        canvasItemId: "canvas_item_trace",
        matchedTags: ["arrays"],
        canvasRegion: {
          pageId: "page_search",
          canvasItemId: "canvas_item_trace",
          bounds: { x: 120, y: 80, width: 260, height: 64 }
        },
        snippet: expect.stringContaining("Binary search invariant")
      })
    ]);
  });

  it("indexes Link Card URLs, notes, and Tags without article body content", () => {
    const starterNotebook = createStarterNotebook();

    const notebookWithPage = addBlankPage(
      starterNotebook,
      STARTER_INBOX_SECTION_ID,
      "page_link_test"
    );
    const notebookWithLinkCard = addLinkCardCanvasItem(
      notebookWithPage,
      "page_link_test",
      "canvas_item_link_card",
      "https://example.com/system-design",
      "Queue for later distributed cache notes",
      ["cache", "reading"]
    );
    const index = buildLocalIndex(notebookWithLinkCard);

    expect(index.map((entry) => entry.id)).toEqual(
      expect.arrayContaining(["page:page_link_test", "link-card:canvas_item_link_card"])
    );
    expect(searchLocalIndex(index, "cache")).toEqual([
      expect.objectContaining({
        id: "link-card:canvas_item_link_card",
        canvasItemId: "canvas_item_link_card",
        sourceLabel: "Link Card",
        matchedTags: ["cache"],
        snippet: expect.stringContaining("distributed cache notes")
      })
    ]);
    expect(searchLocalIndex(index, "article body")).toEqual([]);
  });

  it("indexes Code Block content and Tags with Canvas Region citations", () => {
    const starterNotebook = createStarterNotebook();

    const notebookWithPage = addBlankPage(starterNotebook, STARTER_INBOX_SECTION_ID, "page_code");
    const notebookWithCodeBlock = addCodeBlockCanvasItem(
      notebookWithPage,
      "page_code",
      "canvas_item_code_block",
      "const complement = target - nums[i];",
      ["two sum", "arrays"]
    );
    const index = buildLocalIndex(notebookWithCodeBlock);

    expect(index.map((entry) => entry.id)).toEqual(
      expect.arrayContaining(["page:page_code", "code-block:canvas_item_code_block"])
    );
    expect(searchLocalIndex(index, "complement")).toEqual([
      expect.objectContaining({
        id: "code-block:canvas_item_code_block",
        canvasItemId: "canvas_item_code_block",
        sourceLabel: "Code Block",
        canvasRegion: {
          pageId: "page_code",
          canvasItemId: "canvas_item_code_block",
          bounds: { x: 0, y: 140, width: 520, height: 220 }
        },
        snippet: expect.stringContaining("const complement")
      })
    ]);
    expect(searchLocalIndex(index, "two sum")).toEqual([
      expect.objectContaining({
        matchedTags: ["two sum"]
      })
    ]);
  });

  it("indexes Image Item captions and Tags without searching image bytes", () => {
    const starterNotebook = createStarterNotebook();

    const notebookWithPage = addBlankPage(
      starterNotebook,
      STARTER_INBOX_SECTION_ID,
      "page_image"
    );
    const notebookWithImage = addImageCanvasItem(
      notebookWithPage,
      "page_image",
      "canvas_item_diagram",
      "data:image/png;base64,c2VjcmV0LWJ5dGVz",
      "image/png",
      "Load balancer failover sketch",
      ["diagram", "availability"]
    );
    const index = buildLocalIndex(notebookWithImage);

    expect(index.map((entry) => entry.id)).toEqual(
      expect.arrayContaining(["page:page_image", "image:canvas_item_diagram"])
    );
    expect(searchLocalIndex(index, "failover")).toEqual([
      expect.objectContaining({
        id: "image:canvas_item_diagram",
        canvasItemId: "canvas_item_diagram",
        sourceLabel: "Image Item",
        snippet: expect.stringContaining("Load balancer failover sketch")
      })
    ]);
    expect(searchLocalIndex(index, "availability")).toEqual([
      expect.objectContaining({
        matchedTags: ["availability"],
        canvasRegion: {
          pageId: "page_image",
          canvasItemId: "canvas_item_diagram",
          bounds: { x: 0, y: 380, width: 360, height: 240 }
        }
      })
    ]);
    expect(searchLocalIndex(index, "secret-bytes")).toEqual([]);
  });

  it("indexes Diagram Item labels and Tags with Canvas Region citations", () => {
    const starterNotebook = createStarterNotebook();

    const notebookWithPage = addBlankPage(
      starterNotebook,
      STARTER_INBOX_SECTION_ID,
      "page_diagram"
    );
    const notebookWithDiagramItem = addDiagramCanvasItem(
      notebookWithPage,
      "page_diagram",
      "canvas_item_queue",
      "arrow",
      "API Gateway publishes to queue",
      ["backpressure", "async"]
    );
    const index = buildLocalIndex(notebookWithDiagramItem);

    expect(index.map((entry) => entry.id)).toEqual(
      expect.arrayContaining(["page:page_diagram", "diagram:canvas_item_queue"])
    );
    expect(searchLocalIndex(index, "publishes")).toEqual([
      expect.objectContaining({
        id: "diagram:canvas_item_queue",
        canvasItemId: "canvas_item_queue",
        sourceLabel: "Diagram Item",
        canvasRegion: {
          pageId: "page_diagram",
          canvasItemId: "canvas_item_queue",
          bounds: { x: 420, y: 80, width: 260, height: 48 }
        },
        snippet: expect.stringContaining("API Gateway publishes to queue")
      })
    ]);
    expect(searchLocalIndex(index, "backpressure")).toEqual([
      expect.objectContaining({
        matchedTags: ["backpressure"]
      })
    ]);
  });

  it("keeps Freehand Drawings addressable but out of the Local Index", () => {
    const starterNotebook = createStarterNotebook();

    const notebookWithDrawing = replacePageCanvasItems(
      addBlankPage(starterNotebook, STARTER_INBOX_SECTION_ID, "page_drawing"),
      "page_drawing",
      [],
      [
        {
          id: "canvas_item_sketch",
          pageId: "page_drawing",
          type: "freehand-drawing",
          shape: {
            type: "draw",
            x: 20,
            y: 40,
            rotation: 0,
            props: {
              segments: [{ type: "free", path: "encoded-handwriting-stroke" }]
            }
          }
        }
      ],
      [
        {
          pageId: "page_drawing",
          canvasItemId: "canvas_item_sketch",
          bounds: { x: 20, y: 40, width: 160, height: 80 }
        }
      ]
    );
    const index = buildLocalIndex(notebookWithDrawing);

    expect(index.map((entry) => entry.id)).toEqual(
      expect.arrayContaining(["page:page_drawing"])
    );
    expect(index.map((entry) => entry.id)).not.toContain("freehand-drawing:canvas_item_sketch");
    expect(searchLocalIndex(index, "encoded-handwriting-stroke")).toEqual([]);
    expect(notebookWithDrawing.canvasRegions).toContainEqual({
      pageId: "page_drawing",
      canvasItemId: "canvas_item_sketch",
      bounds: { x: 20, y: 40, width: 160, height: 80 }
    });
  });
});
