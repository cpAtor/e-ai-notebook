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

export interface CodeBlockCanvasItem {
  readonly id: CanvasItemId;
  readonly pageId: PageId;
  readonly type: "code-block";
  readonly code: string;
  readonly tags: readonly string[];
}

export interface ImageCanvasItem {
  readonly id: CanvasItemId;
  readonly pageId: PageId;
  readonly type: "image";
  readonly dataUrl: string;
  readonly mediaType: string;
  readonly caption: string;
  readonly tags: readonly string[];
}

export interface FreehandDrawingShape {
  readonly type: "draw";
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
  readonly props: Readonly<Record<string, unknown>>;
}

export interface FreehandDrawingCanvasItem {
  readonly id: CanvasItemId;
  readonly pageId: PageId;
  readonly type: "freehand-drawing";
  readonly shape: FreehandDrawingShape;
}

export type DiagramItemKind = "box" | "arrow" | "label" | "sticky-note";

export interface DiagramCanvasItem {
  readonly id: CanvasItemId;
  readonly pageId: PageId;
  readonly type: "diagram";
  readonly kind: DiagramItemKind;
  readonly label: string;
  readonly tags: readonly string[];
}

export type CanvasItem =
  | TextCanvasItem
  | LinkCardCanvasItem
  | CodeBlockCanvasItem
  | ImageCanvasItem
  | FreehandDrawingCanvasItem
  | DiagramCanvasItem;

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

export const STARTER_INBOX_SECTION_ID: SectionId = "section_inbox";
export const STARTER_DEFAULT_PAGE_ID: PageId = "page_default";

export const createStarterNotebook = (): Notebook => ({
  id: "notebook_private_interview_prep",
  title: "Interview Prep Notebook",
  privacyMode: "private-by-default",
  sections: [{ id: STARTER_INBOX_SECTION_ID, title: "Inbox" }],
  pages: [
    {
      id: STARTER_DEFAULT_PAGE_ID,
      sectionId: STARTER_INBOX_SECTION_ID,
      title: "Default Page",
      pageType: null
    }
  ],
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
): Notebook =>
  replacePageCanvasItems(notebook, pageId, nextTextItems, [], nextRegions);

export const replacePageCanvasItems = (
  notebook: Notebook,
  pageId: PageId,
  nextTextItems: readonly TextCanvasItem[],
  nextFreehandDrawingItems: readonly FreehandDrawingCanvasItem[],
  nextRegions: readonly CanvasRegion[]
): Notebook => {
  const pageExists = notebook.pages.some((page) => page.id === pageId);
  const previousPageTldrawItemIds = new Set(
    notebook.canvasItems
      .filter(
        (canvasItem) =>
          canvasItem.pageId === pageId &&
          (canvasItem.type === "text" || canvasItem.type === "freehand-drawing")
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
        (canvasItem) =>
          canvasItem.pageId !== pageId ||
          (canvasItem.type !== "text" && canvasItem.type !== "freehand-drawing")
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
      }),
      ...nextFreehandDrawingItems
    ],
    canvasRegions: [
      ...notebook.canvasRegions.filter(
        (region) =>
          region.pageId !== pageId ||
          !previousPageTldrawItemIds.has(region.canvasItemId)
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

export const updateLinkCardCanvasItemMetadata = (
  notebook: Notebook,
  canvasItemId: CanvasItemId,
  note: string,
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
        ? { ...canvasItem, note: note.trim(), tags: normalizeTags(nextTags) }
        : canvasItem
    )
  };
};

export const addCodeBlockCanvasItem = (
  notebook: Notebook,
  pageId: PageId,
  canvasItemId: CanvasItemId,
  code: string,
  tags: readonly string[]
): Notebook => {
  const pageExists = notebook.pages.some((page) => page.id === pageId);
  const normalizedCode = normalizeCodeBlockCode(code);

  if (!pageExists) {
    throw new Error("Cannot add a Code Block for an unknown Page.");
  }

  return {
    ...notebook,
    canvasItems: [
      ...notebook.canvasItems,
      {
        id: canvasItemId,
        pageId,
        type: "code-block",
        code: normalizedCode,
        tags: normalizeTags(tags)
      }
    ],
    canvasRegions: [
      ...notebook.canvasRegions,
      {
        pageId,
        canvasItemId,
        bounds: { x: 0, y: 140, width: 520, height: 220 }
      }
    ]
  };
};

export const updateCodeBlockCanvasItem = (
  notebook: Notebook,
  canvasItemId: CanvasItemId,
  code: string,
  nextTags: readonly string[]
): Notebook => {
  const normalizedCode = normalizeCodeBlockCode(code);
  const codeBlockExists = notebook.canvasItems.some(
    (canvasItem) => canvasItem.id === canvasItemId && canvasItem.type === "code-block"
  );

  if (!codeBlockExists) {
    throw new Error("Cannot edit an unknown Code Block.");
  }

  return {
    ...notebook,
    canvasItems: notebook.canvasItems.map((canvasItem) =>
      canvasItem.id === canvasItemId && canvasItem.type === "code-block"
        ? {
            ...canvasItem,
            code: normalizedCode,
            tags: normalizeTags(nextTags)
          }
        : canvasItem
    )
  };
};

export const addImageCanvasItem = (
  notebook: Notebook,
  pageId: PageId,
  canvasItemId: CanvasItemId,
  dataUrl: string,
  mediaType: string,
  caption: string,
  tags: readonly string[]
): Notebook => {
  const pageExists = notebook.pages.some((page) => page.id === pageId);

  if (!pageExists) {
    throw new Error("Cannot add an Image Item for an unknown Page.");
  }

  return {
    ...notebook,
    canvasItems: [
      ...notebook.canvasItems,
      {
        id: canvasItemId,
        pageId,
        type: "image",
        dataUrl: normalizeImageDataUrl(dataUrl, mediaType),
        mediaType: normalizeImageMediaType(mediaType),
        caption: caption.trim(),
        tags: normalizeTags(tags)
      }
    ],
    canvasRegions: [
      ...notebook.canvasRegions,
      {
        pageId,
        canvasItemId,
        bounds: { x: 0, y: 380, width: 360, height: 240 }
      }
    ]
  };
};

export const updateImageCanvasItemMetadata = (
  notebook: Notebook,
  canvasItemId: CanvasItemId,
  caption: string,
  nextTags: readonly string[]
): Notebook => {
  const imageItemExists = notebook.canvasItems.some(
    (canvasItem) => canvasItem.id === canvasItemId && canvasItem.type === "image"
  );

  if (!imageItemExists) {
    throw new Error("Cannot edit an unknown Image Item.");
  }

  return {
    ...notebook,
    canvasItems: notebook.canvasItems.map((canvasItem) =>
      canvasItem.id === canvasItemId && canvasItem.type === "image"
        ? {
            ...canvasItem,
            caption: caption.trim(),
            tags: normalizeTags(nextTags)
          }
        : canvasItem
    )
  };
};

export const addDiagramCanvasItem = (
  notebook: Notebook,
  pageId: PageId,
  canvasItemId: CanvasItemId,
  kind: DiagramItemKind,
  label: string,
  tags: readonly string[]
): Notebook => {
  const pageExists = notebook.pages.some((page) => page.id === pageId);
  const normalizedLabel = normalizeDiagramLabel(label);

  if (!pageExists) {
    throw new Error("Cannot add a Diagram Item for an unknown Page.");
  }

  return {
    ...notebook,
    canvasItems: [
      ...notebook.canvasItems,
      {
        id: canvasItemId,
        pageId,
        type: "diagram",
        kind,
        label: normalizedLabel,
        tags: normalizeTags(tags)
      }
    ],
    canvasRegions: [
      ...notebook.canvasRegions,
      {
        pageId,
        canvasItemId,
        bounds: boundsForDiagramItem(kind, diagramItemCountForPage(notebook, pageId))
      }
    ]
  };
};

export const updateDiagramCanvasItem = (
  notebook: Notebook,
  canvasItemId: CanvasItemId,
  kind: DiagramItemKind,
  label: string,
  nextTags: readonly string[]
): Notebook => {
  const normalizedLabel = normalizeDiagramLabel(label);
  const diagramItemExists = notebook.canvasItems.some(
    (canvasItem) => canvasItem.id === canvasItemId && canvasItem.type === "diagram"
  );

  if (!diagramItemExists) {
    throw new Error("Cannot edit an unknown Diagram Item.");
  }

  return {
    ...notebook,
    canvasItems: notebook.canvasItems.map((canvasItem) =>
      canvasItem.id === canvasItemId && canvasItem.type === "diagram"
        ? {
            ...canvasItem,
            kind,
            label: normalizedLabel,
            tags: normalizeTags(nextTags)
          }
        : canvasItem
    ),
    canvasRegions: notebook.canvasRegions.map((region) =>
      region.canvasItemId === canvasItemId
        ? { ...region, bounds: { ...region.bounds, ...sizeForDiagramItem(kind) } }
        : region
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

const normalizeCodeBlockCode = (code: string): string => {
  const trimmedCode = code.trim();

  if (trimmedCode.length === 0) {
    throw new Error("Code Block content cannot be empty.");
  }

  return trimmedCode;
};

const normalizeDiagramLabel = (label: string): string => {
  const trimmedLabel = label.trim();

  if (trimmedLabel.length === 0) {
    throw new Error("Diagram Item label cannot be empty.");
  }

  return trimmedLabel;
};

const normalizeImageMediaType = (mediaType: string): string => {
  const trimmedMediaType = mediaType.trim().toLowerCase();

  if (!trimmedMediaType.startsWith("image/")) {
    throw new Error("Image Item media type must be an image.");
  }

  return trimmedMediaType;
};

const normalizeImageDataUrl = (dataUrl: string, mediaType: string): string => {
  const trimmedDataUrl = dataUrl.trim();
  const normalizedMediaType = normalizeImageMediaType(mediaType);

  if (!trimmedDataUrl.startsWith(`data:${normalizedMediaType};`)) {
    throw new Error("Image Item source must be a local image data URL.");
  }

  return trimmedDataUrl;
};

const diagramItemCountForPage = (notebook: Notebook, pageId: PageId): number =>
  notebook.canvasItems.filter(
    (canvasItem) => canvasItem.pageId === pageId && canvasItem.type === "diagram"
  ).length;

const boundsForDiagramItem = (
  kind: DiagramItemKind,
  existingDiagramItemCount: number
): CanvasBounds => ({
  x: 420,
  y: 80 + existingDiagramItemCount * 120,
  ...sizeForDiagramItem(kind)
});

const sizeForDiagramItem = (
  kind: DiagramItemKind
): Pick<CanvasBounds, "width" | "height"> => {
  if (kind === "arrow") {
    return { width: 260, height: 48 };
  }

  if (kind === "label") {
    return { width: 220, height: 56 };
  }

  if (kind === "sticky-note") {
    return { width: 220, height: 160 };
  }

  return { width: 240, height: 120 };
};
