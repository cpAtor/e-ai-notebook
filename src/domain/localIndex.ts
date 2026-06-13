import {
  getSection,
  type CanvasItem,
  type CanvasItemId,
  type CanvasRegion,
  type Notebook,
  type PageId,
  type SectionId
} from "./notebook";

export interface LocalIndexEntry {
  readonly id: string;
  readonly notebookTitle: string;
  readonly sectionId: SectionId;
  readonly sectionTitle: string;
  readonly pageId: PageId;
  readonly pageTitle: string;
  readonly canvasItemId: CanvasItemId | null;
  readonly canvasRegion: CanvasRegion | null;
  readonly searchableText: string;
  readonly sourceLabel: string;
  readonly tags: readonly string[];
}

export interface SearchResult {
  readonly id: string;
  readonly sectionId: SectionId;
  readonly pageId: PageId;
  readonly canvasItemId: CanvasItemId | null;
  readonly canvasRegion: CanvasRegion | null;
  readonly notebookPath: string;
  readonly sourceLabel: string;
  readonly snippet: string;
  readonly matchedTags: readonly string[];
}

export const buildLocalIndex = (notebook: Notebook): readonly LocalIndexEntry[] =>
  notebook.pages.flatMap((page) => {
    const section = getSection(notebook, page.sectionId);

    if (section === undefined) {
      return [];
    }

    const pagePathText = `${notebook.title} ${section.title} ${page.title}`;
    const pageEntry: LocalIndexEntry = {
      id: `page:${page.id}`,
      notebookTitle: notebook.title,
      sectionId: section.id,
      sectionTitle: section.title,
      pageId: page.id,
      pageTitle: page.title,
      canvasItemId: null,
      canvasRegion: null,
      searchableText: pagePathText,
      sourceLabel: "Notebook path",
      tags: [],
    };

    const itemEntries = notebook.canvasItems
      .filter((canvasItem) => canvasItem.pageId === page.id)
      .map((canvasItem): LocalIndexEntry => ({
        id: `${canvasItem.type}:${canvasItem.id}`,
        notebookTitle: notebook.title,
        sectionId: section.id,
        sectionTitle: section.title,
        pageId: page.id,
        pageTitle: page.title,
        canvasItemId: canvasItem.id,
        canvasRegion:
          notebook.canvasRegions.find(
            (region) =>
              region.pageId === page.id && region.canvasItemId === canvasItem.id
          ) ?? null,
        searchableText: searchableTextForCanvasItem(pagePathText, canvasItem),
        sourceLabel: sourceLabelForCanvasItem(canvasItem),
        tags: canvasItem.tags,
      }));

    return [pageEntry, ...itemEntries];
  });

export const searchLocalIndex = (
  entries: readonly LocalIndexEntry[],
  rawQuery: string
): readonly SearchResult[] => {
  const query = normalizeSearchText(rawQuery);

  if (query.length === 0) {
    return [];
  }

  return entries
    .filter((entry) => normalizeSearchText(entry.searchableText).includes(query))
    .map((entry) => ({
      id: entry.id,
      sectionId: entry.sectionId,
      pageId: entry.pageId,
      canvasItemId: entry.canvasItemId,
      canvasRegion: entry.canvasRegion,
      notebookPath: `${entry.notebookTitle} / ${entry.sectionTitle} / ${entry.pageTitle}`,
      sourceLabel: entry.sourceLabel,
      snippet: snippetForQuery(entry.searchableText, query),
      matchedTags: entry.tags.filter((tag) =>
        normalizeSearchText(tag).includes(query)
      ),
    }));
};

const normalizeSearchText = (text: string): string => text.trim().toLowerCase();

const searchableTextForCanvasItem = (
  pagePathText: string,
  canvasItem: CanvasItem
): string => {
  if (canvasItem.type === "text") {
    return `${pagePathText} ${canvasItem.text} ${canvasItem.tags.join(" ")}`;
  }

  if (canvasItem.type === "link-card") {
    return `${pagePathText} ${canvasItem.url} ${canvasItem.note} ${canvasItem.tags.join(" ")}`;
  }

  if (canvasItem.type === "image") {
    return `${pagePathText} ${canvasItem.caption} ${canvasItem.tags.join(" ")}`;
  }

  return `${pagePathText} ${canvasItem.code} ${canvasItem.tags.join(" ")}`;
};

const sourceLabelForCanvasItem = (canvasItem: CanvasItem): string => {
  if (canvasItem.type === "text") {
    return "Text Canvas Item";
  }

  if (canvasItem.type === "link-card") {
    return "Link Card";
  }

  if (canvasItem.type === "image") {
    return "Image Item";
  }

  return "Code Block";
};

const snippetForQuery = (text: string, normalizedQuery: string): string => {
  const normalizedText = text.toLowerCase();
  const matchIndex = normalizedText.indexOf(normalizedQuery);

  if (matchIndex < 0) {
    return text.slice(0, 96);
  }

  const start = Math.max(0, matchIndex - 36);
  const end = Math.min(text.length, matchIndex + normalizedQuery.length + 60);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < text.length ? "..." : "";

  return `${prefix}${text.slice(start, end)}${suffix}`;
};
