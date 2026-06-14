import {
  ChangeEvent,
  ClipboardEvent,
  ComponentProps,
  FormEvent,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { Tldraw, iconTypes, type TLUiAssetUrlOverrides } from "tldraw";
import "tldraw/tldraw.css";
import {
  canvasItemIdForShape,
  pageTldrawCanvasSnapshotFromTldrawShapes,
  shapeNeedsCanvasItemMeta,
  toTldrawFreehandDrawingShapeDrafts,
  toTldrawTextShapeDrafts,
  type PageTldrawCanvasSnapshot
} from "./canvas/tldrawTextAdapter";
import {
  buildLocalIndex,
  searchLocalIndex,
  type SearchResult
} from "./domain/localIndex";
import {
  addDiagramCanvasItem,
  addCodeBlockCanvasItem,
  addImageCanvasItem,
  addLinkCardCanvasItem,
  addBlankPage,
  addSection,
  type CanvasItemId,
  type CodeBlockCanvasItem,
  createCanvasItemId,
  createPageId,
  createSectionId,
  type DiagramCanvasItem,
  type DiagramItemKind,
  type FreehandDrawingCanvasItem,
  getPage,
  getSection,
  type ImageCanvasItem,
  type LinkCardCanvasItem,
  Notebook,
  Page,
  PageId,
  replacePageCanvasItems,
  renameSection,
  removeSection,
  Section,
  SectionId,
  STARTER_DEFAULT_PAGE_ID,
  type TextCanvasItem,
  updateCodeBlockCanvasItem,
  updateDiagramCanvasItem,
  updateImageCanvasItemMetadata,
  updateLinkCardCanvasItemTags,
  updateTextCanvasItemTags
} from "./domain/notebook";
import {
  createNotebookStore,
  NotebookConflictError,
  NotebookRecoveryError,
  NotebookStorageUnavailableError,
  notebookExportFileName,
  parseNotebookExport,
  serializeNotebookExport,
  type NotebookStore
} from "./persistence/notebookStorage";

const DEFAULT_NEW_SECTION_TITLE = "New Section";
const THEME_STORAGE_KEY = "notebook_theme";
const AI_ENABLED_STORAGE_KEY = "notebook_ai_enabled";
const defaultNotebookStore = createNotebookStore();

const getStoredAiEnabled = (): boolean => {
  try {
    return localStorage.getItem(AI_ENABLED_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
};

type Theme = "system" | "light" | "dark";

const getSystemTheme = (): Exclude<Theme, "system"> => {
  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  return "dark";
};

const getStoredTheme = (): Theme => {
  try {
    const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);

    if (storedTheme === "system" || storedTheme === "light" || storedTheme === "dark") {
      return storedTheme;
    }
  } catch {
    // Ignore storage errors while choosing a default theme.
  }

  return "system";
};

const applyThemeToDocument = (theme: Theme) => {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.dataset.theme = theme === "system" ? getSystemTheme() : theme;
};

const LOCAL_TLDRAW_TEXT_ASSET_URLS: TLUiAssetUrlOverrides = {
  fonts: {
    tldraw_draw: "data:font/woff2;base64,",
    tldraw_draw_bold: "data:font/woff2;base64,",
    tldraw_draw_italic: "data:font/woff2;base64,",
    tldraw_draw_italic_bold: "data:font/woff2;base64,",
    tldraw_mono: "data:font/woff2;base64,",
    tldraw_mono_bold: "data:font/woff2;base64,",
    tldraw_mono_italic: "data:font/woff2;base64,",
    tldraw_mono_italic_bold: "data:font/woff2;base64,",
    tldraw_sans: "data:font/woff2;base64,",
    tldraw_sans_bold: "data:font/woff2;base64,",
    tldraw_sans_italic: "data:font/woff2;base64,",
    tldraw_sans_italic_bold: "data:font/woff2;base64,",
    tldraw_serif: "data:font/woff2;base64,",
    tldraw_serif_bold: "data:font/woff2;base64,",
    tldraw_serif_italic: "data:font/woff2;base64,",
    tldraw_serif_italic_bold: "data:font/woff2;base64,"
  },
  icons: Object.fromEntries(
    iconTypes.map((iconType) => [
      iconType,
      `data:image/svg+xml,${encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg'/>")}`
    ])
  ),
  embedIcons: {
    canva: "data:image/png;base64,",
    codepen: "data:image/png;base64,",
    codesandbox: "data:image/png;base64,",
    desmos: "data:image/png;base64,",
    felt: "data:image/png;base64,",
    figma: "data:image/png;base64,",
    github_gist: "data:image/png;base64,",
    google_calendar: "data:image/png;base64,",
    google_maps: "data:image/png;base64,",
    google_slides: "data:image/png;base64,",
    observable: "data:image/png;base64,",
    replit: "data:image/png;base64,",
    scratch: "data:image/png;base64,",
    spotify: "data:image/png;base64,",
    tldraw: "data:image/png;base64,",
    val_town: "data:image/png;base64,",
    vimeo: "data:image/png;base64,",
    youtube: "data:image/png;base64,"
  },
  translations: {
    en: `data:application/json,${encodeURIComponent("{}")}`
  }
};

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
    }
  | { readonly kind: "conflict"; readonly message: string };

type BackupStatus =
  | { readonly kind: "idle" }
  | { readonly kind: "success"; readonly message: string }
  | { readonly kind: "failed"; readonly message: string };

interface RecoveryState {
  readonly message: string;
  readonly rawPayload: string;
  readonly rawExportJson: string;
  readonly status: BackupStatus;
}

type LoadError =
  | { readonly kind: "generic"; readonly message: string }
  | { readonly kind: "unsupported-storage"; readonly message: string };

const unsupportedStorageMessage = (error: NotebookStorageUnavailableError) =>
  `${error.message} Capture cannot be safely persisted in this browser right now. Check that IndexedDB is enabled and not blocked by private browsing, site settings, storage permissions, or browser policy before adding Notebook material.`;

export const App = ({ store = defaultNotebookStore }: AppProps) => {
  const [notebook, setNotebook] = useState<Notebook | null>(null);
  const [loadError, setLoadError] = useState<LoadError | null>(null);
  const [recoveryState, setRecoveryState] = useState<RecoveryState | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ kind: "idle" });
  const [backupStatus, setBackupStatus] = useState<BackupStatus>({ kind: "idle" });
  const [notebookExportJson, setNotebookExportJson] = useState("");
  const [theme, setTheme] = useState<Theme>(getStoredTheme);
  const [aiEnabled, setAiEnabled] = useState<boolean>(getStoredAiEnabled);
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
          setRecoveryState(null);
          setSaveStatus({ kind: "saved" });

          if (
            parsePageRoute(window.location.pathname).kind === "notebook" &&
            getRootRoutePreference() !== "notebook"
          ) {
            const targetPage = resolveOpeningPage(storedNotebook);
            if (targetPage !== null) {
              const path = pagePath(targetPage.sectionId, targetPage.pageId);
              window.history.pushState({}, "", path);
              setRootRoutePreference("page");
              setRoute({
                kind: "page",
                sectionId: targetPage.sectionId,
                pageId: targetPage.pageId
              });
            }
          }
        }
      })
      .catch((error: unknown) => {
        if (isCurrent) {
          if (error instanceof NotebookRecoveryError) {
            setRecoveryState({
              message: error.message,
              rawPayload: error.rawPayload,
              rawExportJson: "",
              status: { kind: "idle" }
            });
            setLoadError(null);
            setSaveStatus({ kind: "idle" });
            return;
          }

          if (error instanceof NotebookStorageUnavailableError) {
            setNotebook(null);
            setRecoveryState(null);
            setSaveStatus({ kind: "idle" });
            setLoadError({
              kind: "unsupported-storage",
              message: unsupportedStorageMessage(error)
            });
            return;
          }

          setLoadError({
            kind: "generic",
            message:
              error instanceof Error
                ? error.message
                : "Notebook storage could not be loaded."
          });
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

  useEffect(() => {
    applyThemeToDocument(theme);

    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore storage errors while persisting theme preference.
    }

    if (theme !== "system" || typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => applyThemeToDocument("system");

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleChange);

      return () => mediaQuery.removeEventListener("change", handleChange);
    }

    mediaQuery.addListener(handleChange);

    return () => mediaQuery.removeListener(handleChange);
  }, [theme]);

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
          if (error instanceof NotebookConflictError) {
            setSaveStatus({
              kind: "conflict",
              message: error.message
            });
            return;
          }

          if (error instanceof NotebookStorageUnavailableError) {
            setNotebook(null);
            setRecoveryState(null);
            setSaveStatus({ kind: "idle" });
            setLoadError({
              kind: "unsupported-storage",
              message: unsupportedStorageMessage(error)
            });
            return;
          }

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

  const handleConflictReload = () => {
    void (async () => {
      try {
        const storedNotebook = await store.loadNotebook();
        setNotebook(storedNotebook);
        setLoadError(null);
        setRecoveryState(null);
        setSaveStatus({ kind: "saved" });
        setBackupStatus({ kind: "idle" });
        setSearchQuery("");
        setHighlightedCanvasItemId(null);
      } catch (error: unknown) {
        if (error instanceof NotebookRecoveryError) {
          setRecoveryState({
            message: error.message,
            rawPayload: error.rawPayload,
            rawExportJson: "",
            status: { kind: "idle" }
          });
          setLoadError(null);
          setSaveStatus({ kind: "idle" });
          return;
        }

        if (error instanceof NotebookStorageUnavailableError) {
          setNotebook(null);
          setRecoveryState(null);
          setSaveStatus({ kind: "idle" });
          setLoadError({
            kind: "unsupported-storage",
            message: unsupportedStorageMessage(error)
          });
          return;
        }

        if (notebook === null) {
          setLoadError({
            kind: "generic",
            message:
              error instanceof Error
                ? error.message
                : "The newer stored Notebook could not be loaded."
          });
          return;
        }

        setSaveStatus({
          kind: "failed",
          message:
            error instanceof Error
              ? error.message
              : "The newer stored Notebook could not be loaded.",
          unsavedNotebook: notebook
        });
      }
    })();
  };

  const handleNotebookExport = () => {
    if (notebook === null) {
      return;
    }

    const exportJson = serializeNotebookExport(notebook);
    setNotebookExportJson(exportJson);
    downloadJsonFile(exportJson, notebookExportFileName());

    setBackupStatus({
      kind: "success",
      message:
        "Notebook Export JSON is ready. It includes source Notebook data only; Local Index and credentials are excluded."
    });
  };

  const handleNotebookImport = (event: ChangeEvent<HTMLInputElement>) => {
    handleNotebookImportFile(
      event,
      "Notebook Export imported. Search uses a freshly rebuilt Local Index from the imported Notebook source data.",
      setBackupStatus
    );
  };

  const handleNotebookImportFile = (
    event: ChangeEvent<HTMLInputElement>,
    successMessage: string,
    setStatus: (status: BackupStatus) => void
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (file === undefined) {
      return;
    }

    const reader = new FileReader();
    reader.addEventListener("load", () => {
      void (async () => {
      try {
        if (typeof reader.result !== "string") {
          throw new Error("Notebook Export file could not be read as text.");
        }

        const importedNotebook = parseNotebookExport(reader.result);
        await store.saveNotebook(importedNotebook);
        setNotebook(importedNotebook);
        setSaveStatus({ kind: "saved" });
        setNotebookExportJson("");
        setSearchQuery("");
        setHighlightedCanvasItemId(null);
        window.history.pushState({}, "", "/");
        setRootRoutePreference("notebook");
        setRoute({ kind: "notebook" });
        setRecoveryState(null);
        setStatus({
          kind: "success",
          message: successMessage
        });
      } catch (error: unknown) {
        if (error instanceof NotebookStorageUnavailableError) {
          setNotebook(null);
          setRecoveryState(null);
          setSaveStatus({ kind: "idle" });
          setLoadError({
            kind: "unsupported-storage",
            message: unsupportedStorageMessage(error)
          });
          return;
        }

        setStatus({
          kind: "failed",
          message:
            error instanceof Error
              ? error.message
              : "Notebook Export could not be imported."
        });
      }
      })();
    });
    reader.addEventListener("error", () => {
      setStatus({
        kind: "failed",
        message:
          reader.error?.message ?? "Notebook Export file could not be imported."
      });
    });
    reader.readAsText(file);
  };

  const handleRecoveryRawPayloadExport = () => {
    if (recoveryState === null) {
      return;
    }

    downloadJsonFile(
      recoveryState.rawPayload,
      "interview-prep-notebook-raw-payload.json"
    );
    setRecoveryState({
      ...recoveryState,
      rawExportJson: recoveryState.rawPayload,
      status: {
        kind: "success",
        message:
          "Raw stored payload is ready for backup or debugging. It has not been treated as a valid Notebook Export."
      }
    });
  };

  const handleRecoveryStartFresh = () => {
    void (async () => {
      try {
        const freshNotebook = await store.startFreshNotebook();
        setNotebook(freshNotebook);
        setLoadError(null);
        setRecoveryState(null);
        setSaveStatus({ kind: "saved" });
        setSearchQuery("");
        setHighlightedCanvasItemId(null);
        window.history.pushState({}, "", "/");
        setRootRoutePreference("notebook");
        setRoute({ kind: "notebook" });
        setBackupStatus({
          kind: "success",
          message:
            "Started a new Notebook after replacing the invalid stored payload."
        });
      } catch (error: unknown) {
        if (error instanceof NotebookStorageUnavailableError) {
          setNotebook(null);
          setRecoveryState(null);
          setSaveStatus({ kind: "idle" });
          setLoadError({
            kind: "unsupported-storage",
            message: unsupportedStorageMessage(error)
          });
          return;
        }

        setRecoveryState((currentState) =>
          currentState === null
            ? null
            : {
                ...currentState,
                status: {
                  kind: "failed",
                  message:
                    error instanceof Error
                      ? error.message
                      : "A new Notebook could not be started."
                }
              }
        );
      }
    })();
  };

  const handleRecoveryImport = (event: ChangeEvent<HTMLInputElement>) => {
    handleNotebookImportFile(
      event,
      "Notebook Export imported and persisted after invalid stored data was replaced.",
      (status) =>
        setRecoveryState((currentState) =>
          currentState === null ? null : { ...currentState, status }
        )
    );
  };

  const handleSectionRename = (sectionId: SectionId, title: string) => {
    setSectionTitleDrafts((currentDrafts) => ({
      ...currentDrafts,
      [sectionId]: title
    }));

    if (title.trim().length > 0) {
      setRootRoutePreference("notebook");
      updateNotebook((currentNotebook) =>
        renameSection(currentNotebook, sectionId, title)
      );
    }
  };

  const handleSectionRemove = (sectionId: SectionId) => {
    setRootRoutePreference("notebook");
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
    setRootRoutePreference("notebook");
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
    snapshot: PageTldrawCanvasSnapshot
  ) => {
    updateNotebook((currentNotebook) =>
      replacePageCanvasItems(
        currentNotebook,
        pageId,
        snapshot.textItems,
        snapshot.freehandDrawingItems,
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

  const handleLinkCardAdd = (
    pageId: PageId,
    url: string,
    note: string,
    tagDraft: string
  ) => {
    updateNotebook((currentNotebook) =>
      addLinkCardCanvasItem(
        currentNotebook,
        pageId,
        createCanvasItemId(),
        url,
        note,
        tagsFromDraft(tagDraft)
      )
    );
  };

  const handleLinkCardTagsChange = (
    canvasItemId: CanvasItemId,
    tagDraft: string
  ) => {
    updateNotebook((currentNotebook) =>
      updateLinkCardCanvasItemTags(
        currentNotebook,
        canvasItemId,
        tagsFromDraft(tagDraft)
      )
    );
  };

  const handleImageItemAdd = (
    pageId: PageId,
    dataUrl: string,
    mediaType: string,
    caption: string,
    tagDraft: string
  ) => {
    updateNotebook((currentNotebook) =>
      addImageCanvasItem(
        currentNotebook,
        pageId,
        createCanvasItemId(),
        dataUrl,
        mediaType,
        caption,
        tagsFromDraft(tagDraft)
      )
    );
  };

  const handleImageItemMetadataChange = (
    canvasItemId: CanvasItemId,
    caption: string,
    tagDraft: string
  ) => {
    updateNotebook((currentNotebook) =>
      updateImageCanvasItemMetadata(
        currentNotebook,
        canvasItemId,
        caption,
        tagsFromDraft(tagDraft)
      )
    );
  };

  const handleCodeBlockAdd = (
    pageId: PageId,
    code: string,
    tagDraft: string
  ) => {
    updateNotebook((currentNotebook) =>
      addCodeBlockCanvasItem(
        currentNotebook,
        pageId,
        createCanvasItemId(),
        code,
        tagsFromDraft(tagDraft)
      )
    );
  };

  const handleCodeBlockChange = (
    canvasItemId: CanvasItemId,
    code: string,
    tagDraft: string
  ) => {
    updateNotebook((currentNotebook) =>
      updateCodeBlockCanvasItem(
        currentNotebook,
        canvasItemId,
        code,
        tagsFromDraft(tagDraft)
      )
    );
  };

  const handleDiagramItemAdd = (
    pageId: PageId,
    kind: DiagramItemKind,
    label: string,
    tagDraft: string
  ) => {
    updateNotebook((currentNotebook) =>
      addDiagramCanvasItem(
        currentNotebook,
        pageId,
        createCanvasItemId(),
        kind,
        label,
        tagsFromDraft(tagDraft)
      )
    );
  };

  const handleDiagramItemChange = (
    canvasItemId: CanvasItemId,
    kind: DiagramItemKind,
    label: string,
    tagDraft: string
  ) => {
    updateNotebook((currentNotebook) =>
      updateDiagramCanvasItem(
        currentNotebook,
        canvasItemId,
        kind,
        label,
        tagsFromDraft(tagDraft)
      )
    );
  };

  const updateNotebook = (updater: (currentNotebook: Notebook) => Notebook) => {
    if (notebook === null) {
      return;
    }

    if (saveStatus.kind === "conflict") {
      return;
    }

    saveNotebook(updater(notebook));
  };

  const openPage = (sectionId: SectionId, pageId: PageId) => {
    const path = pagePath(sectionId, pageId);
    window.history.pushState({}, "", path);
    setLastOpenedPage(sectionId, pageId);
    setRootRoutePreference("page");
    setRoute({ kind: "page", sectionId, pageId });
  };

  const handleAiEnabledChange = (enabled: boolean) => {
    try {
      localStorage.setItem(AI_ENABLED_STORAGE_KEY, enabled ? "true" : "false");
    } catch {
      // Ignore storage errors while saving AI preference.
    }
    setAiEnabled(enabled);
  };

  if (recoveryState !== null) {
    return (
      <RecoveryScreen
        state={recoveryState}
        onRawPayloadExport={handleRecoveryRawPayloadExport}
        onStartFresh={handleRecoveryStartFresh}
        onImport={handleRecoveryImport}
      />
    );
  }

  if (loadError !== null) {
    const isUnsupportedStorage = loadError.kind === "unsupported-storage";

    return (
      <main className="app-shell" aria-labelledby="storage-error-title">
        <section
          className="section-card"
          role={isUnsupportedStorage ? "alert" : undefined}
        >
          <p className="eyebrow">
            {isUnsupportedStorage ? "Storage unsupported" : "Storage needs attention"}
          </p>
          <h1 id="storage-error-title">
            {isUnsupportedStorage
              ? "Notebook storage is unavailable"
              : "Notebook could not be opened"}
          </h1>
          <p className="empty-state">{loadError.message}</p>
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

  if (route.kind === "page" && activePage !== null) {
    return (
      <DrawingScreen
        activePage={activePage}
        notebook={notebook}
        highlightedCanvasItemId={highlightedCanvasItemId}
        saveStatus={saveStatus}
        theme={theme}
        onThemeChange={setTheme}
        aiEnabled={aiEnabled}
        onAiEnabledChange={handleAiEnabledChange}
        onNotebookOpen={handleNotebookOpen}
        onPageOpen={handlePageOpen}
        onPageCreate={handlePageCreate}
        onNotebookExport={handleNotebookExport}
        onNotebookImport={handleNotebookImport}
        notebookExportJson={notebookExportJson}
        backupStatus={backupStatus}
        onSaveRetry={handleSaveRetry}
        onConflictReload={handleConflictReload}
        onCodeBlockAdd={handleCodeBlockAdd}
        onCodeBlockChange={handleCodeBlockChange}
        onDiagramItemAdd={handleDiagramItemAdd}
        onDiagramItemChange={handleDiagramItemChange}
        onImageItemAdd={handleImageItemAdd}
        onImageItemMetadataChange={handleImageItemMetadataChange}
        onLinkCardAdd={handleLinkCardAdd}
        onLinkCardTagsChange={handleLinkCardTagsChange}
        onPageTextCanvasChange={handlePageTextCanvasChange}
        onTextCanvasItemTagsChange={handleTextCanvasItemTagsChange}
        searchQuery={searchQuery}
        searchResults={searchResults}
        onSearchQueryChange={setSearchQuery}
        onSearchResultOpen={handleSearchResultOpen}
      />
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
            <aside
              className="privacy-note"
              aria-label="Local browser storage and backup guidance"
            >
              <strong>Stored in local browser storage by default.</strong>
              <span>
                Your Notebook stays in this browser unless you export it or
                configure a connected feature. Browser storage is not
                server-grade encrypted storage, so use Notebook Export for
                backups rather than expecting cloud sync.
              </span>
            </aside>
          </div>
          <span className="privacy-badge" aria-label="Notebook privacy mode">
            Private Notebook
          </span>
        </div>
      </section>

      <SaveStatusBanner
        status={saveStatus}
        onRetry={handleSaveRetry}
        onConflictReload={handleConflictReload}
      />

      <NotebookBackupPanel
        exportJson={notebookExportJson}
        status={backupStatus}
        onExport={handleNotebookExport}
        onImport={handleNotebookImport}
      />

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
        <NotebookPages
          notebook={notebook}
          onPageOpen={handlePageOpen}
        />
      </section>
    </main>
  );
};

interface RecoveryScreenProps {
  readonly state: RecoveryState;
  readonly onRawPayloadExport: () => void;
  readonly onStartFresh: () => void;
  readonly onImport: (event: ChangeEvent<HTMLInputElement>) => void;
}

const RecoveryScreen = ({
  state,
  onRawPayloadExport,
  onStartFresh,
  onImport
}: RecoveryScreenProps) => (
  <main className="app-shell" aria-labelledby="recovery-title">
    <section className="section-card recovery-screen" role="alert">
      <p className="eyebrow">Storage recovery</p>
      <h1 id="recovery-title">Notebook data needs recovery</h1>
      <p>
        Stored Notebook data could not pass the versioned schema and migration
        boundary, so capture and autosave are paused. The app has not silently
        reset or replaced your browser data.
      </p>
      <p>{state.message}</p>
      <div className="notebook-backup__actions">
        <button type="button" onClick={onRawPayloadExport}>
          Export Raw Stored Payload
        </button>
        <label htmlFor="recovery-notebook-import">
          Import Notebook Export
          <input
            id="recovery-notebook-import"
            type="file"
            accept="application/json,.json"
            onChange={onImport}
          />
        </label>
        <button type="button" className="remove-button" onClick={onStartFresh}>
          Start New Notebook
        </button>
      </div>
      {state.status.kind !== "idle" ? (
        <p
          className={
            state.status.kind === "failed"
              ? "notebook-backup__status notebook-backup__status--failed"
              : "notebook-backup__status"
          }
          role={state.status.kind === "failed" ? "alert" : "status"}
        >
          {state.status.message}
        </p>
      ) : null}
      {state.rawExportJson.length > 0 ? (
        <label className="notebook-backup__json" htmlFor="raw-payload-json">
          Raw stored payload JSON
          <textarea id="raw-payload-json" readOnly value={state.rawExportJson} />
        </label>
      ) : null}
    </section>
  </main>
);

const downloadJsonFile = (json: string, fileName: string) => {
  if (typeof URL.createObjectURL !== "function") {
    return;
  }

  const exportUrl = URL.createObjectURL(
    new Blob([json], { type: "application/json" })
  );
  const downloadLink = document.createElement("a");
  downloadLink.href = exportUrl;
  downloadLink.download = fileName;
  downloadLink.click();
  URL.revokeObjectURL(exportUrl);
};

interface NotebookBackupPanelProps {
  readonly exportJson: string;
  readonly status: BackupStatus;
  readonly onExport: () => void;
  readonly onImport: (event: ChangeEvent<HTMLInputElement>) => void;
}

const NotebookBackupPanel = ({
  exportJson,
  status,
  onExport,
  onImport
}: NotebookBackupPanelProps) => (
  <section className="section-card notebook-backup" aria-labelledby="backup-title">
    <div className="section-card__header">
      <div>
        <p className="eyebrow">Notebook Export</p>
        <h2 id="backup-title">Back up or restore this Notebook</h2>
      </div>
      <p className="section-count">Source data only</p>
    </div>
    <p>
      Export preserves Sections, Pages, all MVP Canvas Item types, Tags, and
      Canvas Regions. It excludes credentials, tokens, and rebuildable Local Index
      data.
    </p>
    <div className="notebook-backup__actions">
      <button type="button" onClick={onExport}>
        Export Notebook Backup
      </button>
      <label htmlFor="notebook-import">
        Import Notebook Export
        <input
          id="notebook-import"
          type="file"
          accept="application/json,.json"
          onChange={onImport}
        />
      </label>
    </div>
    {status.kind !== "idle" ? (
      <p
        className={
          status.kind === "failed"
            ? "notebook-backup__status notebook-backup__status--failed"
            : "notebook-backup__status"
        }
        role={status.kind === "failed" ? "alert" : "status"}
      >
        {status.message}
      </p>
    ) : null}
    {exportJson.length > 0 ? (
      <label className="notebook-backup__json" htmlFor="notebook-export-json">
        Notebook Export JSON
        <textarea id="notebook-export-json" readOnly value={exportJson} />
      </label>
    ) : null}
  </section>
);

interface SaveStatusBannerProps {
  readonly status: SaveStatus;
  readonly onRetry: () => void;
  readonly onConflictReload: () => void;
}

const SaveStatusBanner = ({
  status,
  onRetry,
  onConflictReload
}: SaveStatusBannerProps) => {
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

  if (status.kind === "conflict") {
    return (
      <section
        className="save-status save-status--failed"
        aria-label="Autosave status"
        role="alert"
      >
        <div>
          <strong>Another tab changed this Notebook</strong>
          <p>
            Autosave is paused in this tab so it cannot silently overwrite newer
            browser data. Reload the stored Notebook before making more edits.
          </p>
          <p>{status.message}</p>
        </div>
        <button type="button" onClick={onConflictReload}>
          Reload Stored Notebook
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

interface DrawingScreenProps {
  readonly activePage: ActivePage;
  readonly notebook: Notebook;
  readonly highlightedCanvasItemId: CanvasItemId | null;
  readonly saveStatus: SaveStatus;
  readonly theme: Theme;
  readonly onThemeChange: (theme: Theme) => void;
  readonly aiEnabled: boolean;
  readonly onAiEnabledChange: (enabled: boolean) => void;
  readonly onNotebookOpen: () => void;
  readonly onPageOpen: (sectionId: SectionId, pageId: PageId) => void;
  readonly onPageCreate: (sectionId: SectionId) => void;
  readonly onNotebookExport: () => void;
  readonly onNotebookImport: (event: ChangeEvent<HTMLInputElement>) => void;
  readonly notebookExportJson: string;
  readonly backupStatus: BackupStatus;
  readonly onSaveRetry: () => void;
  readonly onConflictReload: () => void;
  readonly onCodeBlockAdd: (pageId: PageId, code: string, tagDraft: string) => void;
  readonly onCodeBlockChange: (canvasItemId: CanvasItemId, code: string, tagDraft: string) => void;
  readonly onDiagramItemAdd: (pageId: PageId, kind: DiagramItemKind, label: string, tagDraft: string) => void;
  readonly onDiagramItemChange: (canvasItemId: CanvasItemId, kind: DiagramItemKind, label: string, tagDraft: string) => void;
  readonly onImageItemAdd: (pageId: PageId, dataUrl: string, mediaType: string, caption: string, tagDraft: string) => void;
  readonly onImageItemMetadataChange: (canvasItemId: CanvasItemId, caption: string, tagDraft: string) => void;
  readonly onLinkCardAdd: (pageId: PageId, url: string, note: string, tagDraft: string) => void;
  readonly onLinkCardTagsChange: (canvasItemId: CanvasItemId, tagDraft: string) => void;
  readonly onPageTextCanvasChange: (pageId: PageId, snapshot: PageTldrawCanvasSnapshot) => void;
  readonly onTextCanvasItemTagsChange: (canvasItemId: CanvasItemId, tagDraft: string) => void;
  readonly searchQuery: string;
  readonly searchResults: readonly SearchResult[];
  readonly onSearchQueryChange: (query: string) => void;
  readonly onSearchResultOpen: (result: SearchResult) => void;
}

const DrawingScreen = ({
  activePage,
  notebook,
  highlightedCanvasItemId,
  saveStatus,
  theme,
  onThemeChange,
  aiEnabled,
  onAiEnabledChange,
  onNotebookOpen,
  onPageOpen,
  onPageCreate,
  onNotebookExport,
  onNotebookImport,
  notebookExportJson,
  backupStatus,
  onSaveRetry,
  onConflictReload,
  onCodeBlockAdd,
  onCodeBlockChange,
  onDiagramItemAdd,
  onDiagramItemChange,
  onImageItemAdd,
  onImageItemMetadataChange,
  onLinkCardAdd,
  onLinkCardTagsChange,
  onPageTextCanvasChange,
  onTextCanvasItemTagsChange,
  searchQuery,
  searchResults,
  onSearchQueryChange,
  onSearchResultOpen
}: DrawingScreenProps) => {
  const [currentEditor, setCurrentEditor] = useState<TldrawEditor | null>(null);
  const [showHamburgerMenu, setShowHamburgerMenu] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [activeModal, setActiveModal] = useState<CanvasModalKind | null>(null);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [activeCommandIndex, setActiveCommandIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [showSlowSaveToast, setShowSlowSaveToast] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  useEffect(() => {
    if (saveStatus.kind !== "saving") {
      return;
    }
    const timer = setTimeout(() => setShowSlowSaveToast(true), 1500);
    return () => {
      clearTimeout(timer);
      setShowSlowSaveToast(false);
    };
  }, [saveStatus.kind]);

  useEffect(() => {
    if (!showHamburgerMenu) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setShowHamburgerMenu(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);

    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [showHamburgerMenu]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setShowHamburgerMenu(false);
        setActiveModal(null);
        setIsCommandPaletteOpen(true);
        setCommandQuery("");
        setActiveCommandIndex(0);
        return;
      }

      if (event.key === "Escape") {
        setShowHamburgerMenu(false);
        setActiveModal(null);
        setIsCommandPaletteOpen(false);
        setIsDrawerOpen(false);
        setIsSearchOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const openCanvasModal = (modal: CanvasModalKind) => {
    setShowHamburgerMenu(false);
    setIsCommandPaletteOpen(false);
    setIsDrawerOpen(false);
    setIsSearchOpen(false);
    setCommandQuery("");
    setActiveCommandIndex(0);
    setActiveModal(modal);
  };

  const closeCanvasModal = () => setActiveModal(null);

  if (activePage.kind === "invalid-section") {
    return (
      <main className="drawing-screen" role="alert" aria-labelledby="ds-error-title">
        <header className="drawing-screen__header">
          <button type="button" className="drawing-screen__notebook-btn" onClick={onNotebookOpen}>
            Notebook Management
          </button>
        </header>
        <div className="drawing-screen__error">
          <h2 id="ds-error-title">Section not found</h2>
          <p>
            This Page URL points to a Section that is not in this Notebook:
            {" "}{activePage.sectionId}
          </p>
        </div>
      </main>
    );
  }

  if (activePage.kind === "invalid-page") {
    return (
      <main className="drawing-screen" role="alert" aria-labelledby="ds-error-title">
        <header className="drawing-screen__header">
          <button type="button" className="drawing-screen__notebook-btn" onClick={onNotebookOpen}>
            Notebook Management
          </button>
        </header>
        <div className="drawing-screen__error">
          <h2 id="ds-error-title">Page not found</h2>
          <p>
            {activePage.section.title} does not contain this Page:
            {" "}{activePage.pageId}
          </p>
        </div>
      </main>
    );
  }

  const { page, section } = activePage;
  const pageCanvasItems = notebook.canvasItems.filter((item) => item.pageId === page.id);
  const showEmptyPrompts = page.id === STARTER_DEFAULT_PAGE_ID && pageCanvasItems.length === 0;
  const pageTextItems = notebook.canvasItems.filter(
    (item): item is TextCanvasItem => item.pageId === page.id && item.type === "text"
  );
  const commandActions: readonly CommandAction[] = [
    {
      id: "toggle-drawer",
      label: isDrawerOpen ? "Close Notebook Drawer" : "Open Notebook Drawer",
      description: "Browse Sections and Pages",
      keywords: "drawer pages sections navigate browse",
      run: () => setIsDrawerOpen((open) => !open)
    },
    {
      id: "search-notebook",
      label: "Search Notebook",
      description: "Find Canvas Items by keyword",
      keywords: "search notebook find keyword canvas items",
      run: () => setIsSearchOpen(true)
    },
    {
      id: "rename-sections",
      label: "Rename Sections",
      description: "Use Notebook Management",
      keywords: "rename section notebook management",
      run: onNotebookOpen
    },
    ...notebook.pages.map((notebookPage) => {
      const notebookSection = getSection(notebook, notebookPage.sectionId);

      return {
        id: `page-${notebookPage.id}`,
        label: `Switch Page: ${notebookPage.title}`,
        description: notebookSection?.title ?? "Unknown Section",
        keywords: `switch page ${notebookPage.title} ${notebookSection?.title ?? ""}`,
        run: () => onPageOpen(notebookPage.sectionId, notebookPage.id)
      };
    }),
    ...notebook.sections.map((notebookSection) => ({
      id: `new-page-${notebookSection.id}`,
      label: `New Page in ${notebookSection.title}`,
      description: "Create and open a blank page",
      keywords: `new page create ${notebookSection.title}`,
      run: () => onPageCreate(notebookSection.id)
    })),
    {
      id: "export-notebook",
      label: "Export Notebook Backup",
      description: "Open export modal",
      keywords: "export backup notebook",
      run: () => openCanvasModal("export")
    },
    {
      id: "import-notebook",
      label: "Import Notebook Export",
      description: "Open import modal",
      keywords: "import backup notebook",
      run: () => openCanvasModal("import")
    },
    {
      id: "keyboard-shortcuts",
      label: "Keyboard Shortcuts",
      description: "Open shortcuts modal",
      keywords: "keyboard shortcuts help",
      run: () => openCanvasModal("shortcuts")
    },
    {
      id: "settings",
      label: "Settings",
      description: "Open settings modal",
      keywords: "settings preferences",
      run: () => openCanvasModal("settings")
    }
  ];

  return (
    <main className="drawing-screen" aria-labelledby="ds-notebook-title">
      <header className="drawing-screen__header">
        <div className="drawing-screen__menu-wrap" ref={menuRef}>
          <button
            type="button"
            className="hamburger-btn"
            aria-label="Open notebook menu"
            aria-expanded={showHamburgerMenu}
            aria-haspopup="menu"
            onClick={() => setShowHamburgerMenu((current) => !current)}
          >
            ≡
          </button>
          {showHamburgerMenu ? (
            <div className="hamburger-menu" role="menu" aria-label="Notebook actions">
              <div className="hamburger-menu__section">
                <span className="hamburger-menu__label">Theme</span>
                <div className="theme-picker" role="group" aria-label="Theme picker">
                  {(["system", "light", "dark"] as const).map((themeOption) => (
                    <button
                      key={themeOption}
                      type="button"
                      className={
                        theme === themeOption
                          ? "theme-picker__option theme-picker__option--active"
                          : "theme-picker__option"
                      }
                      aria-pressed={theme === themeOption}
                      onClick={() => {
                        onThemeChange(themeOption);
                        setShowHamburgerMenu(false);
                      }}
                    >
                      {themeOption.charAt(0).toUpperCase() + themeOption.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              <button
                type="button"
                className="hamburger-menu__item"
                onClick={() => openCanvasModal("shortcuts")}
              >
                Keyboard Shortcuts
              </button>
              <button
                type="button"
                className="hamburger-menu__item"
                onClick={() => openCanvasModal("settings")}
              >
                Settings
              </button>
              <button
                type="button"
                className="hamburger-menu__item"
                onClick={() => openCanvasModal("export")}
              >
                Export Notebook Backup
              </button>
              <button
                type="button"
                className="hamburger-menu__item"
                onClick={() => openCanvasModal("import")}
              >
                Import Notebook Export
              </button>
            </div>
          ) : null}
        </div>
        <button
          type="button"
          className="drawing-screen__drawer-btn"
          aria-label={isDrawerOpen ? "Close Notebook Drawer" : "Open Notebook Drawer"}
          aria-expanded={isDrawerOpen}
          onClick={() => setIsDrawerOpen((open) => !open)}
        >
          Pages
        </button>
        <button
          type="button"
          className="drawing-screen__notebook-btn"
          onClick={onNotebookOpen}
        >
          Notebook Management
        </button>
        <button
          type="button"
          className="drawing-screen__search-btn"
          onClick={() => setIsSearchOpen(true)}
        >
          Search Notebook
        </button>
        <h1 id="ds-notebook-title" className="drawing-screen__notebook-title">
          {notebook.title}
        </h1>
        <div className="drawing-screen__page-crumb">
          <span className="drawing-screen__section-name">{section.title}</span>
          <h2 className="drawing-screen__page-title">{page.title}</h2>
        </div>
        <button
          type="button"
          className="drawing-screen__items-btn"
          onClick={() => openCanvasModal("inspector")}
        >
          Canvas Items
        </button>
        <span className="privacy-badge drawing-screen__privacy-badge" aria-label="Notebook privacy mode">
          Private Notebook
        </span>
      </header>
      <div className="drawing-screen__body">
        <div className="drawing-screen__canvas-area">
          {showEmptyPrompts ? (
            <EmptyCanvasPrompts
              onTextTool={() => currentEditor?.setCurrentTool("text")}
              onDrawTool={() => currentEditor?.setCurrentTool("draw")}
                onSearchNotebook={() => setIsSearchOpen(true)}
            />
          ) : null}
          <PageTextCanvas
            page={page}
            notebook={notebook}
            highlightedCanvasItemId={highlightedCanvasItemId}
            onEditorReady={setCurrentEditor}
            onPageTextCanvasChange={onPageTextCanvasChange}
          />
        </div>
        <NotebookDrawer
          isOpen={isDrawerOpen}
          notebook={notebook}
          currentPageId={page.id}
          onPageOpen={(sectionId, pageId) => {
            setIsDrawerOpen(false);
            onPageOpen(sectionId, pageId);
          }}
          onPageCreate={(sectionId) => {
            setIsDrawerOpen(false);
            onPageCreate(sectionId);
          }}
          onClose={() => setIsDrawerOpen(false)}
        />
      </div>
      <CommandPalette
        actions={commandActions}
        activeIndex={activeCommandIndex}
        isOpen={isCommandPaletteOpen}
        query={commandQuery}
        onActiveIndexChange={setActiveCommandIndex}
        onClose={() => setIsCommandPaletteOpen(false)}
        onQueryChange={setCommandQuery}
      />
      <CanvasModal
        isOpen={activeModal === "shortcuts"}
        title="Keyboard Shortcuts"
        onClose={closeCanvasModal}
      >
        <ShortcutsModalContent />
      </CanvasModal>
      <CanvasModal
        isOpen={activeModal === "settings"}
        title="Settings"
        onClose={closeCanvasModal}
      >
        <SettingsModalContent aiEnabled={aiEnabled} onAiEnabledChange={onAiEnabledChange} />
      </CanvasModal>
      <CanvasModal
        isOpen={activeModal === "export"}
        title="Export Notebook Backup"
        onClose={closeCanvasModal}
      >
        <NotebookExportModalContent
          exportJson={notebookExportJson}
          status={backupStatus}
          onExport={onNotebookExport}
        />
      </CanvasModal>
      <CanvasModal
        isOpen={activeModal === "import"}
        title="Import Notebook Export"
        onClose={closeCanvasModal}
      >
        <NotebookImportModalContent onImport={onNotebookImport} status={backupStatus} />
      </CanvasModal>
      <CanvasModal
        isOpen={activeModal === "inspector"}
        title="Canvas Items"
        onClose={closeCanvasModal}
        scrollable
      >
        <ItemInspectorContent
          page={page}
          notebook={notebook}
          pageTextItems={pageTextItems}
          highlightedCanvasItemId={highlightedCanvasItemId}
          onTextCanvasItemTagsChange={onTextCanvasItemTagsChange}
          onLinkCardAdd={onLinkCardAdd}
          onLinkCardTagsChange={onLinkCardTagsChange}
          onImageItemAdd={onImageItemAdd}
          onImageItemMetadataChange={onImageItemMetadataChange}
          onDiagramItemAdd={onDiagramItemAdd}
          onDiagramItemChange={onDiagramItemChange}
          onCodeBlockAdd={onCodeBlockAdd}
          onCodeBlockChange={onCodeBlockChange}
        />
      </CanvasModal>
      <CanvasToastArea
        saveStatus={saveStatus}
        showSlowSaveToast={showSlowSaveToast}
        backupStatus={backupStatus}
        onSaveRetry={onSaveRetry}
        onConflictReload={onConflictReload}
      />
      <SearchOverlay
        isOpen={isSearchOpen}
        query={searchQuery}
        results={searchResults}
        notebook={notebook}
        onQueryChange={onSearchQueryChange}
        onResultOpen={onSearchResultOpen}
        onClose={() => { setIsSearchOpen(false); onSearchQueryChange(""); }}
      />
      {aiEnabled ? <AssistantBubble /> : null}
    </main>
  );
};

// Section colors for visual differentiation in the Notebook Drawer.
const SECTION_COLORS = [
  "#6952c7",
  "#1a7a4c",
  "#c75219",
  "#2152b5",
  "#8a4a9e",
  "#7a5219"
] as const;

interface NotebookDrawerProps {
  readonly isOpen: boolean;
  readonly notebook: Notebook;
  readonly currentPageId: PageId;
  readonly onPageOpen: (sectionId: SectionId, pageId: PageId) => void;
  readonly onPageCreate: (sectionId: SectionId) => void;
  readonly onClose: () => void;
}

const NotebookDrawer = ({
  isOpen,
  notebook,
  currentPageId,
  onPageOpen,
  onPageCreate,
  onClose
}: NotebookDrawerProps) => (
  <>
    {isOpen ? (
      <div
        className="notebook-drawer-backdrop"
        aria-hidden="true"
        onClick={onClose}
      />
    ) : null}
    <aside
      className={isOpen ? "notebook-drawer notebook-drawer--open" : "notebook-drawer"}
      aria-label="Notebook Drawer"
      aria-hidden={!isOpen}
    >
      <div className="notebook-drawer__header">
        <span className="notebook-drawer__title">Pages</span>
        <button
          type="button"
          className="notebook-drawer__close"
          aria-label="Close Notebook Drawer"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      {isOpen ? (
        <nav className="notebook-drawer__tree" aria-label="Sections and Pages">
          {notebook.sections.length === 0 ? (
            <p className="notebook-drawer__empty">No Sections yet.</p>
          ) : (
            notebook.sections.map((section, index) => {
              const sectionColor = SECTION_COLORS[index % SECTION_COLORS.length];
              const sectionPages = notebook.pages.filter(
                (page) => page.sectionId === section.id
              );

              return (
                <div key={section.id} className="notebook-drawer__section">
                  <div
                    className="notebook-drawer__section-header"
                    style={{ borderLeftColor: sectionColor }}
                  >
                    <span
                      className="notebook-drawer__section-name"
                      style={{ color: sectionColor }}
                    >
                      {section.title}
                    </span>
                    <button
                      type="button"
                      className="notebook-drawer__new-page-btn"
                      aria-label={`New Page in ${section.title}`}
                      title={`New Page in ${section.title}`}
                      onClick={() => onPageCreate(section.id)}
                    >
                      +
                    </button>
                  </div>
                  {sectionPages.length === 0 ? (
                    <p className="notebook-drawer__no-pages">No Pages yet</p>
                  ) : (
                    <ul className="notebook-drawer__pages">
                      {sectionPages.map((page) => (
                        <li key={page.id}>
                          <button
                            type="button"
                            className={
                              page.id === currentPageId
                                ? "notebook-drawer__page-btn notebook-drawer__page-btn--active"
                                : "notebook-drawer__page-btn"
                            }
                            aria-current={page.id === currentPageId ? "page" : undefined}
                            onClick={() => onPageOpen(page.sectionId, page.id)}
                          >
                            {page.title}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })
          )}
        </nav>
      ) : null}
    </aside>
  </>
);

const AssistantBubble = () => (
  <button type="button" className="assistant-bubble" aria-label="Open Notebook Assistant">
    Ask Notebook Assistant
  </button>
);

interface CanvasToastAreaProps {
  readonly saveStatus: SaveStatus;
  readonly showSlowSaveToast: boolean;
  readonly backupStatus: BackupStatus;
  readonly onSaveRetry: () => void;
  readonly onConflictReload: () => void;
}

const CanvasToastArea = ({
  saveStatus,
  showSlowSaveToast,
  backupStatus,
  onSaveRetry,
  onConflictReload
}: CanvasToastAreaProps) => {
  const toasts: ReactNode[] = [];

  if (showSlowSaveToast && saveStatus.kind === "saving") {
    toasts.push(
      <div key="saving" className="canvas-toast canvas-toast--info" aria-live="polite">
        Saving Notebook changes…
      </div>
    );
  }

  if (saveStatus.kind === "failed") {
    toasts.push(
      <div key="save-failed" className="canvas-toast canvas-toast--error" role="alert">
        <span>Autosave failed — your edits are not yet persisted. Retry before closing this tab.</span>
        <button type="button" className="canvas-toast__action" onClick={onSaveRetry}>
          Retry Save
        </button>
      </div>
    );
  }

  if (saveStatus.kind === "conflict") {
    toasts.push(
      <div key="conflict" className="canvas-toast canvas-toast--error" role="alert">
        <span>Another tab changed this Notebook — autosave is paused.</span>
        <button type="button" className="canvas-toast__action" onClick={onConflictReload}>
          Reload Stored Notebook
        </button>
      </div>
    );
  }

  if (backupStatus.kind === "success") {
    toasts.push(
      <div key="backup-success" className="canvas-toast canvas-toast--success" role="status">
        {backupStatus.message}
      </div>
    );
  }

  if (backupStatus.kind === "failed") {
    toasts.push(
      <div key="backup-failed" className="canvas-toast canvas-toast--error" role="alert">
        {backupStatus.message}
      </div>
    );
  }

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="canvas-toast-area" aria-label="Notebook notifications">
      {toasts}
    </div>
  );
};

interface SearchOverlayProps {
  readonly isOpen: boolean;
  readonly query: string;
  readonly results: readonly SearchResult[];
  readonly notebook: Notebook;
  readonly onQueryChange: (query: string) => void;
  readonly onResultOpen: (result: SearchResult) => void;
  readonly onClose: () => void;
}

const SearchOverlay = ({
  isOpen,
  query,
  results,
  notebook,
  onQueryChange,
  onResultOpen,
  onClose
}: SearchOverlayProps) => {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  const groupedResults = useMemo(() => {
    interface GroupEntry {
      readonly pageId: PageId;
      readonly pageTitle: string;
      readonly sectionTitle: string;
      readonly results: SearchResult[];
    }
    const groups = new Map<PageId, GroupEntry>();

    for (const result of results) {
      if (!groups.has(result.pageId)) {
        const page = notebook.pages.find((p) => p.id === result.pageId);
        const section = notebook.sections.find((s) => s.id === result.sectionId);
        groups.set(result.pageId, {
          pageId: result.pageId,
          pageTitle: page?.title ?? "Unknown Page",
          sectionTitle: section?.title ?? "Unknown Section",
          results: []
        });
      }
      groups.get(result.pageId)?.results.push(result);
    }

    return Array.from(groups.values());
  }, [results, notebook]);

  if (!isOpen) {
    return null;
  }

  const handleResultOpen = (result: SearchResult) => {
    onQueryChange("");
    onClose();
    onResultOpen(result);
  };

  return (
    <div className="search-overlay-backdrop" onClick={onClose}>
      <div
        className="search-overlay"
        role="dialog"
        aria-modal="true"
        aria-label="Search Notebook"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="search-overlay__header">
          <input
            ref={inputRef}
            className="search-overlay__input"
            aria-label="Search Notebook"
            placeholder="Search Canvas Items, Tags, Page titles…"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                onQueryChange("");
                onClose();
              }
            }}
          />
          <button
            type="button"
            className="search-overlay__close"
            aria-label="Close Search"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="search-overlay__body" aria-label="Search Results">
          {query.trim().length === 0 ? (
            <p className="search-overlay__hint">
              Type to search Canvas Items, Tags, and Page titles.
            </p>
          ) : groupedResults.length === 0 ? (
            <p className="search-overlay__empty">
              No Search Results found in this Notebook.
            </p>
          ) : (
            groupedResults.map((group) => (
              <div key={group.pageId} className="search-overlay__page-group">
                <p className="search-overlay__page-header">
                  <span className="search-overlay__section-name">
                    {group.sectionTitle}
                  </span>
                  {" › "}
                  <span className="search-overlay__page-name">
                    {group.pageTitle}
                  </span>
                </p>
                {group.results.map((result) => (
                  <button
                    key={result.id}
                    type="button"
                    className="search-overlay__result"
                    aria-label="Open Result"
                    onClick={() => handleResultOpen(result)}
                  >
                    <span className="search-overlay__result-label">
                      {result.sourceLabel}
                    </span>
                    {result.matchedTags.length > 0 ? (
                      <span className="search-overlay__result-tags">
                        {result.matchedTags.map((tag) => `#${tag}`).join(", ")}
                      </span>
                    ) : null}
                    <span className="search-overlay__result-snippet">
                      {result.snippet}
                    </span>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

interface EmptyCanvasPromptsProps {
  readonly onTextTool: () => void;
  readonly onDrawTool: () => void;
  readonly onSearchNotebook: () => void;
}

const EmptyCanvasPrompts = ({
  onTextTool,
  onDrawTool,
  onSearchNotebook
}: EmptyCanvasPromptsProps) => (
  <div className="empty-canvas-prompts" aria-label="Empty Canvas Prompts">
    <div className="empty-canvas-prompts__card">
      <p className="empty-canvas-prompts__hint">
        Start capturing rough interview-prep work
      </p>
      <div className="empty-canvas-prompts__actions">
        <button
          type="button"
          className="empty-canvas-prompt-btn"
          onClick={onTextTool}
        >
          Type a note
        </button>
        <button
          type="button"
          className="empty-canvas-prompt-btn"
          onClick={onDrawTool}
        >
          Sketch
        </button>
        <span className="empty-canvas-prompt-hint">
          Paste a screenshot or image, or use Canvas Items to add an Image Item
        </span>
        <span className="empty-canvas-prompt-hint">
          Add a Link Card via Canvas Items in the header
        </span>
        <button
          type="button"
          className="empty-canvas-prompt-btn empty-canvas-prompt-btn--secondary"
          onClick={onSearchNotebook}
        >
          Search Notebook
        </button>
      </div>
    </div>
  </div>
);

interface PageTextCanvasProps {
  readonly page: Page;
  readonly notebook: Notebook;
  readonly highlightedCanvasItemId: CanvasItemId | null;
  readonly onEditorReady?: (editor: TldrawEditor | null) => void;
  readonly onPageTextCanvasChange: (
    pageId: PageId,
    snapshot: PageTldrawCanvasSnapshot
  ) => void;
}

const PageTextCanvas = ({
  page,
  notebook,
  highlightedCanvasItemId,
  onEditorReady,
  onPageTextCanvasChange
}: PageTextCanvasProps) => {
  const saveTimeoutRef = useRef<number | undefined>(undefined);
  const editorRef = useRef<TldrawEditor | null>(null);
  const initialTextItems = useMemo(
    () =>
      notebook.canvasItems.filter(
        (canvasItem): canvasItem is TextCanvasItem =>
          canvasItem.pageId === page.id && canvasItem.type === "text"
      ),
    [notebook.canvasItems, page.id]
  );
  const initialRegions = useMemo(
    () => notebook.canvasRegions.filter((region) => region.pageId === page.id),
    [notebook.canvasRegions, page.id]
  );
  const initialFreehandDrawingItems = useMemo(
    () =>
      notebook.canvasItems.filter(
        (canvasItem): canvasItem is FreehandDrawingCanvasItem =>
          canvasItem.pageId === page.id && canvasItem.type === "freehand-drawing"
      ),
    [notebook.canvasItems, page.id]
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
      const drawingDrafts = toTldrawFreehandDrawingShapeDrafts(
        initialFreehandDrawingItems
      );
      editorRef.current = editor;
      onEditorReady?.(editor);

      if (drafts.length > 0 || drawingDrafts.length > 0) {
        editor.createShapes([...drafts, ...drawingDrafts]);
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
              type: shape.type,
              meta: {
                ...shape.meta,
                canvasItemId: canvasItemIdForShape(shape)
              }
            });
          }
        }

        onPageTextCanvasChange(
          page.id,
          pageTldrawCanvasSnapshotFromTldrawShapes(page.id, shapes, (shape) =>
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
        editorRef.current = null;
        onEditorReady?.(null);
        unsubscribe();
      };
    },
    [
      initialFreehandDrawingItems,
      initialRegions,
      initialTextItems,
      onEditorReady,
      onPageTextCanvasChange,
      page.id
    ]
  );

  return (
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
      <Tldraw
        assetUrls={LOCAL_TLDRAW_TEXT_ASSET_URLS}
        autoFocus
        initialState="text"
        onMount={handleMount}
      />
    </div>
  );
};

interface TextCanvasItemTagsProps {
  readonly pageTextItems: readonly TextCanvasItem[];
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

interface PageLinkCardsProps {
  readonly page: Page;
  readonly notebook: Notebook;
  readonly onLinkCardAdd: (
    pageId: PageId,
    url: string,
    note: string,
    tagDraft: string
  ) => void;
  readonly onLinkCardTagsChange: (
    canvasItemId: CanvasItemId,
    tagDraft: string
  ) => void;
}

const PageLinkCards = ({
  page,
  notebook,
  onLinkCardAdd,
  onLinkCardTagsChange
}: PageLinkCardsProps) => {
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const pageLinkCards = useMemo(
    () =>
      notebook.canvasItems.filter(
        (canvasItem): canvasItem is LinkCardCanvasItem =>
          canvasItem.pageId === page.id && canvasItem.type === "link-card"
      ),
    [notebook.canvasItems, page.id]
  );

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onLinkCardAdd(page.id, url, note, tagDraft);
    setUrl("");
    setNote("");
    setTagDraft("");
  };

  return (
    <section className="link-card-panel" aria-labelledby="link-cards-title">
      <div>
        <h4 id="link-cards-title">Link Cards</h4>
        <p>
          Paste a URL with optional notes and Tags. The Notebook stores only the
          URL and your notes; it does not crawl or clip article content.
        </p>
      </div>
      <form className="link-card-form" onSubmit={handleSubmit}>
        <label htmlFor="link-card-url">
          Link Card URL
          <input
            id="link-card-url"
            type="url"
            required
            placeholder="https://example.com/problem"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
          />
        </label>
        <label htmlFor="link-card-note">
          Optional notes
          <textarea
            id="link-card-note"
            placeholder="Why this URL matters for this Page"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
        <label htmlFor="link-card-tags">
          Optional Tags
          <input
            id="link-card-tags"
            placeholder="e.g. graphs, research"
            value={tagDraft}
            onChange={(event) => setTagDraft(event.target.value)}
          />
        </label>
        <button type="submit">Add Link Card</button>
      </form>
      {pageLinkCards.length > 0 ? (
        <ul className="link-card-list" aria-label="Link Cards on this Page">
          {pageLinkCards.map((linkCard) => (
            <li key={linkCard.id}>
              <a href={linkCard.url} rel="noreferrer" target="_blank">
                {linkCard.url}
              </a>
              {linkCard.note.length > 0 ? <p>{linkCard.note}</p> : null}
              <label htmlFor={`${linkCard.id}-tags`}>
                Tags for {linkCard.url}
                <input
                  id={`${linkCard.id}-tags`}
                  defaultValue={linkCard.tags.join(", ")}
                  placeholder="e.g. graphs, research"
                  onChange={(event) =>
                    onLinkCardTagsChange(linkCard.id, event.target.value)
                  }
                />
              </label>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
};

interface PageImageItemsProps {
  readonly page: Page;
  readonly notebook: Notebook;
  readonly highlightedCanvasItemId: CanvasItemId | null;
  readonly onImageItemAdd: (
    pageId: PageId,
    dataUrl: string,
    mediaType: string,
    caption: string,
    tagDraft: string
  ) => void;
  readonly onImageItemMetadataChange: (
    canvasItemId: CanvasItemId,
    caption: string,
    tagDraft: string
  ) => void;
}

const PageImageItems = ({
  page,
  notebook,
  highlightedCanvasItemId,
  onImageItemAdd,
  onImageItemMetadataChange
}: PageImageItemsProps) => {
  const [imageDraft, setImageDraft] = useState<{
    readonly dataUrl: string;
    readonly mediaType: string;
    readonly name: string;
  } | null>(null);
  const [caption, setCaption] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const pageImageItems = useMemo(
    () =>
      notebook.canvasItems.filter(
        (canvasItem): canvasItem is ImageCanvasItem =>
          canvasItem.pageId === page.id && canvasItem.type === "image"
      ),
    [notebook.canvasItems, page.id]
  );

  const readImageFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      return;
    }

    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        setImageDraft({
          dataUrl: reader.result,
          mediaType: file.type,
          name: file.name || "Pasted image"
        });
      }
    });
    reader.readAsDataURL(file);
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (file !== undefined) {
      readImageFile(file);
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    const imageFile = Array.from(event.clipboardData.files).find((file) =>
      file.type.startsWith("image/")
    );

    if (imageFile !== undefined) {
      event.preventDefault();
      readImageFile(imageFile);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (imageDraft === null) {
      return;
    }

    onImageItemAdd(
      page.id,
      imageDraft.dataUrl,
      imageDraft.mediaType,
      caption,
      tagDraft
    );
    setImageDraft(null);
    setCaption("");
    setTagDraft("");
  };

  return (
    <section className="image-item-panel" aria-labelledby="image-items-title">
      <div>
        <h4 id="image-items-title">Image Items</h4>
        <p>
          Add or paste screenshots with optional captions and Tags. Image capture
          stays local and does not require AI summaries or classification.
        </p>
      </div>
      <form className="image-item-form" onSubmit={handleSubmit}>
        <div
          className="image-paste-target"
          onPaste={handlePaste}
          tabIndex={0}
          role="button"
          aria-label="Paste an image or screenshot"
        >
          Paste an image here, or choose a local image file.
        </div>
        <label htmlFor="image-item-file">
          Image Item file
          <input
            id="image-item-file"
            type="file"
            accept="image/*"
            onChange={handleFileChange}
          />
        </label>
        {imageDraft !== null ? (
          <p className="image-item-draft" aria-live="polite">
            Ready to add: {imageDraft.name}
          </p>
        ) : null}
        <label htmlFor="image-item-caption">
          Optional caption
          <input
            id="image-item-caption"
            placeholder="e.g. whiteboard trace after heap optimization"
            value={caption}
            onChange={(event) => setCaption(event.target.value)}
          />
        </label>
        <label htmlFor="image-item-tags">
          Image Tags
          <input
            id="image-item-tags"
            placeholder="e.g. diagrams, heap"
            value={tagDraft}
            onChange={(event) => setTagDraft(event.target.value)}
          />
        </label>
        <button type="submit" disabled={imageDraft === null}>
          Add Image Item
        </button>
      </form>
      {pageImageItems.length > 0 ? (
        <ul className="image-item-list" aria-label="Image Items on this Page">
          {pageImageItems.map((imageItem) => (
            <EditableImageItem
              imageItem={imageItem}
              isHighlighted={highlightedCanvasItemId === imageItem.id}
              key={imageItem.id}
              onImageItemMetadataChange={onImageItemMetadataChange}
            />
          ))}
        </ul>
      ) : null}
    </section>
  );
};

interface EditableImageItemProps {
  readonly imageItem: ImageCanvasItem;
  readonly isHighlighted: boolean;
  readonly onImageItemMetadataChange: (
    canvasItemId: CanvasItemId,
    caption: string,
    tagDraft: string
  ) => void;
}

const EditableImageItem = ({
  imageItem,
  isHighlighted,
  onImageItemMetadataChange
}: EditableImageItemProps) => {
  const [captionDraft, setCaptionDraft] = useState(imageItem.caption);
  const [tagDraft, setTagDraft] = useState(imageItem.tags.join(", "));

  const handleCaptionChange = (nextCaption: string) => {
    setCaptionDraft(nextCaption);
    onImageItemMetadataChange(imageItem.id, nextCaption, tagDraft);
  };

  const handleTagsChange = (nextTagDraft: string) => {
    setTagDraft(nextTagDraft);
    onImageItemMetadataChange(imageItem.id, captionDraft, nextTagDraft);
  };

  return (
    <li className={isHighlighted ? "image-item-list__item--highlighted" : undefined}>
      {isHighlighted ? (
        <span role="status" aria-label="Highlighted Image Item Canvas Region">
          Highlighted Image Item
        </span>
      ) : null}
      <img
        alt={imageItem.caption || "Image Item"}
        src={imageItem.dataUrl}
      />
      <label htmlFor={`${imageItem.id}-caption`}>
        Edit Image Item caption
        <input
          id={`${imageItem.id}-caption`}
          value={captionDraft}
          placeholder="Optional caption"
          onChange={(event) => handleCaptionChange(event.target.value)}
        />
      </label>
      <label htmlFor={`${imageItem.id}-tags`}>
        Tags for this Image Item
        <input
          id={`${imageItem.id}-tags`}
          value={tagDraft}
          placeholder="e.g. diagrams, heap"
          onChange={(event) => handleTagsChange(event.target.value)}
        />
      </label>
    </li>
  );
};

interface PageDiagramItemsProps {
  readonly page: Page;
  readonly notebook: Notebook;
  readonly highlightedCanvasItemId: CanvasItemId | null;
  readonly onDiagramItemAdd: (
    pageId: PageId,
    kind: DiagramItemKind,
    label: string,
    tagDraft: string
  ) => void;
  readonly onDiagramItemChange: (
    canvasItemId: CanvasItemId,
    kind: DiagramItemKind,
    label: string,
    tagDraft: string
  ) => void;
}

const DIAGRAM_ITEM_KINDS: readonly DiagramItemKind[] = [
  "box",
  "arrow",
  "label",
  "sticky-note"
];

const PageDiagramItems = ({
  page,
  notebook,
  highlightedCanvasItemId,
  onDiagramItemAdd,
  onDiagramItemChange
}: PageDiagramItemsProps) => {
  const [kind, setKind] = useState<DiagramItemKind>("box");
  const [label, setLabel] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const pageDiagramItems = useMemo(
    () =>
      notebook.canvasItems.filter(
        (canvasItem): canvasItem is DiagramCanvasItem =>
          canvasItem.pageId === page.id && canvasItem.type === "diagram"
      ),
    [notebook.canvasItems, page.id]
  );

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onDiagramItemAdd(page.id, kind, label, tagDraft);
    setKind("box");
    setLabel("");
    setTagDraft("");
  };

  return (
    <section className="diagram-item-panel" aria-labelledby="diagram-items-title">
      <div>
        <h4 id="diagram-items-title">Diagram Items</h4>
        <p>
          Add searchable boxes, arrows, labels, and sticky notes for system design
          diagrams. Labels and Tags use app-owned Canvas Regions for Search Results.
        </p>
      </div>
      <form className="diagram-item-form" onSubmit={handleSubmit}>
        <label htmlFor="diagram-item-kind">
          Diagram Item type
          <select
            id="diagram-item-kind"
            value={kind}
            onChange={(event) => setKind(event.target.value as DiagramItemKind)}
          >
            {DIAGRAM_ITEM_KINDS.map((diagramKind) => (
              <option key={diagramKind} value={diagramKind}>
                {diagramKindLabel(diagramKind)}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor="diagram-item-label">
          Diagram Item label
          <input
            id="diagram-item-label"
            required
            placeholder="e.g. API Gateway forwards writes"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
        </label>
        <label htmlFor="diagram-item-tags">
          Diagram Tags
          <input
            id="diagram-item-tags"
            placeholder="e.g. queues, availability"
            value={tagDraft}
            onChange={(event) => setTagDraft(event.target.value)}
          />
        </label>
        <button type="submit" disabled={label.trim().length === 0}>
          Add Diagram Item
        </button>
      </form>
      {pageDiagramItems.length > 0 ? (
        <ul className="diagram-item-list" aria-label="Diagram Items on this Page">
          {pageDiagramItems.map((diagramItem) => (
            <EditableDiagramItem
              diagramItem={diagramItem}
              isHighlighted={highlightedCanvasItemId === diagramItem.id}
              key={diagramItem.id}
              onDiagramItemChange={onDiagramItemChange}
            />
          ))}
        </ul>
      ) : null}
    </section>
  );
};

interface EditableDiagramItemProps {
  readonly diagramItem: DiagramCanvasItem;
  readonly isHighlighted: boolean;
  readonly onDiagramItemChange: (
    canvasItemId: CanvasItemId,
    kind: DiagramItemKind,
    label: string,
    tagDraft: string
  ) => void;
}

const EditableDiagramItem = ({
  diagramItem,
  isHighlighted,
  onDiagramItemChange
}: EditableDiagramItemProps) => {
  const [kindDraft, setKindDraft] = useState<DiagramItemKind>(diagramItem.kind);
  const [labelDraft, setLabelDraft] = useState(diagramItem.label);
  const [tagDraft, setTagDraft] = useState(diagramItem.tags.join(", "));

  const handleKindChange = (nextKind: DiagramItemKind) => {
    setKindDraft(nextKind);

    if (labelDraft.trim().length > 0) {
      onDiagramItemChange(diagramItem.id, nextKind, labelDraft, tagDraft);
    }
  };

  const handleLabelChange = (nextLabel: string) => {
    setLabelDraft(nextLabel);

    if (nextLabel.trim().length > 0) {
      onDiagramItemChange(diagramItem.id, kindDraft, nextLabel, tagDraft);
    }
  };

  const handleTagsChange = (nextTagDraft: string) => {
    setTagDraft(nextTagDraft);

    if (labelDraft.trim().length > 0) {
      onDiagramItemChange(diagramItem.id, kindDraft, labelDraft, nextTagDraft);
    }
  };

  return (
    <li className={isHighlighted ? "diagram-item-list__item--highlighted" : undefined}>
      {isHighlighted ? (
        <span role="status" aria-label="Highlighted Diagram Item Canvas Region">
          Highlighted Diagram Item
        </span>
      ) : null}
      <strong>{diagramKindLabel(kindDraft)}</strong>
      <label htmlFor={`${diagramItem.id}-kind`}>
        Diagram Item kind
        <select
          id={`${diagramItem.id}-kind`}
          value={kindDraft}
          onChange={(event) => handleKindChange(event.target.value as DiagramItemKind)}
        >
          {DIAGRAM_ITEM_KINDS.map((diagramKind) => (
            <option key={diagramKind} value={diagramKind}>
              {diagramKindLabel(diagramKind)}
            </option>
          ))}
        </select>
      </label>
      <label htmlFor={`${diagramItem.id}-label`}>
        Edit Diagram Item label
        <input
          id={`${diagramItem.id}-label`}
          value={labelDraft}
          placeholder="Diagram label"
          onChange={(event) => handleLabelChange(event.target.value)}
        />
      </label>
      <label htmlFor={`${diagramItem.id}-tags`}>
        Tags for this Diagram Item
        <input
          id={`${diagramItem.id}-tags`}
          value={tagDraft}
          placeholder="e.g. queues, availability"
          onChange={(event) => handleTagsChange(event.target.value)}
        />
      </label>
    </li>
  );
};

interface PageCodeBlocksProps {
  readonly page: Page;
  readonly notebook: Notebook;
  readonly highlightedCanvasItemId: CanvasItemId | null;
  readonly onCodeBlockAdd: (
    pageId: PageId,
    code: string,
    tagDraft: string
  ) => void;
  readonly onCodeBlockChange: (
    canvasItemId: CanvasItemId,
    code: string,
    tagDraft: string
  ) => void;
}

const PageCodeBlocks = ({
  page,
  notebook,
  highlightedCanvasItemId,
  onCodeBlockAdd,
  onCodeBlockChange
}: PageCodeBlocksProps) => {
  const [code, setCode] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const pageCodeBlocks = useMemo(
    () =>
      notebook.canvasItems.filter(
        (canvasItem): canvasItem is CodeBlockCanvasItem =>
          canvasItem.pageId === page.id && canvasItem.type === "code-block"
      ),
    [notebook.canvasItems, page.id]
  );

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onCodeBlockAdd(page.id, code, tagDraft);
    setCode("");
    setTagDraft("");
  };

  return (
    <section className="code-block-panel" aria-labelledby="code-blocks-title">
      <div>
        <h4 id="code-blocks-title">Code Blocks</h4>
        <p>
          Capture pseudocode, snippets, or solution drafts as searchable
          reference material only.
        </p>
      </div>
      <form className="code-block-form" onSubmit={handleSubmit}>
        <label htmlFor="code-block-content">
          Code Block content
          <textarea
            id="code-block-content"
            required
            spellCheck={false}
            placeholder="e.g. function twoSum(nums, target) { ... }"
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
        </label>
        <label htmlFor="code-block-tags">
          Code Block Tags
          <input
            id="code-block-tags"
            placeholder="e.g. arrays, pseudocode"
            value={tagDraft}
            onChange={(event) => setTagDraft(event.target.value)}
          />
        </label>
        <button type="submit" disabled={code.trim().length === 0}>
          Add Code Block
        </button>
      </form>
      {pageCodeBlocks.length > 0 ? (
        <ul className="code-block-list" aria-label="Code Blocks on this Page">
          {pageCodeBlocks.map((codeBlock) => (
            <EditableCodeBlock
              codeBlock={codeBlock}
              isHighlighted={highlightedCanvasItemId === codeBlock.id}
              key={codeBlock.id}
              onCodeBlockChange={onCodeBlockChange}
            />
          ))}
        </ul>
      ) : null}
    </section>
  );
};

interface EditableCodeBlockProps {
  readonly codeBlock: CodeBlockCanvasItem;
  readonly isHighlighted: boolean;
  readonly onCodeBlockChange: (
    canvasItemId: CanvasItemId,
    code: string,
    tagDraft: string
  ) => void;
}

const EditableCodeBlock = ({
  codeBlock,
  isHighlighted,
  onCodeBlockChange
}: EditableCodeBlockProps) => {
  const [codeDraft, setCodeDraft] = useState(codeBlock.code);
  const [tagDraft, setTagDraft] = useState(codeBlock.tags.join(", "));

  const handleCodeChange = (nextCode: string) => {
    setCodeDraft(nextCode);

    if (nextCode.trim().length > 0) {
      onCodeBlockChange(codeBlock.id, nextCode, tagDraft);
    }
  };

  const handleTagsChange = (nextTagDraft: string) => {
    setTagDraft(nextTagDraft);

    if (codeDraft.trim().length > 0) {
      onCodeBlockChange(codeBlock.id, codeDraft, nextTagDraft);
    }
  };

  return (
    <li className={isHighlighted ? "code-block-list__item--highlighted" : undefined}>
      {isHighlighted ? (
        <span role="status" aria-label="Highlighted Code Block Canvas Region">
          Highlighted Code Block
        </span>
      ) : null}
      <label htmlFor={`${codeBlock.id}-code`}>
        Edit Code Block
        <textarea
          id={`${codeBlock.id}-code`}
          spellCheck={false}
          value={codeDraft}
          onChange={(event) => handleCodeChange(event.target.value)}
        />
      </label>
      <label htmlFor={`${codeBlock.id}-tags`}>
        Tags for this Code Block
        <input
          id={`${codeBlock.id}-tags`}
          value={tagDraft}
          placeholder="e.g. arrays, pseudocode"
          onChange={(event) => handleTagsChange(event.target.value)}
        />
      </label>
    </li>
  );
};

interface LocalSearchProps {
  readonly query: string;
  readonly results: readonly SearchResult[];
  readonly onQueryChange: (query: string) => void;
  readonly onResultOpen: (result: SearchResult) => void;
}

interface ItemInspectorContentProps {
  readonly page: Page;
  readonly notebook: Notebook;
  readonly pageTextItems: readonly TextCanvasItem[];
  readonly highlightedCanvasItemId: CanvasItemId | null;
  readonly onTextCanvasItemTagsChange: (canvasItemId: CanvasItemId, tagDraft: string) => void;
  readonly onLinkCardAdd: (pageId: PageId, url: string, note: string, tagDraft: string) => void;
  readonly onLinkCardTagsChange: (canvasItemId: CanvasItemId, tagDraft: string) => void;
  readonly onImageItemAdd: (pageId: PageId, dataUrl: string, mediaType: string, caption: string, tagDraft: string) => void;
  readonly onImageItemMetadataChange: (canvasItemId: CanvasItemId, caption: string, tagDraft: string) => void;
  readonly onDiagramItemAdd: (pageId: PageId, kind: DiagramItemKind, label: string, tagDraft: string) => void;
  readonly onDiagramItemChange: (canvasItemId: CanvasItemId, kind: DiagramItemKind, label: string, tagDraft: string) => void;
  readonly onCodeBlockAdd: (pageId: PageId, code: string, tagDraft: string) => void;
  readonly onCodeBlockChange: (canvasItemId: CanvasItemId, code: string, tagDraft: string) => void;
}

const ItemInspectorContent = ({
  page,
  notebook,
  pageTextItems,
  highlightedCanvasItemId,
  onTextCanvasItemTagsChange,
  onLinkCardAdd,
  onLinkCardTagsChange,
  onImageItemAdd,
  onImageItemMetadataChange,
  onDiagramItemAdd,
  onDiagramItemChange,
  onCodeBlockAdd,
  onCodeBlockChange
}: ItemInspectorContentProps) => (
  <div className="item-inspector">
    <TextCanvasItemTags
      pageTextItems={pageTextItems}
      onTagsChange={onTextCanvasItemTagsChange}
    />
    <PageLinkCards
      page={page}
      notebook={notebook}
      onLinkCardAdd={onLinkCardAdd}
      onLinkCardTagsChange={onLinkCardTagsChange}
    />
    <PageImageItems
      page={page}
      notebook={notebook}
      highlightedCanvasItemId={highlightedCanvasItemId}
      onImageItemAdd={onImageItemAdd}
      onImageItemMetadataChange={onImageItemMetadataChange}
    />
    <PageDiagramItems
      page={page}
      notebook={notebook}
      highlightedCanvasItemId={highlightedCanvasItemId}
      onDiagramItemAdd={onDiagramItemAdd}
      onDiagramItemChange={onDiagramItemChange}
    />
    <PageCodeBlocks
      page={page}
      notebook={notebook}
      highlightedCanvasItemId={highlightedCanvasItemId}
      onCodeBlockAdd={onCodeBlockAdd}
      onCodeBlockChange={onCodeBlockChange}
    />
  </div>
);



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
      Search Canvas Items, Tags, Page titles, and Section paths
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

interface CommandAction {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly keywords: string;
  readonly run: () => void;
}

type CanvasModalKind = "shortcuts" | "settings" | "export" | "import" | "inspector";

interface CommandPaletteProps {
  readonly actions: readonly CommandAction[];
  readonly activeIndex: number;
  readonly isOpen: boolean;
  readonly query: string;
  readonly onActiveIndexChange: (index: number) => void;
  readonly onClose: () => void;
  readonly onQueryChange: (query: string) => void;
}

const CommandPalette = ({
  actions,
  activeIndex,
  isOpen,
  query,
  onActiveIndexChange,
  onClose,
  onQueryChange
}: CommandPaletteProps) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const filteredActions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (normalizedQuery.length === 0) {
      return actions;
    }

    return actions.filter((action) =>
      [action.label, action.description, action.keywords]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery)
    );
  }, [actions, query]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    inputRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (filteredActions.length === 0) {
      onActiveIndexChange(0);
      return;
    }

    if (activeIndex >= filteredActions.length) {
      onActiveIndexChange(0);
    }
  }, [activeIndex, filteredActions, onActiveIndexChange]);

  if (!isOpen) {
    return null;
  }

  const runAction = (action: CommandAction) => {
    action.run();
    onClose();
    onQueryChange("");
    onActiveIndexChange(0);
  };

  return (
    <div className="command-palette-overlay" onClick={onClose}>
      <div
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Command Palette"
        onClick={(event) => event.stopPropagation()}
      >
        <input
          ref={inputRef}
          className="command-palette__input"
          aria-label="Command Palette"
          placeholder="Type a command"
          value={query}
          onChange={(event) => {
            onQueryChange(event.target.value);
            onActiveIndexChange(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              onActiveIndexChange(
                filteredActions.length === 0 ? 0 : (activeIndex + 1) % filteredActions.length
              );
              return;
            }

            if (event.key === "ArrowUp") {
              event.preventDefault();
              onActiveIndexChange(
                filteredActions.length === 0
                  ? 0
                  : (activeIndex - 1 + filteredActions.length) % filteredActions.length
              );
              return;
            }

            if (event.key === "Enter") {
              event.preventDefault();
              const action = filteredActions[activeIndex] ?? filteredActions[0];

              if (action !== undefined) {
                runAction(action);
              }
              return;
            }

            if (event.key === "Escape") {
              event.preventDefault();
              onClose();
            }
          }}
        />
        <div className="command-palette__list" role="listbox" aria-label="Command results">
          {filteredActions.length === 0 ? (
            <div className="command-palette__empty">No matching actions.</div>
          ) : (
            filteredActions.map((action, index) => (
              <button
                key={action.id}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                className={
                  index === activeIndex
                    ? "command-palette__item command-palette__item--active"
                    : "command-palette__item"
                }
                onMouseEnter={() => onActiveIndexChange(index)}
                onClick={() => runAction(action)}
              >
                <span>{action.label}</span>
                <small>{action.description}</small>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

interface CanvasModalProps {
  readonly children: ReactNode;
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly scrollable?: boolean;
  readonly title: string;
}

const CanvasModal = ({ children, isOpen, onClose, scrollable, title }: CanvasModalProps) => {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="canvas-modal-overlay" onClick={onClose}>
      <div
        className={scrollable ? "canvas-modal canvas-modal--scrollable" : "canvas-modal"}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="canvas-modal__header">
          <h3>{title}</h3>
          <button
            type="button"
            className="canvas-modal__close"
            aria-label={`Close ${title}`}
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="canvas-modal__body">{children}</div>
      </div>
    </div>
  );
};

const ShortcutsModalContent = () => (
  <div className="canvas-modal__content">
    <table className="shortcuts-table">
      <tbody>
        <tr>
          <th scope="row">Cmd/Ctrl+K</th>
          <td>Open Command Palette</td>
        </tr>
        <tr>
          <th scope="row">Canvas shortcuts</th>
          <td>tldraw keeps its native canvas shortcuts available inside the editor.</td>
        </tr>
      </tbody>
    </table>
  </div>
);

interface SettingsModalContentProps {
  readonly aiEnabled: boolean;
  readonly onAiEnabledChange: (enabled: boolean) => void;
}

const SettingsModalContent = ({ aiEnabled, onAiEnabledChange }: SettingsModalContentProps) => (
  <div className="canvas-modal__content settings-modal">
    <label className="settings-modal__toggle">
      <input
        type="checkbox"
        checked={aiEnabled}
        onChange={(event) => onAiEnabledChange(event.target.checked)}
      />
      Enable AI features
    </label>
    <p className="settings-modal__hint">
      When enabled, the Notebook Assistant and AI actions become available. AI is disabled by default and makes no network calls until you enable it.
    </p>
  </div>
);

interface NotebookExportModalContentProps {
  readonly exportJson: string;
  readonly status: BackupStatus;
  readonly onExport: () => void;
}

const NotebookExportModalContent = ({
  exportJson,
  status,
  onExport
}: NotebookExportModalContentProps) => (
  <div className="canvas-modal__content notebook-backup">
    <p>
      Export preserves Sections, Pages, Canvas Items, Tags, and Canvas Regions while
      excluding rebuildable Local Index data.
    </p>
    <button type="button" onClick={onExport}>
      Export Notebook Backup
    </button>
    {status.kind !== "idle" ? (
      <p
        className={
          status.kind === "failed"
            ? "notebook-backup__status notebook-backup__status--failed"
            : "notebook-backup__status"
        }
        role={status.kind === "failed" ? "alert" : "status"}
      >
        {status.message}
      </p>
    ) : null}
    {exportJson.length > 0 ? (
      <label className="notebook-backup__json" htmlFor="canvas-modal-export-json">
        Notebook Export JSON
        <textarea id="canvas-modal-export-json" readOnly value={exportJson} />
      </label>
    ) : null}
  </div>
);

interface NotebookImportModalContentProps {
  readonly onImport: (event: ChangeEvent<HTMLInputElement>) => void;
  readonly status: BackupStatus;
}

const NotebookImportModalContent = ({
  onImport,
  status
}: NotebookImportModalContentProps) => (
  <div className="canvas-modal__content notebook-backup">
    <label htmlFor="canvas-modal-import" className="notebook-backup__json">
      Import Notebook Export
      <input
        id="canvas-modal-import"
        type="file"
        accept="application/json,.json"
        onChange={onImport}
      />
    </label>
    {status.kind !== "idle" ? (
      <p
        className={
          status.kind === "failed"
            ? "notebook-backup__status notebook-backup__status--failed"
            : "notebook-backup__status"
        }
        role={status.kind === "failed" ? "alert" : "status"}
      >
        {status.message}
      </p>
    ) : null}
  </div>
);

const pagePath = (sectionId: SectionId, pageId: PageId) =>
  `/sections/${encodeURIComponent(sectionId)}/pages/${encodeURIComponent(pageId)}`;

const LAST_OPENED_PAGE_STORAGE_KEY = "notebook_last_opened_page";
const ROOT_ROUTE_PREFERENCE_STORAGE_KEY = "notebook_root_route_preference";

const getLastOpenedPage = (): { sectionId: SectionId; pageId: PageId } | null => {
  try {
    const stored = localStorage.getItem(LAST_OPENED_PAGE_STORAGE_KEY);
    if (stored === null) return null;
    const parsed = JSON.parse(stored) as unknown;
    if (typeof parsed !== "object" || parsed === null) return null;
    const { sectionId, pageId } = parsed as Record<string, unknown>;
    if (typeof sectionId !== "string" || typeof pageId !== "string") return null;
    if (!sectionId.startsWith("section_") || !pageId.startsWith("page_")) return null;
    return { sectionId: sectionId as SectionId, pageId: pageId as PageId };
  } catch {
    return null;
  }
};

const setLastOpenedPage = (sectionId: SectionId, pageId: PageId): void => {
  try {
    localStorage.setItem(
      LAST_OPENED_PAGE_STORAGE_KEY,
      JSON.stringify({ sectionId, pageId })
    );
  } catch {
    // Ignore storage errors; last-opened page is best-effort
  }
};

const getRootRoutePreference = (): "page" | "notebook" | null => {
  try {
    const storedPreference = localStorage.getItem(ROOT_ROUTE_PREFERENCE_STORAGE_KEY);
    return storedPreference === "page" || storedPreference === "notebook"
      ? storedPreference
      : null;
  } catch {
    return null;
  }
};

const setRootRoutePreference = (preference: "page" | "notebook"): void => {
  try {
    localStorage.setItem(ROOT_ROUTE_PREFERENCE_STORAGE_KEY, preference);
  } catch {
    // Ignore storage errors; root-route preference is best-effort.
  }
};

const resolveOpeningPage = (
  notebook: Notebook
): { sectionId: SectionId; pageId: PageId } | null => {
  const lastOpened = getLastOpenedPage();
  if (lastOpened !== null) {
    const page = getPage(notebook, lastOpened.pageId);
    if (page !== undefined && page.sectionId === lastOpened.sectionId) {
      return lastOpened;
    }
  }

  const firstPage = notebook.pages[0];
  if (firstPage !== undefined) {
    return { sectionId: firstPage.sectionId, pageId: firstPage.id };
  }

  return null;
};

const tagsFromDraft = (draft: string): readonly string[] =>
  draft.split(",").map((tag) => tag.trim());

const diagramKindLabel = (kind: DiagramItemKind): string => {
  if (kind === "sticky-note") {
    return "Sticky note";
  }

  return kind.charAt(0).toUpperCase() + kind.slice(1);
};

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
