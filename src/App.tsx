import {
  ChangeEvent,
  ClipboardEvent,
  ComponentProps,
  DragEvent,
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
  type CanvasItem,
  type CanvasItemId,
  createCanvasItemId,
  createPageId,
  createSectionId,
  type DiagramItemKind,
  type FreehandDrawingCanvasItem,
  getPage,
  getSection,
  Notebook,
  Page,
  PageId,
  replacePageCanvasItems,
  renameSection,
  removeSection,
  Section,
  SectionId,
  type TextCanvasItem,
  updateCodeBlockCanvasItem,
  updateDiagramCanvasItem,
  updateImageCanvasItemMetadata,
  updateLinkCardCanvasItemMetadata,
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
const DEFAULT_SECTION_ID: SectionId = "section_inbox";
const DEFAULT_PAGE_ID: PageId = "page_default";
const LAST_OPENED_PAGE_STORAGE_KEY = "interview_prep_notebook:last_opened_page";
const THEME_STORAGE_KEY = "interview_prep_notebook:theme";
const AI_ENABLED_STORAGE_KEY = "interview_prep_notebook:ai_enabled";
const defaultNotebookStore = createNotebookStore();
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
type OpenPageRoute = Extract<PageRoute, { readonly kind: "page" }>;
type InspectableCanvasItem = Exclude<
  CanvasItem,
  { readonly type: "freehand-drawing" }
>;

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

interface SaveToastVisibility {
  readonly showSlowSaving: boolean;
  readonly showSaved: boolean;
  readonly showNextSaved: boolean;
}

type ThemePreference = "system" | "light" | "dark";
type CanvasModalKind =
  | "search"
  | "pages"
  | "backup"
  | "settings"
  | "shortcuts"
  | "assistant";

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
  const [saveToastVisibility, setSaveToastVisibility] =
    useState<SaveToastVisibility>({
      showSlowSaving: false,
      showSaved: false,
      showNextSaved: false
    });
  const [backupStatus, setBackupStatus] = useState<BackupStatus>({ kind: "idle" });
  const [notebookExportJson, setNotebookExportJson] = useState("");
  const saveAttemptRef = useRef(0);
  const [route, setRoute] = useState<PageRoute>(() =>
    parsePageRoute(window.location.pathname)
  );
  const initialRouteRef = useRef(route);
  const [sectionTitleDrafts, setSectionTitleDrafts] = useState<
    Partial<Record<SectionId, string>>
  >({});
  const [newSectionTitle, setNewSectionTitle] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [highlightedCanvasItemId, setHighlightedCanvasItemId] =
    useState<CanvasItemId | null>(null);
  const [themePreference, setThemePreference] = useState<ThemePreference>(
    loadThemePreference
  );
  const [isAiEnabled, setIsAiEnabled] = useState(loadAiEnabledPreference);

  useEffect(() => {
    let isCurrent = true;

    store
      .loadNotebook()
      .then(async (storedNotebook) => {
        if (isCurrent) {
          const preparedNotebook = prepareNotebookForDrawingScreen(storedNotebook);
          const initialRoute = initialRouteForNotebook(
            preparedNotebook.notebook,
            initialRouteRef.current
          );

          setNotebook(preparedNotebook.notebook);
          setLoadError(null);
          setRecoveryState(null);
          setRoute(initialRoute);
          rememberLastOpenedPage(initialRoute);

          if (!preparedNotebook.changed) {
            setSaveStatus({ kind: "saved" });
            return;
          }

          setSaveStatus({ kind: "saving" });

          try {
            await store.saveNotebook(preparedNotebook.notebook);

            if (isCurrent) {
              setSaveStatus({ kind: "saved" });
            }
          } catch (error: unknown) {
            if (!isCurrent) {
              return;
            }

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
              unsavedNotebook: preparedNotebook.notebook
            });
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
    window.localStorage.setItem(THEME_STORAGE_KEY, themePreference);
    document.documentElement.dataset.theme = resolvedTheme(themePreference);
  }, [themePreference]);

  useEffect(() => {
    window.localStorage.setItem(AI_ENABLED_STORAGE_KEY, String(isAiEnabled));
  }, [isAiEnabled]);

  useEffect(() => {
    if (saveStatus.kind === "saving") {
      setSaveToastVisibility((current) => ({
        ...current,
        showSaved: false
      }));

      const slowSaveTimer = window.setTimeout(() => {
        setSaveToastVisibility({
          showSlowSaving: true,
          showSaved: false,
          showNextSaved: true
        });
      }, 800);

      return () => window.clearTimeout(slowSaveTimer);
    }

    if (saveStatus.kind === "saved") {
      setSaveToastVisibility((current) =>
        current.showNextSaved
          ? {
              showSlowSaving: false,
              showSaved: true,
              showNextSaved: false
            }
          : {
              showSlowSaving: false,
              showSaved: false,
              showNextSaved: false
            }
      );
      return;
    }

    if (saveStatus.kind === "failed" || saveStatus.kind === "conflict") {
      setSaveToastVisibility({
        showSlowSaving: false,
        showSaved: false,
        showNextSaved: true
      });
      return;
    }

    setSaveToastVisibility({
      showSlowSaving: false,
      showSaved: false,
      showNextSaved: false
    });
  }, [saveStatus.kind]);

  useEffect(() => {
    if (!saveToastVisibility.showSaved) {
      return;
    }

    const savedToastTimer = window.setTimeout(() => {
      setSaveToastVisibility((current) => ({
        ...current,
        showSaved: false
      }));
    }, 3000);

    return () => window.clearTimeout(savedToastTimer);
  }, [saveToastVisibility.showSaved]);

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
      setSaveToastVisibility({
        showSlowSaving: true,
        showSaved: false,
        showNextSaved: true
      });
      saveNotebook(saveStatus.unsavedNotebook);
    }
  };

  const handleConflictReload = () => {
    setSaveToastVisibility({
      showSlowSaving: true,
      showSaved: false,
      showNextSaved: true
    });
    void (async () => {
      try {
        const storedNotebook = await store.loadNotebook();
        const preparedNotebook = prepareNotebookForDrawingScreen(storedNotebook);
        const initialRoute = initialRouteForNotebook(
          preparedNotebook.notebook,
          route
        );

        setNotebook(preparedNotebook.notebook);
        setLoadError(null);
        setRecoveryState(null);
        setBackupStatus({ kind: "idle" });
        setSearchQuery("");
        setHighlightedCanvasItemId(null);
        setRoute(initialRoute);
        rememberLastOpenedPage(initialRoute);

        if (!preparedNotebook.changed) {
          setSaveStatus({ kind: "saved" });
          return;
        }

        setSaveStatus({ kind: "saving" });

        try {
          await store.saveNotebook(preparedNotebook.notebook);
          setSaveStatus({ kind: "saved" });
        } catch (error: unknown) {
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
            unsavedNotebook: preparedNotebook.notebook
          });
        }
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

        const importedNotebook = prepareNotebookForDrawingScreen(
          parseNotebookExport(reader.result)
        ).notebook;
        const initialRoute = initialRouteForNotebook(importedNotebook, {
          kind: "notebook"
        });
        await store.saveNotebook(importedNotebook);
        setNotebook(importedNotebook);
        setSaveStatus({ kind: "saved" });
        setNotebookExportJson("");
        setSearchQuery("");
        setHighlightedCanvasItemId(null);
        setRoute(initialRoute);
        rememberLastOpenedPage(initialRoute);
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
        const freshNotebook = prepareNotebookForDrawingScreen(
          await store.startFreshNotebook()
        ).notebook;
        const initialRoute = initialRouteForNotebook(freshNotebook, {
          kind: "notebook"
        });

        await store.saveNotebook(freshNotebook);
        setNotebook(freshNotebook);
        setLoadError(null);
        setRecoveryState(null);
        setSaveStatus({ kind: "saved" });
        setSearchQuery("");
        setHighlightedCanvasItemId(null);
        setRoute(initialRoute);
        rememberLastOpenedPage(initialRoute);
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

  const handlePageRename = (pageId: PageId, title: string) => {
    if (title.trim().length === 0) {
      return;
    }

    updateNotebook((currentNotebook) => renamePage(currentNotebook, pageId, title));
  };

  const handleNotebookOpen = () => {
    window.history.pushState({}, "", "/");
    setRoute({ kind: "notebook" });
    setHighlightedCanvasItemId(null);
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

  const handleLinkCardMetadataChange = (
    canvasItemId: CanvasItemId,
    note: string,
    tagDraft: string
  ) => {
    updateNotebook((currentNotebook) =>
      updateLinkCardCanvasItemMetadata(
        currentNotebook,
        canvasItemId,
        note,
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
    const nextRoute: PageRoute = { kind: "page", sectionId, pageId };
    setRoute(nextRoute);
    rememberLastOpenedPage(nextRoute);
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

  if (activePage?.kind === "found") {
    return (
      <main className="drawing-screen" aria-labelledby="notebook-title">
        <h1 id="notebook-title" className="visually-hidden">
          {notebook.title}
        </h1>
        <CanvasToastStack
          saveStatus={saveStatus}
          saveToastVisibility={saveToastVisibility}
          backupStatus={backupStatus}
          onRetry={handleSaveRetry}
          onConflictReload={handleConflictReload}
        />
        <ActivePageView
          activePage={activePage}
          notebook={notebook}
          highlightedCanvasItemId={highlightedCanvasItemId}
          notebookExportJson={notebookExportJson}
          searchQuery={searchQuery}
          searchResults={searchResults}
          themePreference={themePreference}
          isAiEnabled={isAiEnabled}
          onThemePreferenceChange={setThemePreference}
          onAiEnabledChange={setIsAiEnabled}
          onNotebookExport={handleNotebookExport}
          onNotebookImport={handleNotebookImport}
          onSearchQueryChange={setSearchQuery}
          onSearchResultOpen={handleSearchResultOpen}
          onNotebookOpen={handleNotebookOpen}
          onPageCreate={handlePageCreate}
          onPageOpen={handlePageOpen}
          onPageRename={handlePageRename}
          onCodeBlockAdd={handleCodeBlockAdd}
          onCodeBlockChange={handleCodeBlockChange}
          onDiagramItemAdd={handleDiagramItemAdd}
          onDiagramItemChange={handleDiagramItemChange}
          onImageItemAdd={handleImageItemAdd}
          onImageItemMetadataChange={handleImageItemMetadataChange}
          onLinkCardAdd={handleLinkCardAdd}
          onLinkCardMetadataChange={handleLinkCardMetadataChange}
          onPageTextCanvasChange={handlePageTextCanvasChange}
          onTextCanvasItemTagsChange={handleTextCanvasItemTagsChange}
        />
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

      <CanvasToastStack
        saveStatus={saveStatus}
        saveToastVisibility={saveToastVisibility}
        backupStatus={backupStatus}
        onRetry={handleSaveRetry}
        onConflictReload={handleConflictReload}
      />

      <NotebookBackupPanel
        exportJson={notebookExportJson}
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
            notebookExportJson={notebookExportJson}
            searchQuery={searchQuery}
            searchResults={searchResults}
            themePreference={themePreference}
            isAiEnabled={isAiEnabled}
            onThemePreferenceChange={setThemePreference}
            onAiEnabledChange={setIsAiEnabled}
            onNotebookExport={handleNotebookExport}
            onNotebookImport={handleNotebookImport}
            onSearchQueryChange={setSearchQuery}
            onSearchResultOpen={handleSearchResultOpen}
            onNotebookOpen={handleNotebookOpen}
            onPageCreate={handlePageCreate}
            onPageOpen={handlePageOpen}
            onPageRename={handlePageRename}
            onCodeBlockAdd={handleCodeBlockAdd}
            onCodeBlockChange={handleCodeBlockChange}
            onDiagramItemAdd={handleDiagramItemAdd}
            onDiagramItemChange={handleDiagramItemChange}
            onImageItemAdd={handleImageItemAdd}
            onImageItemMetadataChange={handleImageItemMetadataChange}
            onLinkCardAdd={handleLinkCardAdd}
            onLinkCardMetadataChange={handleLinkCardMetadataChange}
            onPageTextCanvasChange={handlePageTextCanvasChange}
            onTextCanvasItemTagsChange={handleTextCanvasItemTagsChange}
          />
        )}
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
  readonly onExport: () => void;
  readonly onImport: (event: ChangeEvent<HTMLInputElement>) => void;
}

const NotebookBackupPanel = ({
  exportJson,
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
    {exportJson.length > 0 ? (
      <label className="notebook-backup__json" htmlFor="notebook-export-json">
        Notebook Export JSON
        <textarea id="notebook-export-json" readOnly value={exportJson} />
      </label>
    ) : null}
  </section>
);

interface CanvasToastStackProps {
  readonly saveStatus: SaveStatus;
  readonly saveToastVisibility: SaveToastVisibility;
  readonly backupStatus: BackupStatus;
  readonly onRetry: () => void;
  readonly onConflictReload: () => void;
}

const CanvasToastStack = ({
  saveStatus,
  saveToastVisibility,
  backupStatus,
  onRetry,
  onConflictReload
}: CanvasToastStackProps) => {
  const hasVisibleSaveToast =
    saveStatus.kind === "failed" ||
    saveStatus.kind === "conflict" ||
    (saveStatus.kind === "saving" && saveToastVisibility.showSlowSaving) ||
    (saveStatus.kind === "saved" && saveToastVisibility.showSaved);

  if (!hasVisibleSaveToast && backupStatus.kind === "idle") {
    return null;
  }

  return (
    <div className="canvas-toast-stack" aria-label="Canvas Toasts">
      <SaveStatusToast
        status={saveStatus}
        visibility={saveToastVisibility}
        onRetry={onRetry}
        onConflictReload={onConflictReload}
      />
      <BackupStatusToast status={backupStatus} />
    </div>
  );
};

interface SaveStatusToastProps {
  readonly status: SaveStatus;
  readonly visibility: SaveToastVisibility;
  readonly onRetry: () => void;
  readonly onConflictReload: () => void;
}

const SaveStatusToast = ({
  status,
  visibility,
  onRetry,
  onConflictReload
}: SaveStatusToastProps) => {
  if (status.kind === "failed") {
    return (
      <section
        className="canvas-toast canvas-toast--failed canvas-toast--sticky"
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
        className="canvas-toast canvas-toast--failed canvas-toast--sticky"
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

  if (status.kind === "saving" && visibility.showSlowSaving) {
    return (
      <section
        className="canvas-toast"
        aria-label="Autosave status"
        aria-live="polite"
      >
        <strong>Saving Notebook changes</strong>
      </section>
    );
  }

  if (status.kind === "saved" && visibility.showSaved) {
    return (
      <section
        className="canvas-toast"
        aria-label="Autosave status"
        aria-live="polite"
      >
        <strong>Notebook changes saved</strong>
      </section>
    );
  }

  return null;
};

interface BackupStatusToastProps {
  readonly status: BackupStatus;
}

const BackupStatusToast = ({ status }: BackupStatusToastProps) => {
  if (status.kind === "idle") {
    return null;
  }

  return (
    <section
      className={
        status.kind === "failed"
          ? "canvas-toast canvas-toast--failed canvas-toast--sticky"
          : "canvas-toast"
      }
      aria-label="Notebook Export Canvas Toast"
      role={status.kind === "failed" ? "alert" : "status"}
      aria-live={status.kind === "failed" ? undefined : "polite"}
    >
      <div>
        <strong>
          {status.kind === "failed"
            ? "Notebook Export needs attention"
            : "Notebook Export complete"}
        </strong>
        <p>{status.message}</p>
      </div>
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
  readonly notebookExportJson: string;
  readonly searchQuery: string;
  readonly searchResults: readonly SearchResult[];
  readonly themePreference: ThemePreference;
  readonly isAiEnabled: boolean;
  readonly onThemePreferenceChange: (preference: ThemePreference) => void;
  readonly onAiEnabledChange: (enabled: boolean) => void;
  readonly onNotebookExport: () => void;
  readonly onNotebookImport: (event: ChangeEvent<HTMLInputElement>) => void;
  readonly onSearchQueryChange: (query: string) => void;
  readonly onSearchResultOpen: (result: SearchResult) => void;
  readonly onNotebookOpen: () => void;
  readonly onPageCreate: (sectionId: SectionId) => void;
  readonly onPageOpen: (sectionId: SectionId, pageId: PageId) => void;
  readonly onPageRename: (pageId: PageId, title: string) => void;
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
  readonly onLinkCardAdd: (
    pageId: PageId,
    url: string,
    note: string,
    tagDraft: string
  ) => void;
  readonly onLinkCardMetadataChange: (
    canvasItemId: CanvasItemId,
    note: string,
    tagDraft: string
  ) => void;
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
  readonly onPageTextCanvasChange: (
    pageId: PageId,
    snapshot: PageTldrawCanvasSnapshot
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
  notebookExportJson,
  searchQuery,
  searchResults,
  themePreference,
   isAiEnabled,
  onThemePreferenceChange,
  onAiEnabledChange,
  onNotebookExport,
  onNotebookImport,
  onSearchQueryChange,
  onSearchResultOpen,
  onNotebookOpen,
  onPageCreate,
  onPageOpen,
  onPageRename,
  onCodeBlockAdd,
  onCodeBlockChange,
  onDiagramItemAdd,
  onDiagramItemChange,
  onImageItemAdd,
  onImageItemMetadataChange,
  onLinkCardAdd,
  onLinkCardMetadataChange,
  onPageTextCanvasChange,
  onTextCanvasItemTagsChange
}: ActivePageViewProps) => {
  const [inspectedCanvasItemId, setInspectedCanvasItemId] =
    useState<CanvasItemId | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [activeModal, setActiveModal] = useState<CanvasModalKind | null>(null);

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

  const pageCanvasItems = notebook.canvasItems.filter(
    (canvasItem): canvasItem is InspectableCanvasItem =>
      canvasItem.pageId === activePage.page.id &&
      canvasItem.type !== "freehand-drawing"
  );
  const inspectedCanvasItem =
    inspectedCanvasItemId === null
      ? null
      : (pageCanvasItems.find(
          (canvasItem) => canvasItem.id === inspectedCanvasItemId
        ) ?? null);

  return (
    <article className="page-canvas" aria-labelledby="active-page-title">
      <header className="drawing-screen__header">
        <div>
          <p className="eyebrow">{activePage.section.title}</p>
          <h2 id="active-page-title">{activePage.page.title}</h2>
          <p>
            Use tldraw text and draw tools for rough interview-prep work. Text
            Canvas Items are searchable; Freehand Drawings autosave and reload for
            navigation without OCR or handwriting search.
          </p>
          <p>Page Type: unset</p>
        </div>
        <div className="canvas-actions">
          <button
            type="button"
            aria-expanded={isMenuOpen}
            aria-controls="canvas-hamburger-menu"
            onClick={() => setIsMenuOpen((current) => !current)}
          >
            Notebook Menu
          </button>
          <button
            type="button"
            className="search-control-button"
            onClick={() => setActiveModal("search")}
          >
            Open Search Overlay
          </button>
          <button
            type="button"
            onClick={() => setIsCommandPaletteOpen(true)}
          >
            Command Palette
          </button>
        </div>
      </header>
      {isMenuOpen ? (
        <CanvasHamburgerMenu
          activeTheme={themePreference}
          onClose={() => setIsMenuOpen(false)}
          onNotebookOpen={onNotebookOpen}
          onModalOpen={(modal) => {
            setActiveModal(modal);
            setIsMenuOpen(false);
          }}
          onThemePreferenceChange={onThemePreferenceChange}
        />
      ) : null}
      {isCommandPaletteOpen ? (
        <CommandPalette
          isAiEnabled={isAiEnabled}
          onClose={() => setIsCommandPaletteOpen(false)}
          onCreatePage={() => {
            onPageCreate(activePage.section.id);
            setIsCommandPaletteOpen(false);
          }}
          onModalOpen={(modal) => {
            setActiveModal(modal);
            setIsCommandPaletteOpen(false);
          }}
        />
      ) : null}
      {activeModal === "search" ? (
        <CanvasModal title="Search Notebook" onClose={() => setActiveModal(null)}>
          <DrawingScreenSearch
            query={searchQuery}
            results={searchResults}
            onQueryChange={onSearchQueryChange}
            onResultOpen={(result) => {
              onSearchResultOpen(result);
              setActiveModal(null);
            }}
          />
        </CanvasModal>
      ) : null}
      {activeModal === "assistant" ? (
        <CanvasModal title="Notebook Assistant" onClose={() => setActiveModal(null)}>
          <NotebookAssistantPanel />
        </CanvasModal>
      ) : null}
      {activeModal === "pages" ? (
        <CanvasModal title="Page Switcher" onClose={() => setActiveModal(null)}>
          <PageSwitcher
            notebook={notebook}
            currentPageId={activePage.page.id}
            onCreatePage={() => {
              onPageCreate(activePage.section.id);
              setActiveModal(null);
            }}
            onPageOpen={(sectionId, pageId) => {
              onPageOpen(sectionId, pageId);
              setActiveModal(null);
            }}
          />
        </CanvasModal>
      ) : null}
      {activeModal === "backup" ? (
        <CanvasModal title="Notebook Export and Import" onClose={() => setActiveModal(null)}>
          <NotebookBackupPanel
            exportJson={notebookExportJson}
            onExport={onNotebookExport}
            onImport={onNotebookImport}
          />
        </CanvasModal>
      ) : null}
      {activeModal === "settings" ? (
        <CanvasModal title="Notebook Settings" onClose={() => setActiveModal(null)}>
          <SettingsPanel
            activePage={activePage.page}
            themePreference={themePreference}
            isAiEnabled={isAiEnabled}
            onPageRename={onPageRename}
            onAiEnabledChange={onAiEnabledChange}
            onThemePreferenceChange={onThemePreferenceChange}
          />
        </CanvasModal>
      ) : null}
      {activeModal === "shortcuts" ? (
        <CanvasModal title="Shortcuts" onClose={() => setActiveModal(null)}>
          <ShortcutsPanel />
        </CanvasModal>
      ) : null}
      <PageTextCanvas
        page={activePage.page}
        notebook={notebook}
        highlightedCanvasItemId={highlightedCanvasItemId}
        showEmptyCanvasPrompts={
          activePage.page.id === DEFAULT_PAGE_ID &&
          !notebook.canvasItems.some(
            (canvasItem) => canvasItem.pageId === activePage.page.id
          )
        }
        onPageTextCanvasChange={onPageTextCanvasChange}
      />
      <PageLinkCards
        page={activePage.page}
        onLinkCardAdd={onLinkCardAdd}
      />
      <PageImageItems
        page={activePage.page}
        onImageItemAdd={onImageItemAdd}
      />
      <PageDiagramItems
        page={activePage.page}
        onDiagramItemAdd={onDiagramItemAdd}
      />
      <PageCodeBlocks
        page={activePage.page}
        onCodeBlockAdd={onCodeBlockAdd}
      />
      <CanvasItemCards
        canvasItems={pageCanvasItems}
        highlightedCanvasItemId={highlightedCanvasItemId}
        onInspect={setInspectedCanvasItemId}
      />
      {isAiEnabled ? (
        <AssistantBubble onOpen={() => setActiveModal("assistant")} />
      ) : null}
      {inspectedCanvasItem !== null ? (
        <ItemInspector
          canvasItem={inspectedCanvasItem}
          onClose={() => setInspectedCanvasItemId(null)}
          onCodeBlockChange={onCodeBlockChange}
          onDiagramItemChange={onDiagramItemChange}
          onImageItemMetadataChange={onImageItemMetadataChange}
          onLinkCardMetadataChange={onLinkCardMetadataChange}
          onTextCanvasItemTagsChange={onTextCanvasItemTagsChange}
        />
      ) : null}
    </article>
  );
};

interface CanvasHamburgerMenuProps {
  readonly activeTheme: ThemePreference;
  readonly onClose: () => void;
  readonly onModalOpen: (modal: CanvasModalKind) => void;
  readonly onNotebookOpen: () => void;
  readonly onThemePreferenceChange: (preference: ThemePreference) => void;
}

const CanvasHamburgerMenu = ({
  activeTheme,
  onClose,
  onModalOpen,
  onNotebookOpen,
  onThemePreferenceChange
}: CanvasHamburgerMenuProps) => (
  <nav
    id="canvas-hamburger-menu"
    className="canvas-hamburger-menu"
    aria-label="Notebook Menu"
  >
    <button type="button" onClick={() => onModalOpen("settings")}>
      Settings
    </button>
    <button
      type="button"
      onClick={() => onThemePreferenceChange(nextThemePreference(activeTheme))}
    >
      Theme: {themePreferenceLabel(activeTheme)}
    </button>
    <button type="button" onClick={() => onModalOpen("backup")}>
      Notebook Export and Import
    </button>
    <button type="button" onClick={() => onModalOpen("shortcuts")}>
      Shortcuts
    </button>
    <button
      type="button"
      onClick={() => {
        onNotebookOpen();
        onClose();
      }}
    >
      Notebook Management Screen
    </button>
    <button type="button" className="remove-button" onClick={onClose}>
      Close Menu
    </button>
  </nav>
);

interface CommandPaletteProps {
  readonly isAiEnabled: boolean;
  readonly onClose: () => void;
  readonly onCreatePage: () => void;
  readonly onModalOpen: (modal: CanvasModalKind) => void;
}

const CommandPalette = ({
  isAiEnabled,
  onClose,
  onCreatePage,
  onModalOpen
}: CommandPaletteProps) => (
  <CanvasModal title="Command Palette" onClose={onClose}>
    <div className="command-palette" aria-label="Command Palette actions">
      <button type="button" onClick={() => onModalOpen("search")}>
        Search Notebook
      </button>
      <button type="button" onClick={() => onModalOpen("pages")}>
        Switch or create Page
      </button>
      <button type="button" onClick={onCreatePage}>
        Create Page in current Section
      </button>
      <button type="button" onClick={() => onModalOpen("settings")}>
        Rename current Page
      </button>
      <button type="button" onClick={() => onModalOpen("backup")}>
        Notebook Export and Import
      </button>
      <button type="button" onClick={() => onModalOpen("settings")}>
        Settings
      </button>
      {isAiEnabled ? (
        <button type="button" onClick={() => onModalOpen("assistant")}>
          Ask Notebook Assistant
        </button>
      ) : null}
      <button type="button" onClick={() => onModalOpen("shortcuts")}>
        Shortcuts
      </button>
    </div>
  </CanvasModal>
);

interface CanvasModalProps {
  readonly title: string;
  readonly children: ReactNode;
  readonly onClose: () => void;
}

const CanvasModal = ({ title, children, onClose }: CanvasModalProps) => (
  <div className="canvas-modal-backdrop" role="presentation">
    <section
      className="canvas-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`canvas-modal-${idFromLabel(title)}`}
    >
      <div className="canvas-modal__header">
        <div>
          <p className="eyebrow">Canvas Modal</p>
          <h3 id={`canvas-modal-${idFromLabel(title)}`}>{title}</h3>
        </div>
        <button type="button" onClick={onClose}>
          Close Modal
        </button>
      </div>
      {children}
    </section>
  </div>
);

interface PageSwitcherProps {
  readonly notebook: Notebook;
  readonly currentPageId: PageId;
  readonly onCreatePage: () => void;
  readonly onPageOpen: (sectionId: SectionId, pageId: PageId) => void;
}

const PageSwitcher = ({
  notebook,
  currentPageId,
  onCreatePage,
  onPageOpen
}: PageSwitcherProps) => (
  <div className="page-switcher">
    <button type="button" onClick={onCreatePage}>
      New Page in current Section
    </button>
    <ul className="page-list" aria-label="Page Switcher Pages">
      {notebook.pages.map((page) => {
        const section = getSection(notebook, page.sectionId);

        return (
          <li className="page-row" key={page.id}>
            <div>
              <strong>{page.title}</strong>
              <span>
                {section?.title ?? "Unknown Section"}
                {page.id === currentPageId ? " - current Page" : ""}
              </span>
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
  </div>
);

interface SettingsPanelProps {
  readonly activePage: Page;
  readonly themePreference: ThemePreference;
  readonly isAiEnabled: boolean;
  readonly onPageRename: (pageId: PageId, title: string) => void;
  readonly onAiEnabledChange: (enabled: boolean) => void;
  readonly onThemePreferenceChange: (preference: ThemePreference) => void;
}

const SettingsPanel = ({
  activePage,
  themePreference,
  isAiEnabled,
  onPageRename,
  onAiEnabledChange,
  onThemePreferenceChange
}: SettingsPanelProps) => {
  const [pageTitleDraft, setPageTitleDraft] = useState(activePage.title);

  return (
    <div className="settings-panel">
      <label htmlFor="theme-preference">
        Theme
        <select
          id="theme-preference"
          value={themePreference}
          onChange={(event) =>
            onThemePreferenceChange(event.target.value as ThemePreference)
          }
        >
          <option value="system">System with dark fallback</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </label>
      <label htmlFor="active-page-title-setting">
        Current Page title
        <input
          id="active-page-title-setting"
          value={pageTitleDraft}
          onChange={(event) => {
            setPageTitleDraft(event.target.value);
            onPageRename(activePage.id, event.target.value);
          }}
        />
      </label>
      <label className="settings-panel__checkbox" htmlFor="ai-enabled-setting">
        <input
          id="ai-enabled-setting"
          type="checkbox"
          checked={isAiEnabled}
          onChange={(event) => onAiEnabledChange(event.target.checked)}
        />
        Enable AI affordances
      </label>
      <p>
        Notebook material remains private by default; connected features stay out
        of the Drawing Screen until explicitly configured.
      </p>
      <p>
        Automatic image and screenshot summaries stay disabled unless a future
        explicit summarization setting enables them.
      </p>
    </div>
  );
};

const AssistantBubble = ({ onOpen }: { readonly onOpen: () => void }) => (
  <button type="button" className="assistant-bubble" onClick={onOpen}>
    Notebook Assistant
  </button>
);

const NotebookAssistantPanel = () => (
  <div className="assistant-panel">
    <p>
      The Notebook Assistant is available because AI affordances are enabled.
      This MVP shell does not make runtime network calls until a provider is
      explicitly configured.
    </p>
  </div>
);

const ShortcutsPanel = () => (
  <div className="shortcuts-panel">
    <p>Use Command Palette for search, Page switching, creation, settings, and backup.</p>
    <p>Use the Notebook Menu for settings, theme, Notebook Export, Notebook Import, and shortcuts.</p>
    <p>Use Text Tool and Draw Tool buttons to switch capture modes on the canvas.</p>
  </div>
);

interface DrawingScreenSearchProps {
  readonly query: string;
  readonly results: readonly SearchResult[];
  readonly onQueryChange: (query: string) => void;
  readonly onResultOpen: (result: SearchResult) => void;
}

const DrawingScreenSearch = ({
  query,
  results,
  onQueryChange,
  onResultOpen
}: DrawingScreenSearchProps) => {
  const groupedResults = groupSearchResultsByPage(results);

  return (
    <section className="drawing-screen-search" aria-labelledby="drawing-search-title">
      <div>
        <p className="eyebrow">Local Index</p>
        <h3 id="drawing-search-title">Ask/Search Notebook</h3>
        <p>
          Searches text, Code Blocks, Link Card URLs and notes, captions, Tags,
          Page titles, and generated summaries when present. Freehand Drawing is
          not searched in this MVP.
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
      {groupedResults.length > 0 ? (
        <div className="search-result-groups" aria-label="Search Results by Page">
          {groupedResults.map((group) => (
            <section
              className="search-result-group"
              key={group.pageId}
              aria-labelledby={`search-results-${group.pageId}`}
            >
              <div className="search-result-group__header">
                <h4 id={`search-results-${group.pageId}`}>{group.notebookPath}</h4>
                <span>
                  {group.results.length}{" "}
                  {group.results.length === 1 ? "result" : "results"}
                </span>
              </div>
              <ul className="search-results" aria-label={`${group.notebookPath} Search Results`}>
                {group.results.map((result) => (
                  <li className="search-result" key={result.id}>
                    <div>
                      <span>{result.sourceLabel}</span>
                      {result.matchedTags.length > 0 ? (
                        <span>
                          Matched Tags:{" "}
                          {result.matchedTags.map((tag) => `#${tag}`).join(", ")}
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
            </section>
          ))}
        </div>
      ) : null}
    </section>
  );
};

interface PageTextCanvasProps {
  readonly page: Page;
  readonly notebook: Notebook;
  readonly highlightedCanvasItemId: CanvasItemId | null;
  readonly showEmptyCanvasPrompts: boolean;
  readonly onPageTextCanvasChange: (
    pageId: PageId,
    snapshot: PageTldrawCanvasSnapshot
  ) => void;
}

const PageTextCanvas = ({
  page,
  notebook,
  highlightedCanvasItemId,
  showEmptyCanvasPrompts,
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
        unsubscribe();
      };
    },
    [
      initialFreehandDrawingItems,
      initialRegions,
      initialTextItems,
      onPageTextCanvasChange,
      page.id
    ]
  );

  return (
    <>
      <div className="canvas-tool-switcher" aria-label="Canvas tool shortcuts">
        <button type="button" onClick={() => editorRef.current?.setCurrentTool("text")}>
          Use Text Tool
        </button>
        <button type="button" onClick={() => editorRef.current?.setCurrentTool("draw")}>
          Use Draw Tool
        </button>
        <span>
          Freehand Drawing stays local and is not OCR or searchable handwriting.
        </span>
      </div>
      <div
        className="tldraw-canvas"
        data-testid="tldraw-page-canvas"
        aria-label={`${page.title} tldraw text canvas`}
      >
        {showEmptyCanvasPrompts ? (
          <EmptyCanvasPrompts
            onUseTextTool={() => editorRef.current?.setCurrentTool("text")}
            onUseDrawTool={() => editorRef.current?.setCurrentTool("draw")}
          />
        ) : null}
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
    </>
  );
};

interface EmptyCanvasPromptsProps {
  readonly onUseTextTool: () => void;
  readonly onUseDrawTool: () => void;
}

const EmptyCanvasPrompts = ({
  onUseTextTool,
  onUseDrawTool
}: EmptyCanvasPromptsProps) => (
  <div className="empty-canvas-prompts" aria-label="Empty Canvas Prompts">
    <p className="eyebrow">Empty Canvas Prompts</p>
    <h3>Start rough interview-prep work here</h3>
    <p>
      Capture first, organize later. These prompts disappear after the first Canvas
      Item lands on this Page.
    </p>
    <div>
      <button type="button" onClick={onUseTextTool}>
        Start typing
      </button>
      <button type="button" onClick={onUseDrawTool}>
        Sketch rough work
      </button>
      <button
        type="button"
        onClick={() => document.getElementById("link-card-url")?.focus()}
      >
        Paste screenshot or link
      </button>
      <button
        type="button"
        onClick={() => document.getElementById("notebook-search")?.focus()}
      >
        Ask/Search Notebook
      </button>
    </div>
  </div>
);

interface PageLinkCardsProps {
  readonly page: Page;
  readonly onLinkCardAdd: (
    pageId: PageId,
    url: string,
    note: string,
    tagDraft: string
  ) => void;
}

const PageLinkCards = ({
  page,
  onLinkCardAdd
}: PageLinkCardsProps) => {
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [tagDraft, setTagDraft] = useState("");

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
    </section>
  );
};

interface PageImageItemsProps {
  readonly page: Page;
  readonly onImageItemAdd: (
    pageId: PageId,
    dataUrl: string,
    mediaType: string,
    caption: string,
    tagDraft: string
  ) => void;
}

const PageImageItems = ({
  page,
  onImageItemAdd
}: PageImageItemsProps) => {
  const [imageDraft, setImageDraft] = useState<{
    readonly dataUrl: string;
    readonly mediaType: string;
    readonly name: string;
  } | null>(null);
  const [caption, setCaption] = useState("");
  const [tagDraft, setTagDraft] = useState("");

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

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    const imageFile = Array.from(event.dataTransfer.files).find((file) =>
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
          onDragOver={handleDragOver}
          onDrop={handleDrop}
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
    </section>
  );
};

interface PageDiagramItemsProps {
  readonly page: Page;
  readonly onDiagramItemAdd: (
    pageId: PageId,
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
  onDiagramItemAdd
}: PageDiagramItemsProps) => {
  const [kind, setKind] = useState<DiagramItemKind>("box");
  const [label, setLabel] = useState("");
  const [tagDraft, setTagDraft] = useState("");

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
    </section>
  );
};

interface PageCodeBlocksProps {
  readonly page: Page;
  readonly onCodeBlockAdd: (
    pageId: PageId,
    code: string,
    tagDraft: string
  ) => void;
}

const PageCodeBlocks = ({
  page,
  onCodeBlockAdd
}: PageCodeBlocksProps) => {
  const [code, setCode] = useState("");
  const [tagDraft, setTagDraft] = useState("");

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
    </section>
  );
};

interface CanvasItemCardsProps {
  readonly canvasItems: readonly InspectableCanvasItem[];
  readonly highlightedCanvasItemId: CanvasItemId | null;
  readonly onInspect: (canvasItemId: CanvasItemId) => void;
}

const CanvasItemCards = ({
  canvasItems,
  highlightedCanvasItemId,
  onInspect
}: CanvasItemCardsProps) => {
  if (canvasItems.length === 0) {
    return null;
  }

  return (
    <section className="canvas-item-cards" aria-labelledby="canvas-items-title">
      <div>
        <p className="eyebrow">Canvas Items</p>
        <h4 id="canvas-items-title">Hover Metadata</h4>
        <p>
          Hover or focus a Canvas Item for lightweight metadata. Open the Item
          Inspector when you want to edit captions, notes, labels, code, or Tags.
        </p>
      </div>
      <ul aria-label="Canvas Items on this Page">
        {canvasItems.map((canvasItem) => (
          <li
            className={
              highlightedCanvasItemId === canvasItem.id
                ? "canvas-item-card canvas-item-card--highlighted"
                : "canvas-item-card"
            }
            key={canvasItem.id}
            tabIndex={0}
          >
            {highlightedCanvasItemId === canvasItem.id ? (
              <span
                className="canvas-item-card__highlight"
                role="status"
                aria-label={highlightLabelForCanvasItem(canvasItem)}
              >
                Highlighted {labelForCanvasItem(canvasItem)}
              </span>
            ) : null}
            <CanvasItemPreview canvasItem={canvasItem} />
            <div className="hover-metadata" aria-label="Hover Metadata">
              <strong>{labelForCanvasItem(canvasItem)}</strong>
              <span>{summaryForCanvasItem(canvasItem)}</span>
              {tagsForCanvasItem(canvasItem).length > 0 ? (
                <span>
                  Tags: {tagsForCanvasItem(canvasItem).map((tag) => `#${tag}`).join(", ")}
                </span>
              ) : (
                <span>No Tags yet</span>
              )}
            </div>
            <button type="button" onClick={() => onInspect(canvasItem.id)}>
              Open Item Inspector
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
};

interface CanvasItemPreviewProps {
  readonly canvasItem: InspectableCanvasItem;
}

const CanvasItemPreview = ({ canvasItem }: CanvasItemPreviewProps) => {
  if (canvasItem.type === "link-card") {
    return (
      <a href={canvasItem.url} rel="noreferrer" target="_blank">
        {canvasItem.url}
      </a>
    );
  }

  if (canvasItem.type === "image") {
    return (
      <img
        alt={canvasItem.caption || "Image Item"}
        src={canvasItem.dataUrl}
      />
    );
  }

  if (canvasItem.type === "diagram") {
    return (
      <div className="diagram-preview">
        <strong>{diagramKindLabel(canvasItem.kind)}</strong>
        <span>{canvasItem.label}</span>
      </div>
    );
  }

  if (canvasItem.type === "code-block") {
    return <pre>{canvasItem.code}</pre>;
  }

  return <p>{canvasItem.text}</p>;
};

interface ItemInspectorProps {
  readonly canvasItem: InspectableCanvasItem;
  readonly onClose: () => void;
  readonly onCodeBlockChange: (
    canvasItemId: CanvasItemId,
    code: string,
    tagDraft: string
  ) => void;
  readonly onDiagramItemChange: (
    canvasItemId: CanvasItemId,
    kind: DiagramItemKind,
    label: string,
    tagDraft: string
  ) => void;
  readonly onImageItemMetadataChange: (
    canvasItemId: CanvasItemId,
    caption: string,
    tagDraft: string
  ) => void;
  readonly onLinkCardMetadataChange: (
    canvasItemId: CanvasItemId,
    note: string,
    tagDraft: string
  ) => void;
  readonly onTextCanvasItemTagsChange: (
    canvasItemId: CanvasItemId,
    tagDraft: string
  ) => void;
}

const ItemInspector = ({
  canvasItem,
  onClose,
  onCodeBlockChange,
  onDiagramItemChange,
  onImageItemMetadataChange,
  onLinkCardMetadataChange,
  onTextCanvasItemTagsChange
}: ItemInspectorProps) => {
  const [codeDraft, setCodeDraft] = useState(
    canvasItem.type === "code-block" ? canvasItem.code : ""
  );
  const [captionDraft, setCaptionDraft] = useState(
    canvasItem.type === "image" ? canvasItem.caption : ""
  );
  const [noteDraft, setNoteDraft] = useState(
    canvasItem.type === "link-card" ? canvasItem.note : ""
  );
  const [kindDraft, setKindDraft] = useState<DiagramItemKind>(
    canvasItem.type === "diagram" ? canvasItem.kind : "box"
  );
  const [labelDraft, setLabelDraft] = useState(
    canvasItem.type === "diagram" ? canvasItem.label : ""
  );
  const [tagDraft, setTagDraft] = useState(tagsForCanvasItem(canvasItem).join(", "));

  const handleTagsChange = (nextTagDraft: string) => {
    setTagDraft(nextTagDraft);

    if (canvasItem.type === "text") {
      onTextCanvasItemTagsChange(canvasItem.id, nextTagDraft);
      return;
    }

    if (canvasItem.type === "link-card") {
      onLinkCardMetadataChange(canvasItem.id, noteDraft, nextTagDraft);
      return;
    }

    if (canvasItem.type === "image") {
      onImageItemMetadataChange(canvasItem.id, captionDraft, nextTagDraft);
      return;
    }

    if (canvasItem.type === "diagram" && labelDraft.trim().length > 0) {
      onDiagramItemChange(canvasItem.id, kindDraft, labelDraft, nextTagDraft);
      return;
    }

    if (canvasItem.type === "code-block" && codeDraft.trim().length > 0) {
      onCodeBlockChange(canvasItem.id, codeDraft, nextTagDraft);
    }
  };

  const handleCodeChange = (nextCode: string) => {
    setCodeDraft(nextCode);

    if (nextCode.trim().length > 0) {
      onCodeBlockChange(canvasItem.id, nextCode, tagDraft);
    }
  };

  const handleCaptionChange = (nextCaption: string) => {
    setCaptionDraft(nextCaption);
    onImageItemMetadataChange(canvasItem.id, nextCaption, tagDraft);
  };

  const handleNoteChange = (nextNote: string) => {
    setNoteDraft(nextNote);
    onLinkCardMetadataChange(canvasItem.id, nextNote, tagDraft);
  };

  const handleDiagramKindChange = (nextKind: DiagramItemKind) => {
    setKindDraft(nextKind);

    if (labelDraft.trim().length > 0) {
      onDiagramItemChange(canvasItem.id, nextKind, labelDraft, tagDraft);
    }
  };

  const handleDiagramLabelChange = (nextLabel: string) => {
    setLabelDraft(nextLabel);

    if (nextLabel.trim().length > 0) {
      onDiagramItemChange(canvasItem.id, kindDraft, nextLabel, tagDraft);
    }
  };

  return (
    <aside
      className="item-inspector"
      aria-label="Item Inspector"
      aria-labelledby="item-inspector-title"
    >
      <div className="item-inspector__header">
        <div>
          <p className="eyebrow">Item Inspector</p>
          <h4 id="item-inspector-title">{labelForCanvasItem(canvasItem)}</h4>
        </div>
        <button type="button" onClick={onClose}>
          Close Inspector
        </button>
      </div>
      {canvasItem.type === "link-card" ? (
        <label htmlFor={`${canvasItem.id}-inspector-note`}>
          Inspector link notes
          <textarea
            id={`${canvasItem.id}-inspector-note`}
            value={noteDraft}
            placeholder="Why this URL matters for this Page"
            onChange={(event) => handleNoteChange(event.target.value)}
          />
        </label>
      ) : null}
      {canvasItem.type === "image" ? (
        <label htmlFor={`${canvasItem.id}-inspector-caption`}>
          Inspector Image Item caption
          <input
            id={`${canvasItem.id}-inspector-caption`}
            value={captionDraft}
            placeholder="Optional caption"
            onChange={(event) => handleCaptionChange(event.target.value)}
          />
        </label>
      ) : null}
      {canvasItem.type === "diagram" ? (
        <>
          <label htmlFor={`${canvasItem.id}-inspector-kind`}>
            Inspector Diagram Item kind
            <select
              id={`${canvasItem.id}-inspector-kind`}
              value={kindDraft}
              onChange={(event) =>
                handleDiagramKindChange(event.target.value as DiagramItemKind)
              }
            >
              {DIAGRAM_ITEM_KINDS.map((diagramKind) => (
                <option key={diagramKind} value={diagramKind}>
                  {diagramKindLabel(diagramKind)}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor={`${canvasItem.id}-inspector-label`}>
            Inspector Diagram Item label
            <input
              id={`${canvasItem.id}-inspector-label`}
              value={labelDraft}
              placeholder="Diagram label"
              onChange={(event) => handleDiagramLabelChange(event.target.value)}
            />
          </label>
        </>
      ) : null}
      {canvasItem.type === "code-block" ? (
        <label htmlFor={`${canvasItem.id}-inspector-code`}>
          Inspector Code Block content
          <textarea
            id={`${canvasItem.id}-inspector-code`}
            spellCheck={false}
            value={codeDraft}
            onChange={(event) => handleCodeChange(event.target.value)}
          />
        </label>
      ) : null}
      <label htmlFor={`${canvasItem.id}-inspector-tags`}>
        Inspector Tags
        <input
          id={`${canvasItem.id}-inspector-tags`}
          value={tagDraft}
          placeholder="e.g. graphs, bfs"
          onChange={(event) => handleTagsChange(event.target.value)}
        />
      </label>
    </aside>
  );
};

const labelForCanvasItem = (canvasItem: InspectableCanvasItem): string => {
  if (canvasItem.type === "link-card") {
    return "Link Card";
  }

  if (canvasItem.type === "image") {
    return "Image Item";
  }

  if (canvasItem.type === "diagram") {
    return "Diagram Item";
  }

  if (canvasItem.type === "code-block") {
    return "Code Block";
  }

  return "Text Canvas Item";
};

const highlightLabelForCanvasItem = (canvasItem: InspectableCanvasItem): string =>
  canvasItem.type === "text"
    ? "Highlighted Text Canvas Item"
    : `Highlighted ${labelForCanvasItem(canvasItem)} Canvas Region`;

const tagsForCanvasItem = (
  canvasItem: InspectableCanvasItem
): readonly string[] => canvasItem.tags;

const summaryForCanvasItem = (canvasItem: InspectableCanvasItem): string => {
  if (canvasItem.type === "link-card") {
    return canvasItem.note || canvasItem.url;
  }

  if (canvasItem.type === "image") {
    return canvasItem.caption || "Local image or screenshot";
  }

  if (canvasItem.type === "diagram") {
    return `${diagramKindLabel(canvasItem.kind)}: ${canvasItem.label}`;
  }

  if (canvasItem.type === "code-block") {
    return canvasItem.code;
  }

  return canvasItem.text;
};

interface SearchResultGroup {
  readonly pageId: PageId;
  readonly notebookPath: string;
  readonly results: readonly SearchResult[];
}

const groupSearchResultsByPage = (
  results: readonly SearchResult[]
): readonly SearchResultGroup[] => {
  const groups = new Map<PageId, SearchResultGroup>();

  for (const result of results) {
    const existingGroup = groups.get(result.pageId);

    if (existingGroup === undefined) {
      groups.set(result.pageId, {
        pageId: result.pageId,
        notebookPath: result.notebookPath,
        results: [result]
      });
      continue;
    }

    groups.set(result.pageId, {
      ...existingGroup,
      results: [...existingGroup.results, result]
    });
  }

  return Array.from(groups.values());
};

const pagePath = (sectionId: SectionId, pageId: PageId) =>
  `/sections/${encodeURIComponent(sectionId)}/pages/${encodeURIComponent(pageId)}`;

const tagsFromDraft = (draft: string): readonly string[] =>
  draft.split(",").map((tag) => tag.trim());

const renamePage = (
  notebook: Notebook,
  pageId: PageId,
  nextTitle: string
): Notebook => {
  const title = nextTitle.trim() || "Untitled Page";

  return {
    ...notebook,
    pages: notebook.pages.map((page) =>
      page.id === pageId ? { ...page, title } : page
    )
  };
};

const loadThemePreference = (): ThemePreference => {
  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);

  if (
    storedTheme === "system" ||
    storedTheme === "light" ||
    storedTheme === "dark"
  ) {
    return storedTheme;
  }

  return "system";
};

const loadAiEnabledPreference = (): boolean =>
  window.localStorage.getItem(AI_ENABLED_STORAGE_KEY) === "true";

const resolvedTheme = (preference: ThemePreference): "light" | "dark" => {
  if (preference !== "system") {
    return preference;
  }

  if (typeof window.matchMedia !== "function") {
    return "dark";
  }

  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
};

const nextThemePreference = (preference: ThemePreference): ThemePreference => {
  if (preference === "system") {
    return "light";
  }

  if (preference === "light") {
    return "dark";
  }

  return "system";
};

const themePreferenceLabel = (preference: ThemePreference): string => {
  if (preference === "system") {
    return "System";
  }

  return preference === "light" ? "Light" : "Dark";
};

const idFromLabel = (label: string): string =>
  label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const prepareNotebookForDrawingScreen = (
  notebook: Notebook
): { readonly notebook: Notebook; readonly changed: boolean } => {
  const hasDefaultSection = notebook.sections.some(
    (section) => section.id === DEFAULT_SECTION_ID
  );
  const sections = hasDefaultSection
    ? notebook.sections
    : [
        { id: DEFAULT_SECTION_ID, title: "Inbox" },
        ...notebook.sections
      ];
  const hasOpenablePage = notebook.pages.some((page) =>
    sections.some((section) => section.id === page.sectionId)
  );
  const pages = hasOpenablePage
    ? notebook.pages
    : [
        ...notebook.pages,
        {
          id: DEFAULT_PAGE_ID,
          sectionId: DEFAULT_SECTION_ID,
          title: "Default Page",
          pageType: null
        }
      ];

  if (hasDefaultSection && hasOpenablePage) {
    return { notebook, changed: false };
  }

  return {
    notebook: {
      ...notebook,
      sections,
      pages
    },
    changed: true
  };
};

const initialRouteForNotebook = (
  notebook: Notebook,
  requestedRoute: PageRoute
): PageRoute => {
  if (requestedRoute.kind === "page") {
    return requestedRoute;
  }

  const rememberedRoute = readLastOpenedPageRoute();

  if (
    rememberedRoute !== null &&
    resolveActivePage(
      notebook,
      rememberedRoute.sectionId,
      rememberedRoute.pageId
    ).kind === "found"
  ) {
    return rememberedRoute;
  }

  const firstOpenablePage = notebook.pages.find((page) =>
    notebook.sections.some((section) => section.id === page.sectionId)
  );

  if (firstOpenablePage !== undefined) {
    return {
      kind: "page",
      sectionId: firstOpenablePage.sectionId,
      pageId: firstOpenablePage.id
    };
  }

  return { kind: "notebook" };
};

const readLastOpenedPageRoute = (): OpenPageRoute | null => {
  const rawRoute = window.localStorage.getItem(LAST_OPENED_PAGE_STORAGE_KEY);

  if (rawRoute === null) {
    return null;
  }

  let parsedRoute: unknown;

  try {
    parsedRoute = JSON.parse(rawRoute) as unknown;
  } catch {
    window.localStorage.removeItem(LAST_OPENED_PAGE_STORAGE_KEY);
    return null;
  }

  if (
    typeof parsedRoute !== "object" ||
    parsedRoute === null ||
    !("sectionId" in parsedRoute) ||
    !("pageId" in parsedRoute)
  ) {
    return null;
  }

  const sectionId = parsedRoute.sectionId;
  const pageId = parsedRoute.pageId;

  if (
    typeof sectionId !== "string" ||
    typeof pageId !== "string" ||
    !sectionId.startsWith("section_") ||
    !pageId.startsWith("page_")
  ) {
    return null;
  }

  return {
    kind: "page",
    sectionId: sectionId as SectionId,
    pageId: pageId as PageId
  };
};

const rememberLastOpenedPage = (route: PageRoute) => {
  if (route.kind !== "page") {
    return;
  }

  window.localStorage.setItem(
    LAST_OPENED_PAGE_STORAGE_KEY,
    JSON.stringify({ sectionId: route.sectionId, pageId: route.pageId })
  );
};

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
