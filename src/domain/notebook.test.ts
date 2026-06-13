import { describe, expect, it } from "vitest";
import {
  addCodeBlockCanvasItem,
  addDiagramCanvasItem,
  addImageCanvasItem,
  addLinkCardCanvasItem,
  addBlankPage,
  addSection,
  createStarterNotebook,
  replacePageCanvasItems,
  replacePageTextCanvasItems,
  removeSection,
  renameSection,
  updateCodeBlockCanvasItem,
  updateDiagramCanvasItem,
  updateImageCanvasItemMetadata,
  updateTextCanvasItemTags
} from "./notebook";

describe("Notebook Sections", () => {
  it("opens a private Interview Prep Notebook with editable starter Sections", () => {
    const notebook = createStarterNotebook();

    expect(notebook.title).toBe("Interview Prep Notebook");
    expect(notebook.privacyMode).toBe("private-by-default");
    expect(notebook.sections.map((section) => section.title)).toEqual([
      "DSA",
      "System Design",
      "Research"
    ]);
    expect(notebook.canvasItems).toEqual([]);
    expect(notebook.canvasRegions).toEqual([]);
  });

  it("renames, adds, and removes Sections without preserving a fixed taxonomy", () => {
    const starterNotebook = createStarterNotebook();
    const dsa = starterNotebook.sections[0];

    if (dsa === undefined) {
      throw new Error("Expected seeded DSA Section.");
    }

    const customizedNotebook = removeSection(
      addSection(
        renameSection(starterNotebook, dsa.id, "Algorithms"),
        "section_behavioral",
        "Behavioral"
      ),
      "section_research"
    );

    expect(customizedNotebook.sections.map((section) => section.title)).toEqual([
      "Algorithms",
      "System Design",
      "Behavioral"
    ]);
  });

  it("creates blank Pages with Page Type unset and removes them with their Section", () => {
    const starterNotebook = createStarterNotebook();
    const dsa = starterNotebook.sections[0];

    if (dsa === undefined) {
      throw new Error("Expected seeded DSA Section.");
    }

    const notebookWithPage = addBlankPage(starterNotebook, dsa.id, "page_dsa");

    expect(notebookWithPage.pages).toEqual([
      {
        id: "page_dsa",
        sectionId: dsa.id,
        title: "Untitled Page",
        pageType: null
      }
    ]);

    expect(removeSection(notebookWithPage, dsa.id).pages).toEqual([]);
  });

  it("saves text Canvas Items with app-owned Canvas Regions for a Page", () => {
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
          text: "Binary search invariant",
          tags: ["arrays"]
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

    expect(notebookWithText.canvasItems).toEqual([
      {
        id: "canvas_item_trace",
        pageId: "page_dsa",
        type: "text",
        text: "Binary search invariant",
        tags: ["arrays"]
      }
    ]);
    expect(notebookWithText.canvasRegions[0]?.bounds).toEqual({
      x: 120,
      y: 80,
      width: 260,
      height: 64
    });
  });

  it("normalizes optional Tags on text Canvas Items", () => {
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
          text: "Binary search invariant",
          tags: []
        }
      ],
      []
    );
    const notebookWithTags = updateTextCanvasItemTags(
      notebookWithText,
      "canvas_item_trace",
      [
        " arrays ",
        "",
        "arrays",
        "binary search"
      ]
    );

    expect(notebookWithTags.canvasItems).toContainEqual({
      id: "canvas_item_trace",
      pageId: "page_dsa",
      type: "text",
      text: "Binary search invariant",
      tags: ["arrays", "binary search"]
    });
  });

  it("adds Link Cards with optional notes, Tags, and app-owned Canvas Regions", () => {
    const starterNotebook = createStarterNotebook();
    const dsa = starterNotebook.sections[0];

    if (dsa === undefined) {
      throw new Error("Expected seeded DSA Section.");
    }

    const notebookWithPage = addBlankPage(starterNotebook, dsa.id, "page_dsa");
    const notebookWithLinkCard = addLinkCardCanvasItem(
      notebookWithPage,
      "page_dsa",
      "canvas_item_problem_link",
      "https://example.com/two-sum",
      "Practice source for array hashing",
      [" arrays ", "arrays", "practice"]
    );

    expect(notebookWithLinkCard.canvasItems).toEqual([
      {
        id: "canvas_item_problem_link",
        pageId: "page_dsa",
        type: "link-card",
        url: "https://example.com/two-sum",
        note: "Practice source for array hashing",
        tags: ["arrays", "practice"]
      }
    ]);
    expect(notebookWithLinkCard.canvasRegions[0]).toEqual({
      pageId: "page_dsa",
      canvasItemId: "canvas_item_problem_link",
      bounds: { x: 0, y: 0, width: 320, height: 120 }
    });
  });

  it("keeps Link Cards when replacing tldraw text Canvas Items", () => {
    const starterNotebook = createStarterNotebook();
    const dsa = starterNotebook.sections[0];

    if (dsa === undefined) {
      throw new Error("Expected seeded DSA Section.");
    }

    const notebookWithPage = addBlankPage(starterNotebook, dsa.id, "page_dsa");
    const notebookWithLinkCard = addLinkCardCanvasItem(
      notebookWithPage,
      "page_dsa",
      "canvas_item_problem_link",
      "https://example.com/two-sum",
      "",
      []
    );
    const notebookWithText = replacePageTextCanvasItems(
      notebookWithLinkCard,
      "page_dsa",
      [
        {
          id: "canvas_item_trace",
          pageId: "page_dsa",
          type: "text",
          text: "Binary search invariant",
          tags: []
        }
      ],
      []
    );

    expect(notebookWithText.canvasItems.map((canvasItem) => canvasItem.type)).toEqual([
      "link-card",
      "text"
    ]);
    expect(notebookWithText.canvasRegions).toContainEqual({
      pageId: "page_dsa",
      canvasItemId: "canvas_item_problem_link",
      bounds: { x: 0, y: 0, width: 320, height: 120 }
    });
  });

  it("saves Freehand Drawings with app-owned Canvas Regions without Tags", () => {
      const starterNotebook = createStarterNotebook();
      const dsa = starterNotebook.sections[0];

      if (dsa === undefined) {
        throw new Error("Expected seeded DSA Section.");
      }

      const notebookWithPage = addBlankPage(starterNotebook, dsa.id, "page_dsa");
      const notebookWithDrawing = replacePageCanvasItems(
        notebookWithPage,
        "page_dsa",
        [],
        [
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
                segments: [{ type: "free", path: "encoded-stroke" }],
                isComplete: true
              }
            }
          }
        ],
        [
          {
            pageId: "page_dsa",
            canvasItemId: "canvas_item_sketch",
            bounds: { x: 24, y: 36, width: 180, height: 90 }
          }
        ]
      );

      expect(notebookWithDrawing.canvasItems).toEqual([
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
              segments: [{ type: "free", path: "encoded-stroke" }],
              isComplete: true
            }
          }
        }
      ]);
      expect(notebookWithDrawing.canvasRegions).toEqual([
        {
          pageId: "page_dsa",
          canvasItemId: "canvas_item_sketch",
          bounds: { x: 24, y: 36, width: 180, height: 90 }
        }
      ]);
  });

  it("adds and edits Code Blocks with optional Tags and app-owned Canvas Regions", () => {
    const starterNotebook = createStarterNotebook();
    const dsa = starterNotebook.sections[0];

    if (dsa === undefined) {
      throw new Error("Expected seeded DSA Section.");
    }

    const notebookWithPage = addBlankPage(starterNotebook, dsa.id, "page_dsa");
    const notebookWithCodeBlock = addCodeBlockCanvasItem(
      notebookWithPage,
      "page_dsa",
      "canvas_item_two_sum_code",
      "const seen = new Map();",
      [" arrays ", "arrays", "pseudocode"]
    );
    const editedNotebook = updateCodeBlockCanvasItem(
      notebookWithCodeBlock,
      "canvas_item_two_sum_code",
      "for (const n of nums) {\n  // track complements\n}",
      ["hash map"]
    );

    expect(editedNotebook.canvasItems).toContainEqual({
      id: "canvas_item_two_sum_code",
      pageId: "page_dsa",
      type: "code-block",
      code: "for (const n of nums) {\n  // track complements\n}",
      tags: ["hash map"]
    });
    expect(editedNotebook.canvasRegions).toContainEqual({
      pageId: "page_dsa",
      canvasItemId: "canvas_item_two_sum_code",
      bounds: { x: 0, y: 140, width: 520, height: 220 }
    });
  });

  it("adds Image Items with optional captions, Tags, and app-owned Canvas Regions", () => {
    const starterNotebook = createStarterNotebook();
    const dsa = starterNotebook.sections[0];

    if (dsa === undefined) {
      throw new Error("Expected seeded DSA Section.");
    }

    const notebookWithPage = addBlankPage(starterNotebook, dsa.id, "page_dsa");
    const notebookWithImage = addImageCanvasItem(
      notebookWithPage,
      "page_dsa",
      "canvas_item_heap_screenshot",
      "data:image/png;base64,aGVhcA==",
      "image/png",
      "Heap trace after sift-down",
      [" diagrams ", "diagrams", "heap"]
    );
    const editedNotebook = updateImageCanvasItemMetadata(
      notebookWithImage,
      "canvas_item_heap_screenshot",
      "Updated heap trace",
      ["priority queue"]
    );

    expect(editedNotebook.canvasItems).toContainEqual({
      id: "canvas_item_heap_screenshot",
      pageId: "page_dsa",
      type: "image",
      dataUrl: "data:image/png;base64,aGVhcA==",
      mediaType: "image/png",
      caption: "Updated heap trace",
      tags: ["priority queue"]
    });
    expect(editedNotebook.canvasRegions).toContainEqual({
      pageId: "page_dsa",
      canvasItemId: "canvas_item_heap_screenshot",
      bounds: { x: 0, y: 380, width: 360, height: 240 }
    });
  });

  it("adds and edits Diagram Items with labels, Tags, and app-owned Canvas Regions", () => {
    const starterNotebook = createStarterNotebook();
    const systemDesign = starterNotebook.sections.find(
      (section) => section.title === "System Design"
    );

    if (systemDesign === undefined) {
      throw new Error("Expected seeded System Design Section.");
    }

    const notebookWithPage = addBlankPage(
      starterNotebook,
      systemDesign.id,
      "page_design"
    );
    const notebookWithDiagramItem = addDiagramCanvasItem(
      notebookWithPage,
      "page_design",
      "canvas_item_gateway",
      "box",
      "API Gateway",
      [" system design ", "system design", "routing"]
    );
    const editedNotebook = updateDiagramCanvasItem(
      notebookWithDiagramItem,
      "canvas_item_gateway",
      "sticky-note",
      "API Gateway retries writes",
      ["reliability"]
    );

    expect(editedNotebook.canvasItems).toContainEqual({
      id: "canvas_item_gateway",
      pageId: "page_design",
      type: "diagram",
      kind: "sticky-note",
      label: "API Gateway retries writes",
      tags: ["reliability"]
    });
    expect(editedNotebook.canvasRegions).toContainEqual({
      pageId: "page_design",
      canvasItemId: "canvas_item_gateway",
      bounds: { x: 420, y: 80, width: 220, height: 160 }
    });
  });

  it("rejects blank Pages for unknown Sections", () => {
    expect(() =>
      addBlankPage(createStarterNotebook(), "section_missing", "page_missing")
    ).toThrow("Cannot create a Page in an unknown Section.");
  });

  it("rejects Canvas Items for unknown Pages", () => {
    expect(() =>
      replacePageTextCanvasItems(createStarterNotebook(), "page_missing", [], [])
    ).toThrow("Cannot save Canvas Items for an unknown Page.");
  });

  it("rejects Link Cards for unknown Pages", () => {
    expect(() =>
      addLinkCardCanvasItem(
        createStarterNotebook(),
        "page_missing",
        "canvas_item_missing",
        "https://example.com",
        "",
        []
      )
    ).toThrow("Cannot add a Link Card for an unknown Page.");
  });

  it("rejects Code Blocks for unknown Pages or blank content", () => {
    expect(() =>
      addCodeBlockCanvasItem(
        createStarterNotebook(),
        "page_missing",
        "canvas_item_missing",
        "return true;",
        []
      )
    ).toThrow("Cannot add a Code Block for an unknown Page.");

    const starterNotebook = createStarterNotebook();
    const dsa = starterNotebook.sections[0];

    if (dsa === undefined) {
      throw new Error("Expected seeded DSA Section.");
    }

    expect(() =>
      addCodeBlockCanvasItem(
        addBlankPage(starterNotebook, dsa.id, "page_dsa"),
        "page_dsa",
        "canvas_item_empty",
        "   ",
        []
      )
    ).toThrow("Code Block content cannot be empty.");
  });

  it("rejects Image Items for unknown Pages or non-image data", () => {
    expect(() =>
      addImageCanvasItem(
        createStarterNotebook(),
        "page_missing",
        "canvas_item_missing",
        "data:image/png;base64,aGVhcA==",
        "image/png",
        "",
        []
      )
    ).toThrow("Cannot add an Image Item for an unknown Page.");

    const starterNotebook = createStarterNotebook();
    const dsa = starterNotebook.sections[0];

    if (dsa === undefined) {
      throw new Error("Expected seeded DSA Section.");
    }

    expect(() =>
      addImageCanvasItem(
        addBlankPage(starterNotebook, dsa.id, "page_dsa"),
        "page_dsa",
        "canvas_item_invalid",
        "data:text/plain;base64,aGVhcA==",
        "text/plain",
        "",
        []
      )
    ).toThrow("Image Item media type must be an image.");
  });

  it("rejects Diagram Items for unknown Pages or blank labels", () => {
    expect(() =>
      addDiagramCanvasItem(
        createStarterNotebook(),
        "page_missing",
        "canvas_item_missing",
        "box",
        "Gateway",
        []
      )
    ).toThrow("Cannot add a Diagram Item for an unknown Page.");

    const starterNotebook = createStarterNotebook();
    const systemDesign = starterNotebook.sections.find(
      (section) => section.title === "System Design"
    );

    if (systemDesign === undefined) {
      throw new Error("Expected seeded System Design Section.");
    }

    expect(() =>
      addDiagramCanvasItem(
        addBlankPage(starterNotebook, systemDesign.id, "page_design"),
        "page_design",
        "canvas_item_empty",
        "label",
        "   ",
        []
      )
    ).toThrow("Diagram Item label cannot be empty.");
  });
});
