import { beforeEach, describe, expect, it } from "vitest";
import { addBlankPage, createStarterNotebook } from "../domain/notebook";
import {
  createNotebookStore,
  deleteNotebookDatabase,
  notebookSchemaV1
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
    expect(() => notebookSchemaV1.parse(createStarterNotebook())).not.toThrow();
    expect(() =>
      notebookSchemaV1.parse({
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
});
