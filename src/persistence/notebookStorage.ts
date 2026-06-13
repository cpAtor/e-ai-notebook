import Dexie, { type Table } from "dexie";
import { z } from "zod";
import {
  createStarterNotebook,
  type CanvasItemId,
  type Notebook,
  type NotebookId,
  type PageId,
  type SectionId
} from "../domain/notebook";

export const NOTEBOOK_SCHEMA_VERSION = 2;
export const DEFAULT_NOTEBOOK_DATABASE_NAME = "interview_prep_notebook";
const NOTEBOOK_RECORD_ID: NotebookId = "notebook_private_interview_prep";
const NOTEBOOK_EXPORT_FILE_NAME = "interview-prep-notebook-export.json";

const sectionIdSchema = z.custom<SectionId>(
  (value) => typeof value === "string" && value.startsWith("section_")
);
const pageIdSchema = z.custom<PageId>(
  (value) => typeof value === "string" && value.startsWith("page_")
);
const canvasItemIdSchema = z.custom<CanvasItemId>(
  (value) => typeof value === "string" && value.startsWith("canvas_item_")
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
});

export const notebookSchemaV2 = notebookSchemaV1.extend({
  canvasItems: z
    .array(
      z.discriminatedUnion("type", [
        z.object({
          id: canvasItemIdSchema,
          pageId: pageIdSchema,
          type: z.literal("text"),
          text: z.string(),
          tags: z.array(z.string()).default([])
        }),
        z.object({
          id: canvasItemIdSchema,
          pageId: pageIdSchema,
          type: z.literal("link-card"),
          url: z.string().url(),
          note: z.string().default(""),
          tags: z.array(z.string()).default([])
        }),
        z.object({
          id: canvasItemIdSchema,
          pageId: pageIdSchema,
          type: z.literal("code-block"),
          code: z.string(),
          tags: z.array(z.string()).default([])
        }),
        z.object({
          id: canvasItemIdSchema,
          pageId: pageIdSchema,
          type: z.literal("image"),
          dataUrl: z.string().startsWith("data:image/"),
          mediaType: z.string().startsWith("image/"),
          caption: z.string().default(""),
          tags: z.array(z.string()).default([])
        }),
        z.object({
          id: canvasItemIdSchema,
          pageId: pageIdSchema,
          type: z.literal("diagram"),
          kind: z.enum(["box", "arrow", "label", "sticky-note"]),
          label: z.string().min(1),
          tags: z.array(z.string()).default([])
        }),
        z.object({
          id: canvasItemIdSchema,
          pageId: pageIdSchema,
          type: z.literal("freehand-drawing"),
          shape: z.object({
            type: z.literal("draw"),
            x: z.number(),
            y: z.number(),
            rotation: z.number().default(0),
            props: z.record(z.string(), z.unknown())
          })
        })
      ])
    )
    .default([]),
  canvasRegions: z
    .array(
      z.object({
        pageId: pageIdSchema,
        canvasItemId: canvasItemIdSchema,
        bounds: z.object({
          x: z.number(),
          y: z.number(),
          width: z.number().nonnegative(),
          height: z.number().nonnegative()
        })
      })
    )
    .default([])
}) satisfies z.ZodType<Notebook>;

const notebookRecordSchemaV1 = z.object({
  id: z.literal(NOTEBOOK_RECORD_ID),
  schemaVersion: z.literal(1),
  notebook: notebookSchemaV1
});

const notebookRecordSchemaV2 = z.object({
  id: z.literal(NOTEBOOK_RECORD_ID),
  schemaVersion: z.literal(NOTEBOOK_SCHEMA_VERSION),
  notebook: notebookSchemaV2
});

const notebookExportSchemaV1 = z.object({
  schemaVersion: z.literal(1),
  exportedAt: z.string().datetime(),
  notebook: notebookSchemaV1
});

const notebookExportSchemaV2 = z.object({
  schemaVersion: z.literal(NOTEBOOK_SCHEMA_VERSION),
  exportedAt: z.string().datetime(),
  notebook: notebookSchemaV2
});

type NotebookRecordV2 = z.infer<typeof notebookRecordSchemaV2>;
export type NotebookExport = z.infer<typeof notebookExportSchemaV2>;

class NotebookDatabase extends Dexie {
  notebooks!: Table<NotebookRecordV2, NotebookId>;

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

      return parseNotebookRecord(record).notebook;
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

export const createNotebookExport = (
  notebook: Notebook,
  exportedAt = new Date()
): NotebookExport =>
  notebookExportSchemaV2.parse({
    schemaVersion: NOTEBOOK_SCHEMA_VERSION,
    exportedAt: exportedAt.toISOString(),
    notebook
  });

export const serializeNotebookExport = (
  notebook: Notebook,
  exportedAt?: Date
): string => JSON.stringify(createNotebookExport(notebook, exportedAt), null, 2);

export const parseNotebookExport = (rawExport: string): Notebook => {
  const payload = JSON.parse(rawExport) as unknown;
  const versionedExport = z
    .object({ schemaVersion: z.union([z.literal(1), z.literal(2)]) })
    .passthrough()
    .parse(payload);

  if (versionedExport.schemaVersion === 1) {
    const v1Export = notebookExportSchemaV1.parse(payload);

    return migrateNotebookV1ToCurrent(v1Export.notebook);
  }

  return notebookExportSchemaV2.parse(payload).notebook;
};

export const notebookExportFileName = (): string => NOTEBOOK_EXPORT_FILE_NAME;

const parseNotebookRecord = (record: unknown): NotebookRecordV2 => {
  const versionedRecord = z
    .object({ schemaVersion: z.union([z.literal(1), z.literal(2)]) })
    .passthrough()
    .parse(record);

  if (versionedRecord.schemaVersion === 1) {
    const v1Record = notebookRecordSchemaV1.parse(record);

    return toNotebookRecord(migrateNotebookV1ToCurrent(v1Record.notebook));
  }

  return notebookRecordSchemaV2.parse(record);
};

const migrateNotebookV1ToCurrent = (
  notebook: z.infer<typeof notebookSchemaV1>
): Notebook => ({
  ...notebook,
  canvasItems: [],
  canvasRegions: []
});

const toNotebookRecord = (notebook: Notebook): NotebookRecordV2 =>
  notebookRecordSchemaV2.parse({
    id: NOTEBOOK_RECORD_ID,
    schemaVersion: NOTEBOOK_SCHEMA_VERSION,
    notebook
  });
