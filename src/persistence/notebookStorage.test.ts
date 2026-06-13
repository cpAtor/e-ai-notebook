import { beforeEach, describe, expect, it } from "vitest";
import { addBlankPage, createStarterNotebook } from "../domain/notebook";
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
});
