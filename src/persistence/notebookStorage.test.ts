import { beforeEach, describe, expect, it } from "vitest";
import {
  addCodeBlockCanvasItem,
  addDiagramCanvasItem,
  addImageCanvasItem,
  addBlankPage,
  addLinkCardCanvasItem,
  createStarterNotebook,
  replacePageCanvasItems
} from "../domain/notebook";
import {
  createNotebookStore,
  deleteNotebookDatabase,
  notebookSchemaV1,
  notebookSchemaV2
} from "./notebookStorage";

const databaseName = "notebook-storage-test";

describe("Notebook storage", () => {
  beforeEach(async () => {
    await deleteNotebookDatabase(databaseName);
  });

  it("creates and reloads a versioned Notebook through IndexedDB", async () => {
    const store = createNotebookStore(databaseName);
    const notebook = await store.loadNotebook();
    const dsa = notebook.sections[0];

    if (dsa === undefined) {
      throw new Error("Expected seeded DSA Section.");
    }

    const notebookWithPage = addBlankPage(notebook, dsa.id, "page_reload_safe");
    await store.saveNotebook(notebookWithPage);
    store.close();

    const reloadedStore = createNotebookStore(databaseName);

    await expect(reloadedStore.loadNotebook()).resolves.toEqual(notebookWithPage);
    reloadedStore.close();
  });

  it("keeps the first persisted schema strict and versionable", () => {
    expect(() =>
      notebookSchemaV1.parse({
        id: "notebook_private_interview_prep",
        title: "Interview Prep Notebook",
        privacyMode: "private-by-default",
        sections: createStarterNotebook().sections,
        pages: []
      })
    ).not.toThrow();
    expect(() => notebookSchemaV2.parse(createStarterNotebook())).not.toThrow();
    expect(() =>
      notebookSchemaV2.parse({
        ...createStarterNotebook(),
        pages: [
          {
            id: "page_invalid",
            sectionId: "section_dsa",
            title: "Invalid",
            pageType: "template"
          }
        ]
      })
    ).toThrow();
  });

  it("migrates v1 Notebook records to v2 canvas source arrays on save", async () => {
    const store = createNotebookStore(databaseName);
    const notebook = await store.loadNotebook();

    expect(notebook.canvasItems).toEqual([]);
    expect(notebook.canvasRegions).toEqual([]);

    await store.saveNotebook(notebook);
    await expect(store.loadNotebook()).resolves.toEqual(notebook);
    store.close();
  });

  it("persists Link Card source data through the versioned Notebook schema", async () => {
    const store = createNotebookStore(databaseName);
    const notebook = await store.loadNotebook();
    const research = notebook.sections.find((section) => section.title === "Research");

    if (research === undefined) {
      throw new Error("Expected seeded Research Section.");
    }

    const notebookWithPage = addBlankPage(notebook, research.id, "page_research");
    const notebookWithLinkCard = addLinkCardCanvasItem(
      notebookWithPage,
      "page_research",
      "canvas_item_link_card",
      "https://example.com/system-design",
      "Distributed cache reference",
      ["cache"]
    );

    await store.saveNotebook(notebookWithLinkCard);

    await expect(store.loadNotebook()).resolves.toEqual(notebookWithLinkCard);
    expect(() => notebookSchemaV2.parse(notebookWithLinkCard)).not.toThrow();
    store.close();
  });

  it("persists Code Block source data through the versioned Notebook schema", async () => {
    const store = createNotebookStore(databaseName);
    const notebook = await store.loadNotebook();
    const dsa = notebook.sections[0];

    if (dsa === undefined) {
      throw new Error("Expected seeded DSA Section.");
    }

    const notebookWithPage = addBlankPage(notebook, dsa.id, "page_dsa");
    const notebookWithCodeBlock = addCodeBlockCanvasItem(
      notebookWithPage,
      "page_dsa",
      "canvas_item_code_block",
      "function dfs(node) { return node.value; }",
      ["trees"]
    );

    await store.saveNotebook(notebookWithCodeBlock);

    await expect(store.loadNotebook()).resolves.toEqual(notebookWithCodeBlock);
    expect(() => notebookSchemaV2.parse(notebookWithCodeBlock)).not.toThrow();
    store.close();
  });

  it("persists Image Item source data through the versioned Notebook schema", async () => {
    const store = createNotebookStore(databaseName);
    const notebook = await store.loadNotebook();
    const systemDesign = notebook.sections.find(
      (section) => section.title === "System Design"
    );

    if (systemDesign === undefined) {
      throw new Error("Expected seeded System Design Section.");
    }

    const notebookWithPage = addBlankPage(notebook, systemDesign.id, "page_design");
    const notebookWithImage = addImageCanvasItem(
      notebookWithPage,
      "page_design",
      "canvas_item_image",
      "data:image/png;base64,ZGlhZ3JhbQ==",
      "image/png",
      "Cache invalidation sketch",
      ["cache"]
    );

    await store.saveNotebook(notebookWithImage);

    await expect(store.loadNotebook()).resolves.toEqual(notebookWithImage);
    expect(() => notebookSchemaV2.parse(notebookWithImage)).not.toThrow();
    store.close();
  });

  it("persists Diagram Item source data through the versioned Notebook schema", async () => {
    const store = createNotebookStore(databaseName);
    const notebook = await store.loadNotebook();
    const systemDesign = notebook.sections.find(
      (section) => section.title === "System Design"
    );

    if (systemDesign === undefined) {
      throw new Error("Expected seeded System Design Section.");
    }

    const notebookWithPage = addBlankPage(notebook, systemDesign.id, "page_design");
    const notebookWithDiagramItem = addDiagramCanvasItem(
      notebookWithPage,
      "page_design",
      "canvas_item_gateway",
      "box",
      "API Gateway",
      ["routing"]
    );

    await store.saveNotebook(notebookWithDiagramItem);

    await expect(store.loadNotebook()).resolves.toEqual(notebookWithDiagramItem);
    expect(() => notebookSchemaV2.parse(notebookWithDiagramItem)).not.toThrow();
    store.close();
  });

  it("persists Freehand Drawing source data through the versioned Notebook schema", async () => {
    const store = createNotebookStore(databaseName);
    const notebook = await store.loadNotebook();
    const dsa = notebook.sections[0];

    if (dsa === undefined) {
      throw new Error("Expected seeded DSA Section.");
    }

    const notebookWithDrawing = replacePageCanvasItems(
      addBlankPage(notebook, dsa.id, "page_dsa"),
      "page_dsa",
      [],
      [
        {
          id: "canvas_item_sketch",
          pageId: "page_dsa",
          type: "freehand-drawing",
          shape: {
            type: "draw",
            x: 20,
            y: 40,
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
          bounds: { x: 20, y: 40, width: 160, height: 80 }
        }
      ]
    );

    await store.saveNotebook(notebookWithDrawing);

    await expect(store.loadNotebook()).resolves.toEqual(notebookWithDrawing);
    expect(() => notebookSchemaV2.parse(notebookWithDrawing)).not.toThrow();
    store.close();
  });
});
