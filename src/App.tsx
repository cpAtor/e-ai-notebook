import {
  ComponentProps,
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { Tldraw } from "tldraw";
import "tldraw/tldraw.css";
import {
  canvasItemIdForShape,
  shapeNeedsCanvasItemMeta,
  textCanvasSnapshotFromTldrawShapes,
  toTldrawTextShapeDrafts,
  type PageTextCanvasSnapshot
} from "./canvas/tldrawTextAdapter";
import {
  buildLocalIndex,
  searchLocalIndex,
  type SearchResult
} from "./domain/localIndex";
import {
  addBlankPage,
  addSection,
  type CanvasItemId,
  createPageId,
  createSectionId,
  getPage,
  getSection,
  Notebook,
  Page,
  PageId,
  replacePageTextCanvasItems,
  renameSection,
  removeSection,
  Section,
  SectionId,
  updateTextCanvasItemTags
} from "./domain/notebook";
import {
  createNotebookStore,
  type NotebookStore
} from "./persistence/notebookStorage";

const DEFAULT_NEW_SECTION_TITLE = "New Section";
const defaultNotebookStore = createNotebookStore();

interface AppProps {
  readonly store?: NotebookStore;
}

type PageRoute =
  | { readonly kind: "notebook" }
  | {
      readonly kind: "page";
      readonly sectionId: SectionId;
      readonly pageId: PageId;
    };

type ActivePage =
  | {
      readonly kind: "found";
      readonly section: Section;
      readonly page: Page;
    }
  | { readonly kind: "invalid-section"; readonly sectionId: SectionId }
  | { readonly kind: "invalid-page"; readonly section: Section; readonly pageId: PageId };

type TldrawEditor = Parameters<
  NonNullable<ComponentProps<typeof Tldraw>["onMount"]>
>[0];

type SaveStatus =
  | { readonly kind: "idle" }
  | { readonly kind: "saving" }
  | { readonly kind: "saved" }
  | {
      readonly kind: "failed";
      readonly message: string;
      readonly unsavedNotebook: Notebook;
    };

export const App = ({ store = defaultNotebookStore }: AppProps) => {
  const [notebook, setNotebook] = useState<Notebook | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ kind: "idle" });
  const saveAttemptRef = useRef(0);
  const [route, setRoute] = useState<PageRoute>(() =>
    parsePageRoute(window.location.pathname)
  );
  const [sectionTitleDrafts, setSectionTitleDrafts] = useState<
    Partial<Record<SectionId, string>>
  >({});
  const [newSectionTitle, setNewSectionTitle] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [highlightedCanvasItemId, setHighlightedCanvasItemId] =
    useState<CanvasItemId | null>(null);

  useEffect(() => {
    let isCurrent = true;

    store
      .loadNotebook()
      .then((storedNotebook) => {
        if (isCurrent) {
          setNotebook(storedNotebook);
          setLoadError(null);
          setSaveStatus({ kind: "saved" });
        }
      })
      .catch((error: unknown) => {
        if (isCurrent) {
          setLoadError(
            error instanceof Error
              ? error.message
              : "Notebook storage could not be loaded."
          );
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [store]);

  useEffect(() => {
    const handlePopState = () => {
      setRoute(parsePageRoute(window.location.pathname));
    };

    window.addEventListener("popstate", handlePopState);

    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const activePage = useMemo(() => {
    if (notebook === null || route.kind === "notebook") {
      return null;
    }

    return resolveActivePage(notebook, route.sectionId, route.pageId);
  }, [notebook, route]);
  const localIndex = useMemo(
    () => (notebook === null ? [] : buildLocalIndex(notebook)),
    [notebook]
  );
  const searchResults = useMemo(
    () => searchLocalIndex(localIndex, searchQuery),
    [localIndex, searchQuery]
  );

  const saveNotebook = (nextNotebook: Notebook) => {
    const saveAttempt = saveAttemptRef.current + 1;
    saveAttemptRef.current = saveAttempt;
    setNotebook(nextNotebook);
    setSaveStatus({ kind: "saving" });
    store
      .saveNotebook(nextNotebook)
      .then(() => {
        if (saveAttemptRef.current === saveAttempt) {
          setSaveStatus({ kind: "saved" });
        }
      })
      .catch((error: unknown) => {
        if (saveAttemptRef.current === saveAttempt) {
          setSaveStatus({
            kind: "failed",
            message:
              error instanceof Error
                ? error.message
                : "Notebook changes could not be saved.",
            unsavedNotebook: nextNotebook
          });
        }
      });
  };

  const handleSaveRetry = () => {
    if (saveStatus.kind === "failed") {
      saveNotebook(saveStatus.unsavedNotebook);
    }
  };

  const handleSectionRename = (sectionId: SectionId, title: string) => {
    setSectionTitleDrafts((currentDrafts) => ({
      ...currentDrafts,
      [sectionId]: title
    }));

    if (title.trim().length > 0) {
      updateNotebook((currentNotebook) =>
        renameSection(currentNotebook, sectionId, title)
      );
    }
  };

  const handleSectionRemove = (sectionId: SectionId) => {
    updateNotebook((currentNotebook) => removeSection(currentNotebook, sectionId));
    setSectionTitleDrafts((currentDrafts) => {
      const remainingDrafts = { ...currentDrafts };
      delete remainingDrafts[sectionId];
      return remainingDrafts;
    });
  };

  const handleSectionAdd = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const title = newSectionTitle.trim() || DEFAULT_NEW_SECTION_TITLE;
    updateNotebook((currentNotebook) =>
      addSection(currentNotebook, createSectionId(), title)
    );
    setNewSectionTitle("");
  };

  const handlePageCreate = (sectionId: SectionId) => {
    if (notebook === null) {
      return;
    }

    const pageId = createPageId();
    const nextNotebook = addBlankPage(notebook, sectionId, pageId);
    saveNotebook(nextNotebook);
    openPage(sectionId, pageId);
  };

  const handlePageOpen = (sectionId: SectionId, pageId: PageId) => {
    setHighlightedCanvasItemId(null);
    openPage(sectionId, pageId);
  };

  const handleNotebookOpen = () => {
    window.history.pushState({}, "", "/");
    setHighlightedCanvasItemId(null);
    setRoute({ kind: "notebook" });
  };

  const handleSearchResultOpen = (result: SearchResult) => {
    setHighlightedCanvasItemId(result.canvasItemId);
    openPage(result.sectionId, result.pageId);
  };

  const handlePageTextCanvasChange = (
    pageId: PageId,
    snapshot: PageTextCanvasSnapshot
  ) => {
    updateNotebook((currentNotebook) =>
      replacePageTextCanvasItems(
        currentNotebook,
        pageId,
        snapshot.textItems,
        snapshot.regions
      )
    );
  };

  const handleTextCanvasItemTagsChange = (
    canvasItemId: CanvasItemId,
    tagDraft: string
  ) => {
    updateNotebook((currentNotebook) =>
      updateTextCanvasItemTags(
        currentNotebook,
        canvasItemId,
        tagsFromDraft(tagDraft)
      )
    );
  };

  const updateNotebook = (updater: (currentNotebook: Notebook) => Notebook) => {
    if (notebook === null) {
      return;
    }

    saveNotebook(updater(notebook));
  };

  const openPage = (sectionId: SectionId, pageId: PageId) => {
    const path = pagePath(sectionId, pageId);
    window.history.pushState({}, "", path);
    setRoute({ kind: "page", sectionId, pageId });
  };

  if (loadError !== null) {
    return (
      <main className="app-shell" aria-labelledby="storage-error-title">
        <section className="section-card">
          <p className="eyebrow">Storage needs attention</p>
          <h1 id="storage-error-title">Notebook could not be opened</h1>
          <p className="empty-state">{loadError}</p>
        </section>
      </main>
    );
  }

  if (notebook === null) {
    return (
      <main className="app-shell" aria-labelledby="loading-title">
        <section className="section-card">
          <p className="eyebrow">Loading</p>
          <h1 id="loading-title">Opening your Notebook</h1>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell" aria-labelledby="notebook-title">
      <section className="hero">
        <p className="eyebrow">Private by default</p>
        <div className="hero__header">
          <div>
            <h1 id="notebook-title">{notebook.title}</h1>
            <p>
              Capture rough interview-prep work across editable Sections. The
              shell bundles its runtime assets locally and makes no network
              calls until you explicitly configure a connected feature.
            </p>
          </div>
          <span className="privacy-badge" aria-label="Notebook privacy mode">
            Private Notebook
          </span>
        </div>
      </section>

      <SaveStatusBanner status={saveStatus} onRetry={handleSaveRetry} />

      <section className="section-card" aria-labelledby="sections-title">
        <div className="section-card__header">
          <div>
            <p className="eyebrow">Starter Sections</p>
            <h2 id="sections-title">Shape this Notebook around your prep</h2>
          </div>
          <p className="section-count" aria-live="polite">
            {notebook.sections.length}{" "}
            {notebook.sections.length === 1 ? "Section" : "Sections"}
          </p>
        </div>

        <form className="add-section-form" onSubmit={handleSectionAdd}>
          <label htmlFor="new-section-title">Add a Section</label>
          <div>
            <input
              id="new-section-title"
              name="new-section-title"
              placeholder="e.g. Behavioral"
              value={newSectionTitle}
              onChange={(event) => setNewSectionTitle(event.target.value)}
            />
            <button type="submit">Add Section</button>
          </div>
        </form>

        <ul className="section-list" aria-label="Editable Sections">
          {notebook.sections.map((section) => (
            <li className="section-row" key={section.id}>
              <label htmlFor={section.id}>Section name</label>
              <input
                id={section.id}
                value={sectionTitleDrafts[section.id] ?? section.title}
                onChange={(event) =>
                  handleSectionRename(section.id, event.target.value)
                }
                aria-label={`Rename ${section.title}`}
              />
              <button
                type="button"
                className="remove-button"
                onClick={() => handleSectionRemove(section.id)}
              >
                Remove
              </button>
              <button type="button" onClick={() => handlePageCreate(section.id)}>
                New Blank Page
              </button>
            </li>
          ))}
        </ul>

        {notebook.sections.length === 0 ? (
          <p className="empty-state">
            No Sections yet. Add one to start organizing your Notebook.
          </p>
        ) : null}
      </section>

      <LocalSearch
        query={searchQuery}
        results={searchResults}
        onQueryChange={setSearchQuery}
        onResultOpen={handleSearchResultOpen}
      />

      <section className="section-card" aria-labelledby="pages-title">
        <div className="section-card__header">
          <div>
            <p className="eyebrow">Pages</p>
            <h2 id="pages-title">Blank Pages stay tied to their Section</h2>
          </div>
          <p className="section-count" aria-live="polite">
            {notebook.pages.length} {notebook.pages.length === 1 ? "Page" : "Pages"}
          </p>
        </div>

        {activePage === null ? (
          <NotebookPages
            notebook={notebook}
            onPageOpen={handlePageOpen}
          />
        ) : (
          <ActivePageView
            activePage={activePage}
            notebook={notebook}
            highlightedCanvasItemId={highlightedCanvasItemId}
            onNotebookOpen={handleNotebookOpen}
            onPageTextCanvasChange={handlePageTextCanvasChange}
            onTextCanvasItemTagsChange={handleTextCanvasItemTagsChange}
          />
        )}
      </section>
    </main>
  );
};

interface SaveStatusBannerProps {
  readonly status: SaveStatus;
  readonly onRetry: () => void;
}

const SaveStatusBanner = ({ status, onRetry }: SaveStatusBannerProps) => {
  if (status.kind === "idle") {
    return null;
  }

  if (status.kind === "failed") {
    return (
      <section
        className="save-status save-status--failed"
        aria-label="Autosave status"
        role="alert"
      >
        <div>
          <strong>Autosave failed</strong>
          <p>
            Your latest Notebook edits are still visible here, but they have not
            been written to browser storage yet. Retry before closing this tab.
          </p>
          <p>{status.message}</p>
        </div>
        <button type="button" onClick={onRetry}>
          Retry Save
        </button>
      </section>
    );
  }

  const message =
    status.kind === "saving" ? "Saving Notebook changes" : "Notebook changes saved";

  return (
    <section
      className="save-status"
      aria-label="Autosave status"
      aria-live="polite"
    >
      <strong>{message}</strong>
    </section>
  );
};

interface NotebookPagesProps {
  readonly notebook: Notebook;
  readonly onPageOpen: (sectionId: SectionId, pageId: PageId) => void;
}

const NotebookPages = ({ notebook, onPageOpen }: NotebookPagesProps) => {
  if (notebook.pages.length === 0) {
    return (
      <p className="empty-state">
        No Pages yet. Create a blank Page from any Section when you are ready.
      </p>
    );
  }

  return (
    <ul className="page-list" aria-label="Notebook Pages">
      {notebook.pages.map((page) => {
        const section = getSection(notebook, page.sectionId);

        return (
          <li className="page-row" key={page.id}>
            <div>
              <strong>{page.title}</strong>
              <span>{section?.title ?? "Unknown Section"}</span>
            </div>
            <button
              type="button"
              onClick={() => onPageOpen(page.sectionId, page.id)}
            >
              Open Page
            </button>
          </li>
        );
      })}
    </ul>
  );
};

interface ActivePageViewProps {
  readonly activePage: ActivePage;
  readonly notebook: Notebook;
  readonly highlightedCanvasItemId: CanvasItemId | null;
  readonly onNotebookOpen: () => void;
  readonly onPageTextCanvasChange: (
    pageId: PageId,
    snapshot: PageTextCanvasSnapshot
  ) => void;
  readonly onTextCanvasItemTagsChange: (
    canvasItemId: CanvasItemId,
    tagDraft: string
  ) => void;
}

const ActivePageView = ({
  activePage,
  notebook,
  highlightedCanvasItemId,
  onNotebookOpen,
  onPageTextCanvasChange,
  onTextCanvasItemTagsChange
}: ActivePageViewProps) => {
  if (activePage.kind === "invalid-section") {
    return (
      <div className="page-canvas" role="alert">
        <h3>Section not found</h3>
        <p>
          This Page URL points to a Section that is not in this Notebook:
          {" "}{activePage.sectionId}
        </p>
        <button type="button" onClick={onNotebookOpen}>
          Back to Notebook
        </button>
      </div>
    );
  }

  if (activePage.kind === "invalid-page") {
    return (
      <div className="page-canvas" role="alert">
        <h3>Page not found</h3>
        <p>
          {activePage.section.title} does not contain this Page:
          {" "}{activePage.pageId}
        </p>
        <button type="button" onClick={onNotebookOpen}>
          Back to Notebook
        </button>
      </div>
    );
  }

  return (
    <article className="page-canvas" aria-labelledby="active-page-title">
      <p className="eyebrow">{activePage.section.title}</p>
      <h3 id="active-page-title">{activePage.page.title}</h3>
      <p>Page Type: unset</p>
      <p>
        Use tldraw text shapes for rough interview-prep work. Text Canvas Items
        autosave with app-owned Canvas Regions and reload at the same location.
      </p>
      <PageTextCanvas
        page={activePage.page}
        notebook={notebook}
        highlightedCanvasItemId={highlightedCanvasItemId}
        onPageTextCanvasChange={onPageTextCanvasChange}
        onTextCanvasItemTagsChange={onTextCanvasItemTagsChange}
      />
      <button type="button" onClick={onNotebookOpen}>
        Back to Notebook
      </button>
    </article>
  );
};

interface PageTextCanvasProps {
  readonly page: Page;
  readonly notebook: Notebook;
  readonly highlightedCanvasItemId: CanvasItemId | null;
  readonly onPageTextCanvasChange: (
    pageId: PageId,
    snapshot: PageTextCanvasSnapshot
  ) => void;
  readonly onTextCanvasItemTagsChange: (
    canvasItemId: CanvasItemId,
    tagDraft: string
  ) => void;
}

const PageTextCanvas = ({
  page,
  notebook,
  highlightedCanvasItemId,
  onPageTextCanvasChange,
  onTextCanvasItemTagsChange
}: PageTextCanvasProps) => {
  const saveTimeoutRef = useRef<number | undefined>(undefined);
  const initialTextItems = useMemo(
    () => notebook.canvasItems.filter((canvasItem) => canvasItem.pageId === page.id),
    [notebook.canvasItems, page.id]
  );
  const initialRegions = useMemo(
    () => notebook.canvasRegions.filter((region) => region.pageId === page.id),
    [notebook.canvasRegions, page.id]
  );
  const highlightedRegion = useMemo(
    () =>
      highlightedCanvasItemId === null
        ? null
        : (initialRegions.find(
            (region) => region.canvasItemId === highlightedCanvasItemId
          ) ?? null),
    [highlightedCanvasItemId, initialRegions]
  );

  const handleMount = useCallback(
    (editor: TldrawEditor) => {
      const drafts = toTldrawTextShapeDrafts(initialTextItems, initialRegions);

      if (drafts.length > 0) {
        editor.createShapes([...drafts]);
      }

      editor.setCurrentTool("text");

      const persistTextShapes = () => {
        const shapes = editor.getCurrentPageShapes();
        const boundsByShapeId = new Map<string, ReturnType<TldrawEditor["getShapePageBounds"]>>(
          shapes.map((shape) => [shape.id, editor.getShapePageBounds(shape)])
        );

        for (const shape of shapes) {
          if (shapeNeedsCanvasItemMeta(shape)) {
            editor.updateShape({
              id: shape.id,
              type: "text",
              meta: {
                ...shape.meta,
                canvasItemId: canvasItemIdForShape(shape)
              }
            });
          }
        }

        onPageTextCanvasChange(
          page.id,
          textCanvasSnapshotFromTldrawShapes(page.id, shapes, (shape) =>
            boundsByShapeId.get(shape.id)
          )
        );
      };

      const queuePersist = () => {
        window.clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = window.setTimeout(persistTextShapes, 250);
      };

      const unsubscribe = editor.store.listen(queuePersist, {
        source: "user",
        scope: "document"
      });

      return () => {
        window.clearTimeout(saveTimeoutRef.current);
        unsubscribe();
      };
    },
    [initialRegions, initialTextItems, onPageTextCanvasChange, page.id]
  );

  return (
    <>
    <div
      className="tldraw-canvas"
      data-testid="tldraw-page-canvas"
      aria-label={`${page.title} tldraw text canvas`}
    >
      {highlightedRegion !== null ? (
        <div
          className="canvas-region-highlight"
          role="status"
          aria-label="Highlighted Canvas Region"
          style={{
            height: `${highlightedRegion.bounds.height}px`,
            left: `${highlightedRegion.bounds.x}px`,
            top: `${highlightedRegion.bounds.y}px`,
            width: `${highlightedRegion.bounds.width}px`
          }}
        />
      ) : null}
      <Tldraw autoFocus initialState="text" onMount={handleMount} />
    </div>
    <TextCanvasItemTags
      pageTextItems={initialTextItems}
      onTagsChange={onTextCanvasItemTagsChange}
    />
    </>
  );
};

interface TextCanvasItemTagsProps {
  readonly pageTextItems: readonly Notebook["canvasItems"][number][];
  readonly onTagsChange: (canvasItemId: CanvasItemId, tagDraft: string) => void;
}

const TextCanvasItemTags = ({
  pageTextItems,
  onTagsChange
}: TextCanvasItemTagsProps) => {
  const [tagDrafts, setTagDrafts] = useState<Partial<Record<CanvasItemId, string>>>(
    {}
  );

  if (pageTextItems.length === 0) {
    return null;
  }

  const handleTagDraftChange = (canvasItemId: CanvasItemId, tagDraft: string) => {
    setTagDrafts((currentDrafts) => ({
      ...currentDrafts,
      [canvasItemId]: tagDraft
    }));
    onTagsChange(canvasItemId, tagDraft);
  };

  return (
    <div className="text-item-tags" aria-label="Text Canvas Item Tags">
      <h4>Optional Tags</h4>
      <p>
        Add comma-separated Tags to text Rough Work without changing the canvas.
      </p>
      {pageTextItems.map((textItem) => (
        <label key={textItem.id} htmlFor={`${textItem.id}-tags`}>
          Tags for {textItem.text}
          <input
            id={`${textItem.id}-tags`}
            value={tagDrafts[textItem.id] ?? textItem.tags.join(", ")}
            placeholder="e.g. graphs, bfs"
            onChange={(event) =>
              handleTagDraftChange(textItem.id, event.target.value)
            }
          />
        </label>
      ))}
    </div>
  );
};

interface LocalSearchProps {
  readonly query: string;
  readonly results: readonly SearchResult[];
  readonly onQueryChange: (query: string) => void;
  readonly onResultOpen: (result: SearchResult) => void;
}

const LocalSearch = ({
  query,
  results,
  onQueryChange,
  onResultOpen
}: LocalSearchProps) => (
  <section className="section-card" aria-labelledby="local-search-title">
    <div className="section-card__header">
      <div>
        <p className="eyebrow">Local Index</p>
        <h2 id="local-search-title">Search Rough Work</h2>
      </div>
      <p className="section-count" aria-live="polite">
        {results.length} {results.length === 1 ? "Search Result" : "Search Results"}
      </p>
    </div>
    <label className="search-field" htmlFor="notebook-search">
      Search text Canvas Items, Tags, Page titles, and Section paths
      <input
        id="notebook-search"
        value={query}
        placeholder="e.g. binary search invariant"
        onChange={(event) => onQueryChange(event.target.value)}
      />
    </label>
    {query.trim().length > 0 && results.length === 0 ? (
      <p className="empty-state">No Search Results found in this Notebook.</p>
    ) : null}
    {results.length > 0 ? (
      <ul className="search-results" aria-label="Search Results">
        {results.map((result) => (
          <li className="search-result" key={result.id}>
            <div>
              <strong>{result.notebookPath}</strong>
              <span>{result.sourceLabel}</span>
              {result.matchedTags.length > 0 ? (
                <span>
                  Matched Tags: {result.matchedTags.map((tag) => `#${tag}`).join(", ")}
                </span>
              ) : null}
              <p>{result.snippet}</p>
            </div>
            <button type="button" onClick={() => onResultOpen(result)}>
              Open Result
            </button>
          </li>
        ))}
      </ul>
    ) : null}
  </section>
);

const pagePath = (sectionId: SectionId, pageId: PageId) =>
  `/sections/${encodeURIComponent(sectionId)}/pages/${encodeURIComponent(pageId)}`;

const tagsFromDraft = (draft: string): readonly string[] =>
  draft.split(",").map((tag) => tag.trim());

const parsePageRoute = (pathname: string): PageRoute => {
  const match = /^\/sections\/([^/]+)\/pages\/([^/]+)\/?$/.exec(pathname);

  if (match === null) {
    return { kind: "notebook" };
  }

  const [, sectionId, pageId] = match;

  if (sectionId === undefined || pageId === undefined) {
    return { kind: "notebook" };
  }

  return {
    kind: "page",
    sectionId: decodeURIComponent(sectionId) as SectionId,
    pageId: decodeURIComponent(pageId) as PageId
  };
};

const resolveActivePage = (
  notebook: Notebook,
  sectionId: SectionId,
  pageId: PageId
): ActivePage => {
  const section = getSection(notebook, sectionId);

  if (section === undefined) {
    return { kind: "invalid-section", sectionId };
  }

  const page = getPage(notebook, pageId);

  if (page === undefined || page.sectionId !== sectionId) {
    return { kind: "invalid-page", section, pageId };
  }

  return { kind: "found", section, page };
};
