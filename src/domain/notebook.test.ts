import { describe, expect, it } from "vitest";
import {
  addBlankPage,
  addSection,
  createStarterNotebook,
  replacePageTextCanvasItems,
  removeSection,
  renameSection,
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

    expect(notebookWithTags.canvasItems[0]?.tags).toEqual([
      "arrays",
      "binary search"
    ]);
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
});
