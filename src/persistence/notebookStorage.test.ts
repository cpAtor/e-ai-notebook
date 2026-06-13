import { beforeEach, describe, expect, it } from "vitest";
import Dexie from "dexie";
import {
  addCodeBlockCanvasItem,
  addDiagramCanvasItem,
  addImageCanvasItem,
  addBlankPage,
  addLinkCardCanvasItem,
  addSection,
  createStarterNotebook,
  replacePageCanvasItems,
  replacePageTextCanvasItems
} from "../domain/notebook";
import { buildLocalIndex } from "../domain/localIndex";
import {
  createNotebookExport,
  createNotebookStore,
  deleteNotebookDatabase,
  NotebookConflictError,
  NotebookRecoveryError,
  parseNotebookExport,
  notebookSchemaV1,
  notebookSchemaV2,
  serializeNotebookExport
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

  it("rejects stale saves after another store writes a newer Notebook revision", async () => {
    const firstTabStore = createNotebookStore(databaseName);
    const firstTabNotebook = await firstTabStore.loadNotebook();
    const secondTabStore = createNotebookStore(databaseName);
    const secondTabNotebook = await secondTabStore.loadNotebook();
    const externallySavedNotebook = addSection(
      secondTabNotebook,
      "section_external",
      "External prep"
    );
    const staleNotebook = addSection(
      firstTabNotebook,
      "section_stale",
      "Stale prep"
    );

    await secondTabStore.saveNotebook(externallySavedNotebook);

    await expect(firstTabStore.saveNotebook(staleNotebook)).rejects.toBeInstanceOf(
      NotebookConflictError
    );
    await expect(firstTabStore.loadNotebook()).resolves.toEqual(
      externallySavedNotebook
    );
    firstTabStore.close();
    secondTabStore.close();
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

  it("surfaces invalid stored Notebook data as a recoverable raw payload", async () => {
    const rawRecord = {
      id: "notebook_private_interview_prep",
      schemaVersion: 2,
      notebook: {
        ...createStarterNotebook(),
        pages: [
          {
            id: "page_invalid",
            sectionId: "section_dsa",
            title: "Invalid",
            pageType: "template"
          }
        ]
      }
    };
    const database = new Dexie(databaseName);
    database.version(1).stores({ notebooks: "id" });
    await database.table("notebooks").put(rawRecord);
    database.close();
    const store = createNotebookStore(databaseName);

    await expect(store.loadNotebook()).rejects.toBeInstanceOf(
      NotebookRecoveryError
    );
    await expect(store.loadRawNotebookPayload()).resolves.toContain(
      '"pageType": "template"'
    );
    store.close();
  });

  it("persists Link Card source data through the versioned Notebook schema", async () => {
    const store = createNotebookStore(databaseName);
    const notebook = await store.loadNotebook();
    const inboxSection = notebook.sections[0];

    if (inboxSection === undefined) {
      throw new Error("Expected seeded Inbox Section.");
    }

    const notebookWithPage = addBlankPage(notebook, inboxSection.id, "page_research");
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
    const inboxSection = notebook.sections[0];

    if (inboxSection === undefined) {
      throw new Error("Expected seeded Inbox Section.");
    }

    const notebookWithPage = addBlankPage(notebook, inboxSection.id, "page_design");
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
    const inboxSection = notebook.sections[0];

    if (inboxSection === undefined) {
      throw new Error("Expected seeded Inbox Section.");
    }

    const notebookWithPage = addBlankPage(notebook, inboxSection.id, "page_design");
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

  it("exports and imports all MVP Canvas Item types without stale derived state", () => {
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
          bounds: { x: 10, y: 20, width: 240, height: 80 }
        }
      ]
    );
    const notebookWithDrawing = replacePageCanvasItems(
      notebookWithText,
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
          id: "canvas_item_sketch",
          pageId: "page_dsa",
          type: "freehand-drawing",
          shape: {
            type: "draw",
            x: 32,
            y: 48,
            rotation: 0,
            props: {
              segments: [{ type: "free", path: "encoded-stroke" }]
            }
          }
        }
      ],
      [
        {
          pageId: "page_dsa",
          canvasItemId: "canvas_item_trace",
          bounds: { x: 10, y: 20, width: 240, height: 80 }
        },
        {
          pageId: "page_dsa",
          canvasItemId: "canvas_item_sketch",
          bounds: { x: 32, y: 48, width: 120, height: 72 }
        }
      ]
    );
    const notebookWithLink = addLinkCardCanvasItem(
      notebookWithDrawing,
      "page_dsa",
      "canvas_item_link",
      "https://example.com/two-sum",
      "Practice prompt",
      ["practice"]
    );
    const notebookWithCode = addCodeBlockCanvasItem(
      notebookWithLink,
      "page_dsa",
      "canvas_item_code",
      "const seen = new Map();",
      ["hash map"]
    );
    const notebookWithImage = addImageCanvasItem(
      notebookWithCode,
      "page_dsa",
      "canvas_item_image",
      "data:image/png;base64,aGVhcA==",
      "image/png",
      "Heap sketch",
      ["heap"]
    );
    const notebookWithDiagram = addDiagramCanvasItem(
      notebookWithImage,
      "page_dsa",
      "canvas_item_diagram",
      "box",
      "API Gateway",
      ["system design"]
    );

    const serializedExport = serializeNotebookExport(
      notebookWithDiagram,
      new Date("2026-06-13T00:00:00.000Z")
    );
    const parsedExport = JSON.parse(serializedExport) as ReturnType<
      typeof createNotebookExport
    >;

    expect(parsedExport).toEqual({
      schemaVersion: 2,
      exportedAt: "2026-06-13T00:00:00.000Z",
      notebook: notebookWithDiagram
    });
    expect(parsedExport.notebook.canvasItems.map((canvasItem) => canvasItem.type)).toEqual([
      "text",
      "freehand-drawing",
      "link-card",
      "code-block",
      "image",
      "diagram"
    ]);
    expect(parsedExport.notebook.canvasRegions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ canvasItemId: "canvas_item_trace" }),
        expect.objectContaining({ canvasItemId: "canvas_item_sketch" }),
        expect.objectContaining({ canvasItemId: "canvas_item_link" }),
        expect.objectContaining({ canvasItemId: "canvas_item_code" }),
        expect.objectContaining({ canvasItemId: "canvas_item_image" }),
        expect.objectContaining({ canvasItemId: "canvas_item_diagram" })
      ])
    );

    const importedNotebook = parseNotebookExport(
      JSON.stringify({
        ...parsedExport,
        credentials: { providerToken: "must-not-import" },
        localIndex: [{ id: "stale:index-entry" }]
      })
    );
    const rebuiltIndex = buildLocalIndex(importedNotebook);

    expect(importedNotebook).toEqual(notebookWithDiagram);
    expect(rebuiltIndex.map((entry) => entry.id)).toEqual(
      expect.arrayContaining([
        "page:page_dsa",
        "text:canvas_item_trace",
        "link-card:canvas_item_link",
        "code-block:canvas_item_code",
        "image:canvas_item_image",
        "diagram:canvas_item_diagram"
      ])
    );
    expect(rebuiltIndex).not.toContainEqual(
      expect.objectContaining({ id: "stale:index-entry" })
    );
  });
});
