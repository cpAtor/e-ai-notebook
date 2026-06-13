import { describe, expect, it } from "vitest";
import {
  addBlankPage,
  createStarterNotebook,
  replacePageTextCanvasItems
} from "./notebook";
import { buildLocalIndex, searchLocalIndex } from "./localIndex";

describe("Local Index", () => {
  it("indexes Notebook path material and Text Canvas Items as rebuildable derived state", () => {
    const starterNotebook = createStarterNotebook();
    const dsa = starterNotebook.sections[0];

    if (dsa === undefined) {
      throw new Error("Expected seeded DSA Section.");
    }

    const notebookWithPage = addBlankPage(starterNotebook, dsa.id, "page_dsa");
    const notebookWithText = replacePageTextCanvasItems(
      notebookWithPage,
      "page_dsa",
      [
        {
          id: "canvas_item_trace",
          pageId: "page_dsa",
          type: "text",
          text: "Binary search invariant"
        }
      ],
      [
        {
          pageId: "page_dsa",
          canvasItemId: "canvas_item_trace",
          bounds: { x: 120, y: 80, width: 260, height: 64 }
        }
      ]
    );

    const index = buildLocalIndex(notebookWithText);

    expect(index.map((entry) => entry.id)).toEqual([
      "page:page_dsa",
      "text:canvas_item_trace"
    ]);
    expect(searchLocalIndex(index, "interview prep")).toEqual([
      expect.objectContaining({
        id: "page:page_dsa",
        notebookPath: "Interview Prep Notebook / DSA / Untitled Page",
        sourceLabel: "Notebook path"
      }),
      expect.objectContaining({
        id: "text:canvas_item_trace",
        notebookPath: "Interview Prep Notebook / DSA / Untitled Page",
        sourceLabel: "Text Canvas Item"
      })
    ]);
    expect(searchLocalIndex(index, "invariant")).toEqual([
      expect.objectContaining({
        id: "text:canvas_item_trace",
        canvasItemId: "canvas_item_trace",
        canvasRegion: {
          pageId: "page_dsa",
          canvasItemId: "canvas_item_trace",
          bounds: { x: 120, y: 80, width: 260, height: 64 }
        },
        snippet: expect.stringContaining("Binary search invariant")
      })
    ]);
  });
});
