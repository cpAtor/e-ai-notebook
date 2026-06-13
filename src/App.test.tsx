import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import {
  addSection,
  addCodeBlockCanvasItem,
  addDiagramCanvasItem,
  addImageCanvasItem,
  addBlankPage,
  addLinkCardCanvasItem,
  createStarterNotebook,
  replacePageCanvasItems,
  replacePageTextCanvasItems,
  type Notebook
} from "./domain/notebook";
import {
  createNotebookStore,
  NotebookConflictError,
  NotebookRecoveryError,
  NotebookStorageUnavailableError,
  serializeNotebookExport,
  type NotebookStore
} from "./persistence/notebookStorage";

describe("App", () => {
  let stores: NotebookStore[] = [];
  let databaseName = "";
  let databaseSequence = 0;

  beforeEach(() => {
    stores = [];
    databaseSequence += 1;
    databaseName = `app-test-${databaseSequence}`;
    window.history.replaceState({}, "", "/");
    window.localStorage.clear();
  });

  afterEach(() => {
    for (const store of stores) {
      store.close();
    }
    vi.restoreAllMocks();
  });

  const renderApp = async (seedNotebook?: Notebook) => {
    const store = createNotebookStore(databaseName);
    stores.push(store);

    if (seedNotebook !== undefined) {
      await store.saveNotebook(seedNotebook);
    }

    const view = render(<App store={store} />);

    return {
      ...view,
      store
    };
  };

  const openNotebookManagement = async (
    user: ReturnType<typeof userEvent.setup>
  ) => {
    await user.click(await screen.findByRole("button", { name: "Notebook Menu" }));
    await user.click(
      await screen.findByRole("button", { name: "Notebook Management Screen" })
    );
  };

  const openCommandPalette = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(await screen.findByRole("button", { name: "Command Palette" }));
  };

  const searchNotebook = async (
    user: ReturnType<typeof userEvent.setup>,
    query: string
  ) => {
    await openCommandPalette(user);
    await user.click(await screen.findByRole("button", { name: "Search Notebook" }));
    const searchInput = await screen.findByLabelText(/Search Canvas Items/);
    await user.clear(searchInput);
    await user.type(searchInput, query);
  };

  const openNotebookBackupModal = async (
    user: ReturnType<typeof userEvent.setup>
  ) => {
    await openCommandPalette(user);
    await user.click(
      await screen.findByRole("button", { name: "Notebook Export and Import" })
    );
  };

  it("shows a private Interview Prep Notebook with seeded Sections", async () => {
    const user = userEvent.setup();
    await renderApp();
    await openNotebookManagement(user);

    expect(
      await screen.findByRole("heading", { name: "Interview Prep Notebook" })
    ).toBeInTheDocument();
    expect(screen.getByText("Private Notebook")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Local browser storage and backup guidance")
    ).toHaveTextContent(
      /Stored in local browser storage by default\.\s*Your Notebook stays in this browser unless you export it or configure a connected feature\. Browser storage is not server-grade encrypted storage, so use Notebook Export for backups rather than expecting cloud sync\./
    );
    expect(screen.getByDisplayValue("DSA")).toBeInTheDocument();
    expect(screen.getByDisplayValue("System Design")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Research")).toBeInTheDocument();
  });

  it("opens a fresh Notebook directly on an Inbox Default Page Drawing Screen", async () => {
    const { store } = await renderApp();

    expect(
      await screen.findByRole("heading", { name: "Default Page" })
    ).toBeInTheDocument();
    expect(screen.getByText("Inbox")).toBeInTheDocument();
    expect(screen.getByTestId("tldraw-page-canvas")).toBeInTheDocument();
    expect(screen.getByLabelText("Empty Canvas Prompts")).toBeInTheDocument();
    expect(screen.queryByText("Shape this Notebook around your prep")).not.toBeInTheDocument();
    await expect(store.loadNotebook()).resolves.toEqual(
      expect.objectContaining({
        sections: expect.arrayContaining([
          expect.objectContaining({ id: "section_inbox", title: "Inbox" })
        ]),
        pages: expect.arrayContaining([
          expect.objectContaining({
            id: "page_default",
            sectionId: "section_inbox",
            title: "Default Page",
            pageType: null
          })
        ])
      })
    );
  });

  it("keeps secondary actions in the Notebook Menu and Command Palette Canvas Modals", async () => {
    const user = userEvent.setup();
    const firstRender = await renderApp();

    expect(
      await screen.findByRole("heading", { name: "Default Page" })
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/Search Canvas Items/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Notebook Menu" }));
    expect(screen.getByRole("navigation", { name: "Notebook Menu" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Theme: System" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Notebook Export and Import" })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Shortcuts" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Theme: System" }));
    expect(window.localStorage.getItem("interview_prep_notebook:theme")).toBe("light");
    await user.click(screen.getByRole("button", { name: "Settings" }));
    expect(
      await screen.findByRole("dialog", { name: "Notebook Settings" })
    ).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Theme"), "dark");
    expect(window.localStorage.getItem("interview_prep_notebook:theme")).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    await user.clear(screen.getByLabelText("Current Page title"));
    await user.type(screen.getByLabelText("Current Page title"), "Renamed Page");
    expect(await screen.findByRole("heading", { name: "Renamed Page" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close Modal" }));

    firstRender.unmount();
    firstRender.store.close();
    await renderApp();

    expect(await screen.findByRole("heading", { name: "Renamed Page" })).toBeInTheDocument();
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("invokes search, Page switching, and Page creation from the Command Palette", async () => {
    const user = userEvent.setup();
    const starterNotebook = createStarterNotebook();
    const dsa = starterNotebook.sections[0];
    const research = starterNotebook.sections.find(
      (section) => section.title === "Research"
    );

    if (dsa === undefined || research === undefined) {
      throw new Error("Expected seeded Sections.");
    }

    const notebookWithPages = addBlankPage(
      addBlankPage(starterNotebook, dsa.id, "page_dsa"),
      research.id,
      "page_research"
    );

    await renderApp(notebookWithPages);
    await screen.findByRole("heading", { name: "Untitled Page" });
    await openCommandPalette(user);

    expect(
      await screen.findByRole("dialog", { name: "Command Palette" })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Search Notebook" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Switch or create Page" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create Page in current Section" })
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Switch or create Page" }));
    expect(
      await screen.findByRole("dialog", { name: "Page Switcher" })
    ).toBeInTheDocument();
    const researchRow = screen.getByText("Research").closest("li");

    if (researchRow === null) {
      throw new Error("Expected Research Page row.");
    }

    await user.click(within(researchRow).getByRole("button", { name: "Open Page" }));
    expect(window.location.pathname).toBe("/sections/section_research/pages/page_research");

    await openCommandPalette(user);
    await user.click(screen.getByRole("button", { name: "Create Page in current Section" }));
    expect(window.location.pathname).toMatch(
      /^\/sections\/section_research\/pages\/page_/
    );

    await searchNotebook(user, "no matching notes");
    expect(await screen.findByText("No Search Results found in this Notebook.")).toBeInTheDocument();
  });

  it("hides Empty Canvas Prompts once the Default Page has a Canvas Item", async () => {
    const notebookWithDefaultText = replacePageTextCanvasItems(
      {
        ...createStarterNotebook(),
        sections: [{ id: "section_inbox", title: "Inbox" }],
        pages: [
          {
            id: "page_default",
            sectionId: "section_inbox",
            title: "Default Page",
            pageType: null
          }
        ]
      },
      "page_default",
      [
        {
          id: "canvas_item_started",
          pageId: "page_default",
          type: "text",
          text: "Started rough work",
          tags: []
        }
      ],
      [
        {
          pageId: "page_default",
          canvasItemId: "canvas_item_started",
          bounds: { x: 64, y: 48, width: 260, height: 64 }
        }
      ]
    );

    await renderApp(notebookWithDefaultText);

    expect(
      await screen.findByRole("heading", { name: "Default Page" })
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Empty Canvas Prompts")).not.toBeInTheDocument();
  });

  it("opens the last opened Page for a returning Notebook when it still exists", async () => {
    const starterNotebook = createStarterNotebook();
    const dsa = starterNotebook.sections[0];
    const research = starterNotebook.sections.find(
      (section) => section.title === "Research"
    );

    if (dsa === undefined || research === undefined) {
      throw new Error("Expected seeded Sections.");
    }

    const notebookWithPages = addBlankPage(
      addBlankPage(starterNotebook, dsa.id, "page_dsa"),
      research.id,
      "page_research"
    );
    window.localStorage.setItem(
      "interview_prep_notebook:last_opened_page",
      JSON.stringify({ sectionId: research.id, pageId: "page_research" })
    );

    await renderApp(notebookWithPages);

    expect(
      await screen.findByRole("heading", { name: "Untitled Page" })
    ).toBeInTheDocument();
    expect(screen.getByText("Research")).toBeInTheDocument();
  });

  it("falls back to the first existing Page when the remembered Page is gone", async () => {
    const starterNotebook = createStarterNotebook();
    const dsa = starterNotebook.sections[0];

    if (dsa === undefined) {
      throw new Error("Expected seeded DSA Section.");
    }

    const notebookWithPage = addBlankPage(starterNotebook, dsa.id, "page_dsa");
    window.localStorage.setItem(
      "interview_prep_notebook:last_opened_page",
      JSON.stringify({ sectionId: "section_missing", pageId: "page_missing" })
    );

    await renderApp(notebookWithPage);

    expect(
      await screen.findByRole("heading", { name: "Untitled Page" })
    ).toBeInTheDocument();
    expect(screen.getByText("DSA")).toBeInTheDocument();
  });

  it("renames, adds, and removes Sections", async () => {
    const user = userEvent.setup();
    await renderApp();
    await openNotebookManagement(user);

    await screen.findByDisplayValue("DSA");
    await user.clear(screen.getByDisplayValue("DSA"));
    await user.type(screen.getByLabelText("Rename DSA"), "Algorithms");
    await user.type(screen.getByLabelText("Add a Section"), "Behavioral");
    await user.click(screen.getByRole("button", { name: "Add Section" }));
    const researchRow = screen.getByDisplayValue("Research").closest("li");

    if (researchRow === null) {
      throw new Error("Expected Research Section row.");
    }

    await user.click(within(researchRow).getByRole("button", { name: "Remove" }));

    expect(screen.getByDisplayValue("Algorithms")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Behavioral")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Research")).not.toBeInTheDocument();
  });

  it("keeps failed autosaves sticky and retries the visible unsaved Notebook", async () => {
    const user = userEvent.setup();
    let persistedNotebook = createStarterNotebook();
    let rejectSaves = true;
    const failingStore: NotebookStore = {
      loadNotebook: vi.fn(async () => persistedNotebook),
      saveNotebook: vi.fn(async (nextNotebook) => {
        if (rejectSaves) {
          throw new Error("IndexedDB write failed.");
        }

        persistedNotebook = nextNotebook;
      }),
      loadRawNotebookPayload: vi.fn(async () => JSON.stringify(persistedNotebook)),
      startFreshNotebook: vi.fn(async () => {
        persistedNotebook = createStarterNotebook();
        return persistedNotebook;
      }),
      close: vi.fn()
    };

    const view = render(<App store={failingStore} />);
    await openNotebookManagement(user);

    await screen.findByDisplayValue("DSA");
    await user.type(screen.getByLabelText("Add a Section"), "Behavioral");
    await user.click(screen.getByRole("button", { name: "Add Section" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Autosave failed");
    expect(screen.getByDisplayValue("Behavioral")).toBeInTheDocument();
    expect(screen.queryByText("Notebook changes saved")).not.toBeInTheDocument();

    rejectSaves = false;
    await user.click(screen.getByRole("button", { name: "Retry Save" }));

    expect(
      await screen.findByText("Notebook changes saved")
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        persistedNotebook.sections.some((section) => section.title === "Behavioral")
      ).toBe(true)
    );

    view.unmount();
    render(<App store={failingStore} />);
    await openNotebookManagement(user);

    expect(await screen.findByDisplayValue("Behavioral")).toBeInTheDocument();
  });

  it("pauses autosave and reloads stored data when another tab changed the Notebook", async () => {
    const user = userEvent.setup();
    const firstLoadedNotebook = createStarterNotebook();
    const externallySavedNotebook = addSection(
      firstLoadedNotebook,
      "section_external",
      "External prep"
    );
    let loadCount = 0;
    const conflictStore: NotebookStore = {
      loadNotebook: vi.fn(async () => {
        loadCount += 1;
        return loadCount === 1 ? firstLoadedNotebook : externallySavedNotebook;
      }),
      saveNotebook: vi.fn(async () => {
        throw new NotebookConflictError();
      }),
      loadRawNotebookPayload: vi.fn(async () => JSON.stringify(externallySavedNotebook)),
      startFreshNotebook: vi.fn(async () => createStarterNotebook()),
      close: vi.fn()
    };

    render(<App store={conflictStore} />);
    await openNotebookManagement(user);

    await screen.findByDisplayValue("DSA");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Another tab changed this Notebook"
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      /Autosave is paused in this tab/i
    );
    expect(screen.queryByText("Notebook changes saved")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reload Stored Notebook" }));
    await openNotebookManagement(user);

    expect(await screen.findByDisplayValue("External prep")).toBeInTheDocument();
  });

  it("shows unsupported storage when the Notebook cannot load from IndexedDB", async () => {
    const unavailableStore: NotebookStore = {
      loadNotebook: vi.fn(async () => {
        throw new NotebookStorageUnavailableError(
          "Notebook startup",
          new Error("IndexedDB is blocked.")
        );
      }),
      saveNotebook: vi.fn(),
      loadRawNotebookPayload: vi.fn(async () => null),
      startFreshNotebook: vi.fn(async () => createStarterNotebook()),
      close: vi.fn()
    };

    render(<App store={unavailableStore} />);

    expect(
      await screen.findByRole("heading", {
        name: "Notebook storage is unavailable"
      })
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      /Capture cannot be safely persisted/i
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/IndexedDB is enabled/i);
    expect(screen.queryByLabelText("Autosave status")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add Section" })).not.toBeInTheDocument();
  });

  it("enters unsupported storage instead of claiming autosave after a first persistence failure", async () => {
    const unavailableStore: NotebookStore = {
      loadNotebook: vi.fn(async () => createStarterNotebook()),
      saveNotebook: vi.fn(async () => {
        throw new NotebookStorageUnavailableError(
          "Notebook persistence",
          new Error("IndexedDB writes are blocked.")
        );
      }),
      loadRawNotebookPayload: vi.fn(async () => null),
      startFreshNotebook: vi.fn(async () => createStarterNotebook()),
      close: vi.fn()
    };

    render(<App store={unavailableStore} />);

    expect(
      await screen.findByRole("heading", {
        name: "Notebook storage is unavailable"
      })
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      /Capture cannot be safely persisted/i
    );
    expect(screen.queryByLabelText("Autosave status")).not.toBeInTheDocument();
    expect(screen.queryByText("Notebook changes saved")).not.toBeInTheDocument();
    expect(screen.queryByText("Saving Notebook changes")).not.toBeInTheDocument();
  });

  it("shows recovery actions for invalid stored Notebook data without claiming autosave", async () => {
    const user = userEvent.setup();
    const rawPayload = '{ "schemaVersion": 2, "notebook": "corrupt" }';
    const recoveryStore: NotebookStore = {
      loadNotebook: vi.fn(async () => {
        throw new NotebookRecoveryError(
          new Error("Expected Notebook object."),
          rawPayload
        );
      }),
      loadRawNotebookPayload: vi.fn(async () => rawPayload),
      saveNotebook: vi.fn(),
      startFreshNotebook: vi.fn(async () => createStarterNotebook()),
      close: vi.fn()
    };

    render(<App store={recoveryStore} />);

    expect(
      await screen.findByRole("heading", { name: "Notebook data needs recovery" })
    ).toBeInTheDocument();
    expect(screen.getByText(/autosave are paused/i)).toBeInTheDocument();
    expect(screen.queryByText("Notebook changes saved")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Export Raw Stored Payload" }));

    expect(screen.getByLabelText("Raw stored payload JSON")).toHaveValue(rawPayload);

    await user.click(screen.getByRole("button", { name: "Start New Notebook" }));

    expect(
      await screen.findByRole("heading", { name: "Interview Prep Notebook" })
    ).toBeInTheDocument();
    expect(recoveryStore.startFreshNotebook).toHaveBeenCalled();
  });

  it("imports a valid Notebook Export from the recovery screen", async () => {
    const user = userEvent.setup();
    const importedNotebook = addSection(
      createStarterNotebook(),
      "section_behavioral",
      "Behavioral"
    );
    const recoveryStore: NotebookStore = {
      loadNotebook: vi.fn(async () => {
        throw new NotebookRecoveryError(
          new Error("Canvas Items were invalid."),
          '{ "schemaVersion": 2 }'
        );
      }),
      loadRawNotebookPayload: vi.fn(async () => '{ "schemaVersion": 2 }'),
      saveNotebook: vi.fn(),
      startFreshNotebook: vi.fn(async () => createStarterNotebook()),
      close: vi.fn()
    };

    render(<App store={recoveryStore} />);

    await screen.findByRole("heading", { name: "Notebook data needs recovery" });
    await user.upload(
      screen.getByLabelText("Import Notebook Export"),
      new File([serializeNotebookExport(importedNotebook)], "notebook.json", {
        type: "application/json"
      })
    );
    await openNotebookManagement(user);

    expect(await screen.findByDisplayValue("Behavioral")).toBeInTheDocument();
    expect(recoveryStore.saveNotebook).toHaveBeenCalledWith(
      expect.objectContaining({
        sections: expect.arrayContaining([
          expect.objectContaining({ id: "section_inbox", title: "Inbox" }),
          expect.objectContaining({ id: "section_behavioral", title: "Behavioral" })
        ]),
        pages: expect.arrayContaining([
          expect.objectContaining({
            id: "page_default",
            sectionId: "section_inbox",
            title: "Default Page"
          })
        ])
      })
    );
  });

  it("makes no default runtime fetch calls", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("Network is disabled by default."));

    await renderApp();

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("creates a blank Page in a Section and opens a URL-addressable route", async () => {
    const user = userEvent.setup();
    await renderApp();
    await openNotebookManagement(user);

    const dsaInput = await screen.findByDisplayValue("DSA");
    const dsaRow = dsaInput.closest("li");

    if (dsaRow === null) {
      throw new Error("Expected DSA Section row.");
    }

    await user.click(
      within(dsaRow).getByRole("button", { name: "New Blank Page" })
    );

    expect(
      await screen.findByRole("heading", { name: "Untitled Page" })
    ).toBeInTheDocument();
    expect(screen.getByText("Page Type: unset")).toBeInTheDocument();
    expect(screen.getByTestId("tldraw-page-canvas")).toBeInTheDocument();
    expect(window.location.pathname).toMatch(
      /^\/sections\/section_dsa\/pages\/page_/
    );
  });

  it("reopens the same Page from its URL after reload", async () => {
    const user = userEvent.setup();
    const firstRender = await renderApp();
    await openNotebookManagement(user);

    const dsaRow = (await screen.findByDisplayValue("DSA")).closest("li");

    if (dsaRow === null) {
      throw new Error("Expected DSA Section row.");
    }

    await user.click(
      within(dsaRow).getByRole("button", { name: "New Blank Page" })
    );
    await screen.findByRole("heading", { name: "Untitled Page" });
    const pagePath = window.location.pathname;

    firstRender.unmount();
    firstRender.store.close();
    window.history.replaceState({}, "", pagePath);
    await renderApp();

    expect(
      await screen.findByRole("heading", { name: "Untitled Page" })
    ).toBeInTheDocument();
    expect(screen.getByText("DSA")).toBeInTheDocument();
    expect(screen.getByTestId("tldraw-page-canvas")).toBeInTheDocument();
  });

  it("shows invalid Section and Page URL states without resetting the Notebook", async () => {
    window.history.replaceState(
      {},
      "",
      "/sections/section_missing/pages/page_missing"
    );
    const firstRender = await renderApp();

    expect(await screen.findByRole("alert")).toHaveTextContent("Section not found");
    firstRender.unmount();
    firstRender.store.close();

    window.history.replaceState(
      {},
      "",
      "/sections/section_dsa/pages/page_missing"
    );
    await renderApp();

    expect(await screen.findByRole("alert")).toHaveTextContent("Page not found");
  });

  it("searches text Rough Work and opens a highlighted Canvas Region", async () => {
    const user = userEvent.setup();
    const starterNotebook = createStarterNotebook();
    const dsa = starterNotebook.sections[0];

    if (dsa === undefined) {
      throw new Error("Expected seeded DSA Section.");
    }

    const notebookWithPage = addBlankPage(starterNotebook, dsa.id, "page_dsa");
    const notebookWithText = replacePageTextCanvasItems(
      notebookWithPage,
      "page_dsa",
      [
        {
          id: "canvas_item_trace",
          pageId: "page_dsa",
          type: "text",
          text: "Binary search invariant",
          tags: []
        }
      ],
      [
        {
          pageId: "page_dsa",
          canvasItemId: "canvas_item_trace",
          bounds: { x: 120, y: 80, width: 260, height: 64 }
        }
      ]
    );

    await renderApp(notebookWithText);
    await screen.findByRole("heading", { name: "Interview Prep Notebook" });
    await searchNotebook(user, "invariant");

    const result = await screen.findByText(
      "Interview Prep Notebook / DSA / Untitled Page"
    );

    expect(result).toBeInTheDocument();
    expect(screen.getAllByText(/Binary search invariant/).length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "Open Result" }));

    expect(window.location.pathname).toBe("/sections/section_dsa/pages/page_dsa");
    expect(
      await screen.findByLabelText("Highlighted Canvas Region")
    ).toBeInTheDocument();
  });

  it("tags text Rough Work and shows matched Tags in Search Results", async () => {
    const user = userEvent.setup();
    const starterNotebook = createStarterNotebook();
    const dsa = starterNotebook.sections[0];

    if (dsa === undefined) {
      throw new Error("Expected seeded DSA Section.");
    }

    const notebookWithPage = addBlankPage(starterNotebook, dsa.id, "page_dsa");
    const notebookWithText = replacePageTextCanvasItems(
      notebookWithPage,
      "page_dsa",
      [
        {
          id: "canvas_item_trace",
          pageId: "page_dsa",
          type: "text",
          text: "Binary search invariant",
          tags: []
        }
      ],
      [
        {
          pageId: "page_dsa",
          canvasItemId: "canvas_item_trace",
          bounds: { x: 120, y: 80, width: 260, height: 64 }
        }
      ]
    );

    const { store } = await renderApp(notebookWithText);
    await screen.findByRole("heading", { name: "Interview Prep Notebook" });
    await user.click(
      await screen.findByRole("button", { name: "Open Item Inspector" })
    );
    await user.type(
      await screen.findByLabelText("Inspector Tags"),
      "arrays, invariant"
    );
    await searchNotebook(user, "arrays");

    expect(await screen.findByText("Matched Tags: #arrays")).toBeInTheDocument();
    await waitFor(async () => {
      const reloadedNotebook = await store.loadNotebook();
      expect(reloadedNotebook.canvasItems).toContainEqual({
        id: "canvas_item_trace",
        pageId: "page_dsa",
        type: "text",
        text: "Binary search invariant",
        tags: ["arrays", "invariant"]
      });
    });
  });

  it("adds Link Cards with notes and Tags, persists them, and searches without crawling", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("Network is disabled by default."));
    const firstRender = await renderApp();
    await openNotebookManagement(user);

    const researchRow = (await screen.findByDisplayValue("Research")).closest("li");

    if (researchRow === null) {
      throw new Error("Expected Research Section row.");
    }

    await user.click(
      within(researchRow).getByRole("button", { name: "New Blank Page" })
    );
    await user.type(
      await screen.findByLabelText("Link Card URL"),
      "https://example.com/system-design"
    );
    await user.type(
      screen.getByLabelText("Optional notes"),
      "Distributed cache research queue"
    );
    await user.type(screen.getByLabelText("Optional Tags"), "cache, reading");
    await user.click(screen.getByRole("button", { name: "Add Link Card" }));

    expect(
      await screen.findByRole("link", {
        name: "https://example.com/system-design"
      })
    ).toBeInTheDocument();
    await searchNotebook(user, "cache");

    expect((await screen.findAllByText("Link Card")).length).toBeGreaterThan(0);
    expect(screen.getByText("Matched Tags: #cache")).toBeInTheDocument();
    expect(screen.getAllByText(/Distributed cache research queue/).length).toBeGreaterThan(0);
    await waitFor(async () => {
      const reloadedNotebook = await firstRender.store.loadNotebook();
      expect(reloadedNotebook.canvasItems).toContainEqual({
        id: expect.stringMatching(/^canvas_item_/),
        pageId: expect.stringMatching(/^page_/),
        type: "link-card",
        url: "https://example.com/system-design",
        note: "Distributed cache research queue",
        tags: ["cache", "reading"]
      });
    });

    const pagePath = window.location.pathname;
    firstRender.unmount();
    firstRender.store.close();
    window.history.replaceState({}, "", pagePath);
    await renderApp();

    expect(
      await screen.findByRole("link", {
        name: "https://example.com/system-design"
      })
    ).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("creates, edits, reloads, searches, and highlights Code Blocks without runner affordances", async () => {
    const user = userEvent.setup();
    const firstRender = await renderApp();
    await openNotebookManagement(user);

    const dsaRow = (await screen.findByDisplayValue("DSA")).closest("li");

    if (dsaRow === null) {
      throw new Error("Expected DSA Section row.");
    }

    await user.click(
      within(dsaRow).getByRole("button", { name: "New Blank Page" })
    );
    await user.type(
      await screen.findByLabelText("Code Block content"),
      "const complement = target - nums[i];"
    );
    await user.type(screen.getByLabelText("Code Block Tags"), "arrays, two sum");
    await user.click(screen.getByRole("button", { name: "Add Code Block" }));

    expect((await screen.findAllByText(/const complement/)).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /run/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/judge/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/sandbox/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Open Item Inspector" }));
    await user.clear(screen.getByLabelText("Inspector Code Block content"));
    await user.type(
      screen.getByLabelText("Inspector Code Block content"),
      "return seen.get(complement);"
    );
    await searchNotebook(user, "two sum");

    expect((await screen.findAllByText("Code Block")).length).toBeGreaterThan(0);
    expect(screen.getByText("Matched Tags: #two sum")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open Result" }));

    expect(
      await screen.findByLabelText("Highlighted Code Block Canvas Region")
    ).toBeInTheDocument();
    await waitFor(async () => {
      const reloadedNotebook = await firstRender.store.loadNotebook();
      expect(reloadedNotebook.canvasItems).toContainEqual({
        id: expect.stringMatching(/^canvas_item_/),
        pageId: expect.stringMatching(/^page_/),
        type: "code-block",
        code: "return seen.get(complement);",
        tags: ["arrays", "two sum"]
      });
    });

    const pagePath = window.location.pathname;
    firstRender.unmount();
    firstRender.store.close();
    window.history.replaceState({}, "", pagePath);
    await renderApp();

    expect(
      (await screen.findAllByText("return seen.get(complement);")).length
    ).toBeGreaterThan(0);
  });

  it("adds Image Items with optional captions and Tags, persists them, and searches without AI summaries", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("Network is disabled by default."));
    const firstRender = await renderApp();
    await openNotebookManagement(user);

    const systemDesignRow = (
      await screen.findByDisplayValue("System Design")
    ).closest("li");

    if (systemDesignRow === null) {
      throw new Error("Expected System Design Section row.");
    }

    await user.click(
      within(systemDesignRow).getByRole("button", { name: "New Blank Page" })
    );
    await user.upload(
      await screen.findByLabelText("Image Item file"),
      new File(["diagram"], "failover.png", { type: "image/png" })
    );

    expect(await screen.findByText("Ready to add: failover.png")).toBeInTheDocument();
    await user.type(
      screen.getByLabelText("Optional caption"),
      "Load balancer failover sketch"
    );
    await user.type(screen.getByLabelText("Image Tags"), "diagrams, availability");
    await user.click(screen.getByRole("button", { name: "Add Image Item" }));

    expect(
      await screen.findByRole("img", { name: "Load balancer failover sketch" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /AI summary|classify/i })
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Open Item Inspector" }));
    await user.clear(screen.getByLabelText("Inspector Image Item caption"));
    await user.type(
      screen.getByLabelText("Inspector Image Item caption"),
      "Updated failover sketch"
    );
    await searchNotebook(user, "availability");

    expect((await screen.findAllByText("Image Item")).length).toBeGreaterThan(0);
    expect(screen.getByText("Matched Tags: #availability")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open Result" }));

    expect(
      await screen.findByLabelText("Highlighted Image Item Canvas Region")
    ).toBeInTheDocument();
    await waitFor(async () => {
      const reloadedNotebook = await firstRender.store.loadNotebook();
      expect(reloadedNotebook.canvasItems).toContainEqual({
        id: expect.stringMatching(/^canvas_item_/),
        pageId: expect.stringMatching(/^page_/),
        type: "image",
        dataUrl: expect.stringMatching(/^data:image\/png;base64,/),
        mediaType: "image/png",
        caption: "Updated failover sketch",
        tags: ["diagrams", "availability"]
      });
    });

    const pagePath = window.location.pathname;
    firstRender.unmount();
    firstRender.store.close();
    window.history.replaceState({}, "", pagePath);
    await renderApp();

    expect(
      await screen.findByRole("img", { name: "Updated failover sketch" })
    ).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("creates, edits, reloads, searches, and highlights Diagram Items for system design", async () => {
    const user = userEvent.setup();
    const firstRender = await renderApp();
    await openNotebookManagement(user);

    const systemDesignRow = (
      await screen.findByDisplayValue("System Design")
    ).closest("li");

    if (systemDesignRow === null) {
      throw new Error("Expected System Design Section row.");
    }

    await user.click(
      within(systemDesignRow).getByRole("button", { name: "New Blank Page" })
    );
    await user.selectOptions(
      await screen.findByLabelText("Diagram Item type"),
      "arrow"
    );
    await user.type(
      screen.getByLabelText("Diagram Item label"),
      "API Gateway publishes to queue"
    );
    await user.type(screen.getByLabelText("Diagram Tags"), "backpressure, async");
    await user.click(screen.getByRole("button", { name: "Add Diagram Item" }));

    expect(
      await screen.findByText("API Gateway publishes to queue")
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open Item Inspector" }));
    await user.selectOptions(
      screen.getByLabelText("Inspector Diagram Item kind"),
      "sticky-note"
    );
    await user.clear(screen.getByLabelText("Inspector Diagram Item label"));
    await user.type(
      screen.getByLabelText("Inspector Diagram Item label"),
      "Queue absorbs write spikes"
    );
    await searchNotebook(user, "backpressure");

    expect((await screen.findAllByText("Diagram Item")).length).toBeGreaterThan(0);
    expect(screen.getByText("Matched Tags: #backpressure")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open Result" }));

    expect(
      await screen.findByLabelText("Highlighted Diagram Item Canvas Region")
    ).toBeInTheDocument();
    await waitFor(async () => {
      const reloadedNotebook = await firstRender.store.loadNotebook();
      expect(reloadedNotebook.canvasItems).toContainEqual({
        id: expect.stringMatching(/^canvas_item_/),
        pageId: expect.stringMatching(/^page_/),
        type: "diagram",
        kind: "sticky-note",
        label: "Queue absorbs write spikes",
        tags: ["backpressure", "async"]
      });
    });

    const pagePath = window.location.pathname;
    firstRender.unmount();
    firstRender.store.close();
    window.history.replaceState({}, "", pagePath);
    await renderApp();

    expect(
      await screen.findByText("Queue absorbs write spikes")
    ).toBeInTheDocument();
  });

  it("shows Freehand Drawing controls without OCR or searchable handwriting claims", async () => {
    const user = userEvent.setup();
    const starterNotebook = createStarterNotebook();
    const dsa = starterNotebook.sections[0];

    if (dsa === undefined) {
      throw new Error("Expected seeded DSA Section.");
    }

    const notebookWithDrawing = replacePageCanvasItems(
      addBlankPage(starterNotebook, dsa.id, "page_dsa"),
      "page_dsa",
      [],
      [
        {
          id: "canvas_item_sketch",
          pageId: "page_dsa",
          type: "freehand-drawing",
          shape: {
            type: "draw",
            x: 24,
            y: 36,
            rotation: 0,
            props: {
              segments: [{ type: "free", path: "encoded-handwriting-stroke" }]
            }
          }
        }
      ],
      [
        {
          pageId: "page_dsa",
          canvasItemId: "canvas_item_sketch",
          bounds: { x: 24, y: 36, width: 180, height: 90 }
        }
      ]
    );

    await renderApp(notebookWithDrawing);
    await screen.findByRole("heading", { name: "Interview Prep Notebook" });

    expect(await screen.findByRole("button", { name: "Use Draw Tool" })).toBeInTheDocument();
    expect(screen.getByText(/not OCR or searchable handwriting/i)).toBeInTheDocument();

    await searchNotebook(user, "encoded-handwriting-stroke");

    expect(await screen.findByText("No Search Results found in this Notebook.")).toBeInTheDocument();
    expect(screen.queryByText("Freehand Drawing")).not.toBeInTheDocument();
  });

  it("searches seeded Code Blocks and opens their highlighted Canvas Region", async () => {
    const user = userEvent.setup();
    const starterNotebook = createStarterNotebook();
    const dsa = starterNotebook.sections[0];

    if (dsa === undefined) {
      throw new Error("Expected seeded DSA Section.");
    }

    const notebookWithCodeBlock = addCodeBlockCanvasItem(
      addBlankPage(starterNotebook, dsa.id, "page_dsa"),
      "page_dsa",
      "canvas_item_code_block",
      "function bfs(queue) { return queue.shift(); }",
      ["graphs"]
    );

    await renderApp(notebookWithCodeBlock);
    await screen.findByRole("heading", { name: "Interview Prep Notebook" });
    await searchNotebook(user, "bfs");
    await user.click(await screen.findByRole("button", { name: "Open Result" }));

    expect(
      await screen.findByLabelText("Highlighted Code Block Canvas Region")
    ).toBeInTheDocument();
  });

  it("searches seeded Image Items and opens their highlighted Canvas Region", async () => {
    const user = userEvent.setup();
    const starterNotebook = createStarterNotebook();
    const systemDesign = starterNotebook.sections.find(
      (section) => section.title === "System Design"
    );

    if (systemDesign === undefined) {
      throw new Error("Expected seeded System Design Section.");
    }

    const notebookWithImage = addImageCanvasItem(
      addBlankPage(starterNotebook, systemDesign.id, "page_design"),
      "page_design",
      "canvas_item_image",
      "data:image/png;base64,ZGlhZ3JhbQ==",
      "image/png",
      "Queue backpressure diagram",
      ["queues"]
    );

    await renderApp(notebookWithImage);
    await screen.findByRole("heading", { name: "Interview Prep Notebook" });
    await searchNotebook(user, "backpressure");
    await user.click(await screen.findByRole("button", { name: "Open Result" }));

    expect(
      await screen.findByLabelText("Highlighted Image Item Canvas Region")
    ).toBeInTheDocument();
  });

  it("exports and imports a Notebook backup while rebuilding Search Results", async () => {
    const user = userEvent.setup();
    const starterNotebook = createStarterNotebook();
    const research = starterNotebook.sections.find(
      (section) => section.title === "Research"
    );

    if (research === undefined) {
      throw new Error("Expected seeded Research Section.");
    }

    const notebookWithPage = addBlankPage(
      starterNotebook,
      research.id,
      "page_research"
    );
    const notebookWithText = replacePageTextCanvasItems(
      notebookWithPage,
      "page_research",
      [
        {
          id: "canvas_item_note",
          pageId: "page_research",
          type: "text",
          text: "Consistent hashing notes",
          tags: ["distributed systems"]
        }
      ],
      [
        {
          pageId: "page_research",
          canvasItemId: "canvas_item_note",
          bounds: { x: 12, y: 24, width: 240, height: 80 }
        }
      ]
    );
    const notebookWithLink = addLinkCardCanvasItem(
      notebookWithText,
      "page_research",
      "canvas_item_link",
      "https://example.com/cache",
      "Cache reference",
      ["reading"]
    );
    const notebookWithCode = addCodeBlockCanvasItem(
      notebookWithLink,
      "page_research",
      "canvas_item_code",
      "function shard(key) { return hash(key) % nodes.length; }",
      ["sharding"]
    );
    const notebookWithImage = addImageCanvasItem(
      notebookWithCode,
      "page_research",
      "canvas_item_image",
      "data:image/png;base64,Y2FjaGU=",
      "image/png",
      "Cache topology",
      ["topology"]
    );
    const importedNotebook = addDiagramCanvasItem(
      notebookWithImage,
      "page_research",
      "canvas_item_diagram",
      "sticky-note",
      "Eviction policy reminder",
      ["eviction"]
    );

    await renderApp();
    await screen.findByRole("heading", { name: "Interview Prep Notebook" });
    await openNotebookBackupModal(user);
    await user.click(screen.getByRole("button", { name: "Export Notebook Backup" }));

    const exportJson = await screen.findByLabelText("Notebook Export JSON");
    const exportJsonValue = (exportJson as HTMLTextAreaElement).value;

    expect(exportJsonValue).toContain('"canvasItems": []');
    expect(exportJsonValue).not.toContain("localIndex");

    await user.upload(
      screen.getByLabelText("Import Notebook Export"),
      new File([serializeNotebookExport(importedNotebook)], "notebook.json", {
        type: "application/json"
      })
    );

    expect(
      await screen.findByText(/Search uses a freshly rebuilt Local Index/)
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close Modal" }));
    await searchNotebook(user, "eviction");

    expect((await screen.findAllByText("Diagram Item")).length).toBeGreaterThan(0);
    expect(screen.getByText("Matched Tags: #eviction")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open Result" }));

    expect(
      await screen.findByLabelText("Highlighted Diagram Item Canvas Region")
    ).toBeInTheDocument();
  });
});
