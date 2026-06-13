import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  addBlankPage,
  addSection,
  createPageId,
  createSectionId,
  getPage,
  getSection,
  Notebook,
  Page,
  PageId,
  renameSection,
  removeSection,
  Section,
  SectionId
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

export const App = ({ store = defaultNotebookStore }: AppProps) => {
  const [notebook, setNotebook] = useState<Notebook | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [route, setRoute] = useState<PageRoute>(() =>
    parsePageRoute(window.location.pathname)
  );
  const [sectionTitleDrafts, setSectionTitleDrafts] = useState<
    Partial<Record<SectionId, string>>
  >({});
  const [newSectionTitle, setNewSectionTitle] = useState("");

  useEffect(() => {
    let isCurrent = true;

    store
      .loadNotebook()
      .then((storedNotebook) => {
        if (isCurrent) {
          setNotebook(storedNotebook);
          setLoadError(null);
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

  const saveNotebook = (nextNotebook: Notebook) => {
    setNotebook(nextNotebook);
    store.saveNotebook(nextNotebook).catch((error: unknown) => {
      setLoadError(
        error instanceof Error ? error.message : "Notebook changes could not be saved."
      );
    });
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
    openPage(sectionId, pageId);
  };

  const handleNotebookOpen = () => {
    window.history.pushState({}, "", "/");
    setRoute({ kind: "notebook" });
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
          <ActivePageView activePage={activePage} onNotebookOpen={handleNotebookOpen} />
        )}
      </section>
    </main>
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
  readonly onNotebookOpen: () => void;
}

const ActivePageView = ({ activePage, onNotebookOpen }: ActivePageViewProps) => {
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
        This blank Page is ready for rough interview-prep work and can be reopened
        from its URL after reload.
      </p>
      <button type="button" onClick={onNotebookOpen}>
        Back to Notebook
      </button>
    </article>
  );
};

const pagePath = (sectionId: SectionId, pageId: PageId) =>
  `/sections/${encodeURIComponent(sectionId)}/pages/${encodeURIComponent(pageId)}`;

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
