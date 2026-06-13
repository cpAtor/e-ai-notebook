export type NotebookId = "notebook_private_interview_prep";
export type SectionId = `section_${string}`;
export type PageId = `page_${string}`;
export type CanvasItemId = `canvas_item_${string}`;

export interface CanvasBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface TextCanvasItem {
  readonly id: CanvasItemId;
  readonly pageId: PageId;
  readonly type: "text";
  readonly text: string;
}

export interface CanvasRegion {
  readonly pageId: PageId;
  readonly canvasItemId: CanvasItemId;
  readonly bounds: CanvasBounds;
}

export interface Page {
  readonly id: PageId;
  readonly sectionId: SectionId;
  readonly title: string;
  readonly pageType: null;
}

export interface Section {
  readonly id: SectionId;
  readonly title: string;
}

export interface Notebook {
  readonly id: NotebookId;
  readonly title: string;
  readonly privacyMode: "private-by-default";
  readonly sections: readonly Section[];
  readonly pages: readonly Page[];
  readonly canvasItems: readonly TextCanvasItem[];
  readonly canvasRegions: readonly CanvasRegion[];
}

export const STARTER_SECTION_TITLES = [
  "DSA",
  "System Design",
  "Research"
] as const;

export const createStarterNotebook = (): Notebook => ({
  id: "notebook_private_interview_prep",
  title: "Interview Prep Notebook",
  privacyMode: "private-by-default",
  sections: STARTER_SECTION_TITLES.map((title) => ({
    id: sectionIdFromTitle(title),
    title
  })),
  pages: [],
  canvasItems: [],
  canvasRegions: []
});

export const renameSection = (
  notebook: Notebook,
  sectionId: SectionId,
  nextTitle: string
): Notebook => {
  const title = normalizeSectionTitle(nextTitle);

  return {
    ...notebook,
    sections: notebook.sections.map((section) =>
      section.id === sectionId ? { ...section, title } : section
    )
  };
};

export const addSection = (
  notebook: Notebook,
  sectionId: SectionId,
  title: string
): Notebook => ({
  ...notebook,
  sections: [
    ...notebook.sections,
    {
      id: sectionId,
      title: normalizeSectionTitle(title)
    }
  ]
});

export const removeSection = (
  notebook: Notebook,
  sectionId: SectionId
): Notebook => {
  const removedPageIds = new Set(
    notebook.pages
      .filter((page) => page.sectionId === sectionId)
      .map((page) => page.id)
  );

  return {
    ...notebook,
    sections: notebook.sections.filter((section) => section.id !== sectionId),
    pages: notebook.pages.filter((page) => page.sectionId !== sectionId),
    canvasItems: notebook.canvasItems.filter(
      (canvasItem) => !removedPageIds.has(canvasItem.pageId)
    ),
    canvasRegions: notebook.canvasRegions.filter(
      (region) => !removedPageIds.has(region.pageId)
    )
  };
};

export const addBlankPage = (
  notebook: Notebook,
  sectionId: SectionId,
  pageId: PageId
): Notebook => {
  const sectionExists = notebook.sections.some((section) => section.id === sectionId);

  if (!sectionExists) {
    throw new Error("Cannot create a Page in an unknown Section.");
  }

  return {
    ...notebook,
    pages: [
      ...notebook.pages,
      {
        id: pageId,
        sectionId,
        title: "Untitled Page",
        pageType: null
      }
    ]
  };
};

export const getSection = (
  notebook: Notebook,
  sectionId: SectionId
): Section | undefined =>
  notebook.sections.find((section) => section.id === sectionId);

export const getPage = (
  notebook: Notebook,
  pageId: PageId
): Page | undefined => notebook.pages.find((page) => page.id === pageId);

export const replacePageTextCanvasItems = (
  notebook: Notebook,
  pageId: PageId,
  nextTextItems: readonly TextCanvasItem[],
  nextRegions: readonly CanvasRegion[]
): Notebook => {
  const pageExists = notebook.pages.some((page) => page.id === pageId);

  if (!pageExists) {
    throw new Error("Cannot save Canvas Items for an unknown Page.");
  }

  return {
    ...notebook,
    canvasItems: [
      ...notebook.canvasItems.filter((canvasItem) => canvasItem.pageId !== pageId),
      ...nextTextItems
    ],
    canvasRegions: [
      ...notebook.canvasRegions.filter((region) => region.pageId !== pageId),
      ...nextRegions
    ]
  };
};

export const createSectionId = (): SectionId => {
  if (globalThis.crypto?.randomUUID !== undefined) {
    return `section_${globalThis.crypto.randomUUID()}`;
  }

  return `section_${Date.now().toString(36)}`;
};

export const createPageId = (): PageId => {
  if (globalThis.crypto?.randomUUID !== undefined) {
    return `page_${globalThis.crypto.randomUUID()}`;
  }

  return `page_${Date.now().toString(36)}`;
};

const sectionIdFromTitle = (title: string): SectionId =>
  `section_${title.toLowerCase().replaceAll(" ", "_")}`;

const normalizeSectionTitle = (title: string): string => {
  const trimmedTitle = title.trim();

  if (trimmedTitle.length === 0) {
    throw new Error("Section title cannot be empty.");
  }

  return trimmedTitle;
};
