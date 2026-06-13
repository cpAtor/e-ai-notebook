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
  readonly tags: readonly string[];
}

export interface LinkCardCanvasItem {
  readonly id: CanvasItemId;
  readonly pageId: PageId;
  readonly type: "link-card";
  readonly url: string;
  readonly note: string;
  readonly tags: readonly string[];
}

export type CanvasItem = TextCanvasItem | LinkCardCanvasItem;

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
  readonly canvasItems: readonly CanvasItem[];
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
  const previousPageTextItemIds = new Set(
    notebook.canvasItems
      .filter(
        (canvasItem) => canvasItem.pageId === pageId && canvasItem.type === "text"
      )
      .map((canvasItem) => canvasItem.id)
  );

  if (!pageExists) {
    throw new Error("Cannot save Canvas Items for an unknown Page.");
  }

  return {
    ...notebook,
    canvasItems: [
      ...notebook.canvasItems.filter(
        (canvasItem) => canvasItem.pageId !== pageId || canvasItem.type !== "text"
      ),
      ...nextTextItems.map((nextTextItem) => {
        const previousTextItem = notebook.canvasItems.find(
          (canvasItem): canvasItem is TextCanvasItem =>
            canvasItem.id === nextTextItem.id && canvasItem.type === "text"
        );

        return {
          ...nextTextItem,
          tags:
            nextTextItem.tags.length > 0
              ? normalizeTags(nextTextItem.tags)
              : (previousTextItem?.tags ?? [])
        };
      })
    ],
    canvasRegions: [
      ...notebook.canvasRegions.filter(
        (region) =>
          region.pageId !== pageId ||
          !previousPageTextItemIds.has(region.canvasItemId)
      ),
      ...nextRegions
    ]
  };
};

export const updateTextCanvasItemTags = (
  notebook: Notebook,
  canvasItemId: CanvasItemId,
  nextTags: readonly string[]
): Notebook => {
  const textItemExists = notebook.canvasItems.some(
    (canvasItem) => canvasItem.id === canvasItemId && canvasItem.type === "text"
  );

  if (!textItemExists) {
    throw new Error("Cannot tag an unknown Text Canvas Item.");
  }

  return {
    ...notebook,
    canvasItems: notebook.canvasItems.map((canvasItem) =>
      canvasItem.id === canvasItemId
        ? { ...canvasItem, tags: normalizeTags(nextTags) }
        : canvasItem
    )
  };
};

export const addLinkCardCanvasItem = (
  notebook: Notebook,
  pageId: PageId,
  canvasItemId: CanvasItemId,
  url: string,
  note: string,
  tags: readonly string[]
): Notebook => {
  const pageExists = notebook.pages.some((page) => page.id === pageId);

  if (!pageExists) {
    throw new Error("Cannot add a Link Card for an unknown Page.");
  }

  return {
    ...notebook,
    canvasItems: [
      ...notebook.canvasItems,
      {
        id: canvasItemId,
        pageId,
        type: "link-card",
        url: normalizeLinkCardUrl(url),
        note: note.trim(),
        tags: normalizeTags(tags)
      }
    ],
    canvasRegions: [
      ...notebook.canvasRegions,
      {
        pageId,
        canvasItemId,
        bounds: { x: 0, y: 0, width: 320, height: 120 }
      }
    ]
  };
};

export const updateLinkCardCanvasItemTags = (
  notebook: Notebook,
  canvasItemId: CanvasItemId,
  nextTags: readonly string[]
): Notebook => {
  const linkCardExists = notebook.canvasItems.some(
    (canvasItem) => canvasItem.id === canvasItemId && canvasItem.type === "link-card"
  );

  if (!linkCardExists) {
    throw new Error("Cannot tag an unknown Link Card.");
  }

  return {
    ...notebook,
    canvasItems: notebook.canvasItems.map((canvasItem) =>
      canvasItem.id === canvasItemId && canvasItem.type === "link-card"
        ? { ...canvasItem, tags: normalizeTags(nextTags) }
        : canvasItem
    )
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

export const createCanvasItemId = (): CanvasItemId => {
  if (globalThis.crypto?.randomUUID !== undefined) {
    return `canvas_item_${globalThis.crypto.randomUUID()}`;
  }

  return `canvas_item_${Date.now().toString(36)}`;
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

export const normalizeTags = (tags: readonly string[]): readonly string[] => {
  const normalizedTags = tags
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);

  return [...new Set(normalizedTags)];
};

const normalizeLinkCardUrl = (url: string): string => {
  const parsedUrl = new URL(url.trim());

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error("Link Card URL must use http or https.");
  }

  return parsedUrl.toString();
};
