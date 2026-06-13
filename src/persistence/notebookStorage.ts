import Dexie, { type Table } from "dexie";
import { z } from "zod";
import {
  createStarterNotebook,
  type Notebook,
  type NotebookId,
  type PageId,
  type SectionId
} from "../domain/notebook";

export const NOTEBOOK_SCHEMA_VERSION = 1;
export const DEFAULT_NOTEBOOK_DATABASE_NAME = "interview_prep_notebook";
const NOTEBOOK_RECORD_ID: NotebookId = "notebook_private_interview_prep";

const sectionIdSchema = z.custom<SectionId>(
  (value) => typeof value === "string" && value.startsWith("section_")
);
const pageIdSchema = z.custom<PageId>(
  (value) => typeof value === "string" && value.startsWith("page_")
);

export const notebookSchemaV1 = z.object({
  id: z.literal(NOTEBOOK_RECORD_ID),
  title: z.string().min(1),
  privacyMode: z.literal("private-by-default"),
  sections: z.array(
    z.object({
      id: sectionIdSchema,
      title: z.string().min(1)
    })
  ),
  pages: z.array(
    z.object({
      id: pageIdSchema,
      sectionId: sectionIdSchema,
      title: z.string().min(1),
      pageType: z.null()
    })
  )
}) satisfies z.ZodType<Notebook>;

const notebookRecordSchemaV1 = z.object({
  id: z.literal(NOTEBOOK_RECORD_ID),
  schemaVersion: z.literal(NOTEBOOK_SCHEMA_VERSION),
  notebook: notebookSchemaV1
});

type NotebookRecordV1 = z.infer<typeof notebookRecordSchemaV1>;

class NotebookDatabase extends Dexie {
  notebooks!: Table<NotebookRecordV1, NotebookId>;

  constructor(databaseName: string) {
    super(databaseName);
    this.version(1).stores({
      notebooks: "id"
    });
  }
}

export interface NotebookStore {
  loadNotebook: () => Promise<Notebook>;
  saveNotebook: (notebook: Notebook) => Promise<void>;
  close: () => void;
}

export const createNotebookStore = (
  databaseName = DEFAULT_NOTEBOOK_DATABASE_NAME
): NotebookStore => {
  const database = new NotebookDatabase(databaseName);

  return {
    loadNotebook: async () => {
      const record = await database.notebooks.get(NOTEBOOK_RECORD_ID);

      if (record === undefined) {
        const notebook = createStarterNotebook();
        await database.notebooks.put(toNotebookRecord(notebook));
        return notebook;
      }

      return notebookRecordSchemaV1.parse(record).notebook;
    },
    saveNotebook: async (notebook) => {
      await database.notebooks.put(toNotebookRecord(notebook));
    },
    close: () => {
      database.close();
    }
  };
};

export const deleteNotebookDatabase = async (
  databaseName = DEFAULT_NOTEBOOK_DATABASE_NAME
) => {
  await Dexie.delete(databaseName);
};

const toNotebookRecord = (notebook: Notebook): NotebookRecordV1 =>
  notebookRecordSchemaV1.parse({
    id: NOTEBOOK_RECORD_ID,
    schemaVersion: NOTEBOOK_SCHEMA_VERSION,
    notebook
  });
