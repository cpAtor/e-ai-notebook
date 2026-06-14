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
  STARTER_INBOX_SECTION_ID,
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
    localStorage.clear();
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

  // Helper: open the Canvas Lens menu and click an action inside it.
  const openMenuAndClick = async (user: ReturnType<typeof userEvent.setup>, itemName: string) => {
    await user.click(screen.getByRole("button", { name: "Menu" }));
    await user.click(screen.getByRole("menuitem", { name: itemName }));
  };

  it("opens directly into the Default Page Drawing Screen for a fresh user", async () => {
    await renderApp();

    expect(
      await screen.findByRole("heading", { name: "Interview Prep Notebook" })
    ).toBeInTheDocument();
    expect(screen.getByTestId("notebook-page-canvas")).toBeInTheDocument();
    expect(window.location.pathname).toMatch(
      /^\/sections\/section_inbox\/pages\/page_default$/
    );
    // Privacy badge lives in the Canvas Lens menu (not the persistent HUD).
    expect(screen.getByRole("button", { name: "Menu" })).toBeInTheDocument();
  });

  it("shows Notebook Management Screen with Inbox Section when navigating back", async () => {
    await renderApp();

    await screen.findByTestId("notebook-page-canvas");
    const user = userEvent.setup();
    await openMenuAndClick(user, "Notebook Management");

    expect(
      await screen.findByRole("heading", { name: "Interview Prep Notebook" })
    ).toBeInTheDocument();
    expect(screen.getByText("Private Notebook")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Local browser storage and backup guidance")
    ).toHaveTextContent(
      /Stored in local browser storage by default\.\s*Your Notebook stays in this browser unless you export it or configure a connected feature\. Browser storage is not server-grade encrypted storage, so use Notebook Export for backups rather than expecting cloud sync\./
    );
    expect(screen.getByDisplayValue("Inbox")).toBeInTheDocument();
  });

  it("opens hamburger management actions and persists theme selection", async () => {
    await renderApp();
    const user = userEvent.setup();

    await screen.findByTestId("notebook-page-canvas");
    await openMenuAndClick(user, "Settings");

    expect(await screen.findByRole("dialog", { name: "Settings" })).toContainElement(
      screen.getByRole("checkbox", { name: /enable ai features/i })
    );

    await user.click(screen.getByRole("button", { name: "Close Settings" }));
    await user.click(screen.getByRole("button", { name: "Menu" }));
    await user.click(screen.getByRole("menuitem", { name: "Light" }));

    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem("notebook_theme")).toBe("light");

    await openMenuAndClick(user, "Export");
    const exportDialog = await screen.findByRole("dialog", { name: "Export Notebook Backup" });
    expect(exportDialog).toBeInTheDocument();
    expect(
      within(exportDialog).getByRole("button", { name: "Export Notebook Backup" })
    ).toBeInTheDocument();
  });

  it("opens the command palette and runs notebook actions", async () => {
    await renderApp();
    const user = userEvent.setup();

    await screen.findByTestId("notebook-page-canvas");
    await user.keyboard("{Control>}k{/Control}");
    await screen.findByRole("dialog", { name: "Command Palette" });
    await user.type(screen.getByRole("textbox", { name: "Command Palette" }), "New Page in Inbox");
    await user.keyboard("{Enter}");

    expect(await screen.findByRole("heading", { name: "Untitled Page" })).toBeInTheDocument();

    await user.keyboard("{Control>}k{/Control}");
    const commandInput = await screen.findByRole("textbox", { name: "Command Palette" });
    await user.type(commandInput, "Search Notebook");
    await user.keyboard("{Enter}");

    expect(await screen.findByRole("dialog", { name: "Search Notebook" })).toBeInTheDocument();
  });

  it("renames, adds, and removes Sections", async () => {
    const user = userEvent.setup();
    await renderApp();

    await screen.findByTestId("notebook-page-canvas");
    await openMenuAndClick(user, "Notebook Management");
    await screen.findByDisplayValue("Inbox");
    await user.clear(screen.getByDisplayValue("Inbox"));
    await user.type(screen.getByLabelText("Rename Inbox"), "Algorithms");
    await user.type(screen.getByLabelText("Add a Section"), "Behavioral");
    await user.click(screen.getByRole("button", { name: "Add Section" }));

    const algorithmsRow = screen.getByDisplayValue("Algorithms").closest("li");

    if (algorithmsRow === null) {
      throw new Error("Expected Algorithms Section row.");
    }

    await user.click(within(algorithmsRow).getByRole("button", { name: "Remove" }));

    expect(screen.getByDisplayValue("Behavioral")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Algorithms")).not.toBeInTheDocument();
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

    await screen.findByTestId("notebook-page-canvas");
    await openMenuAndClick(user, "Notebook Management");
    await screen.findByDisplayValue("Inbox");
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

    await screen.findByTestId("notebook-page-canvas");
    await openMenuAndClick(user, "Notebook Management");
    await screen.findByDisplayValue("Inbox");
    await user.type(screen.getByLabelText("Add a Section"), "Behavioral");
    await user.click(screen.getByRole("button", { name: "Add Section" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Another tab changed this Notebook"
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      /Autosave is paused in this tab/i
    );
    expect(screen.queryByText("Notebook changes saved")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reload Stored Notebook" }));

    expect(await screen.findByDisplayValue("External prep")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Behavioral")).not.toBeInTheDocument();
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
    const user = userEvent.setup();
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

    await screen.findByTestId("notebook-page-canvas");
    await openMenuAndClick(user, "Notebook Management");
    await screen.findByDisplayValue("Inbox");
    await user.type(screen.getByLabelText("Add a Section"), "Behavioral");
    await user.click(screen.getByRole("button", { name: "Add Section" }));

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

    expect(await screen.findByDisplayValue("Behavioral")).toBeInTheDocument();
    expect(recoveryStore.saveNotebook).toHaveBeenCalledWith(importedNotebook);
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

    await screen.findByTestId("notebook-page-canvas");
    await openMenuAndClick(user, "Notebook Management");
    const inboxInput = await screen.findByDisplayValue("Inbox");
    const inboxRow = inboxInput.closest("li");

    if (inboxRow === null) {
      throw new Error("Expected Inbox Section row.");
    }

    await user.click(
      within(inboxRow).getByRole("button", { name: "New Blank Page" })
    );

    expect(
      await screen.findByRole("heading", { name: "Untitled Page" })
    ).toBeInTheDocument();
    expect(screen.getByTestId("notebook-page-canvas")).toBeInTheDocument();
    expect(window.location.pathname).toMatch(
      /^\/sections\/section_inbox\/pages\/page_/
    );
  });

  it("reopens the same Page from its URL after reload", async () => {
    const user = userEvent.setup();
    const firstRender = await renderApp();

    await screen.findByTestId("notebook-page-canvas");
    await openMenuAndClick(user, "Notebook Management");
    const inboxRow = (await screen.findByDisplayValue("Inbox")).closest("li");

    if (inboxRow === null) {
      throw new Error("Expected Inbox Section row.");
    }

    await user.click(
      within(inboxRow).getByRole("button", { name: "New Blank Page" })
    );
    await screen.findByRole("heading", { name: "Untitled Page" });
    const openedPagePath = window.location.pathname;

    firstRender.unmount();
    firstRender.store.close();
    window.history.replaceState({}, "", openedPagePath);
    await renderApp();

    expect(
      await screen.findByRole("heading", { name: "Untitled Page" })
    ).toBeInTheDocument();
    expect(screen.getByTestId("notebook-page-canvas")).toBeInTheDocument();
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
      "/sections/section_inbox/pages/page_missing"
    );
    await renderApp();

    expect(await screen.findByRole("alert")).toHaveTextContent("Page not found");
  });

  it("searches text Rough Work and opens a highlighted Canvas Region", async () => {
    const user = userEvent.setup();
    const starterNotebook = createStarterNotebook();
    const inbox = starterNotebook.sections[0];

    if (inbox === undefined) {
      throw new Error("Expected seeded Inbox Section.");
    }

    const notebookWithPage = addBlankPage(starterNotebook, inbox.id, "page_search_test");
    const notebookWithText = replacePageTextCanvasItems(
      notebookWithPage,
      "page_search_test",
      [
        {
          id: "canvas_item_trace",
          pageId: "page_search_test",
          type: "text",
          text: "Binary search invariant",
          tags: []
        }
      ],
      [
        {
          pageId: "page_search_test",
          canvasItemId: "canvas_item_trace",
          bounds: { x: 120, y: 80, width: 260, height: 64 }
        }
      ]
    );

    await renderApp(notebookWithText);
    await screen.findByRole("heading", { name: "Interview Prep Notebook" });
    await openMenuAndClick(user, "Notebook Management");
    await user.type(await screen.findByLabelText(/Search Canvas Items/), "invariant");

    const result = await screen.findByText(
      "Interview Prep Notebook / Inbox / Untitled Page"
    );

    expect(result).toBeInTheDocument();
    expect(screen.getByText(/Binary search invariant/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open Result" }));

    expect(window.location.pathname).toBe("/sections/section_inbox/pages/page_search_test");
    expect(
      await screen.findByLabelText("Highlighted Canvas Region")
    ).toBeInTheDocument();
  });

  it("tags text Rough Work and shows matched Tags in Search Results", async () => {
    const user = userEvent.setup();
    const starterNotebook = createStarterNotebook();
    const inbox = starterNotebook.sections[0];

    if (inbox === undefined) {
      throw new Error("Expected seeded Inbox Section.");
    }

    const notebookWithPage = addBlankPage(starterNotebook, inbox.id, "page_tag_test");
    const notebookWithText = replacePageTextCanvasItems(
      notebookWithPage,
      "page_tag_test",
      [
        {
          id: "canvas_item_trace",
          pageId: "page_tag_test",
          type: "text",
          text: "Binary search invariant",
          tags: []
        }
      ],
      [
        {
          pageId: "page_tag_test",
          canvasItemId: "canvas_item_trace",
          bounds: { x: 120, y: 80, width: 260, height: 64 }
        }
      ]
    );

    const { store } = await renderApp(notebookWithText);
    await screen.findByRole("heading", { name: "Interview Prep Notebook" });
    await openMenuAndClick(user, "Notebook Management");
    const untitledPageRow = (
      await screen.findByText("Untitled Page")
    ).closest("li");

    if (untitledPageRow === null) {
      throw new Error("Expected Untitled Page row.");
    }

    await user.click(within(untitledPageRow).getByRole("button", { name: "Open Page" }));
    await openMenuAndClick(user, "Canvas Items");
    await user.type(
      await screen.findByLabelText("Tags for Binary search invariant"),
      "arrays, invariant"
    );
    await openMenuAndClick(user, "Notebook Management");
    await user.type(screen.getByLabelText(/Search Canvas Items/), "arrays");

    expect(await screen.findByText("Matched Tags: #arrays")).toBeInTheDocument();
    await waitFor(async () => {
      const reloadedNotebook = await store.loadNotebook();
      expect(reloadedNotebook.canvasItems).toContainEqual({
        id: "canvas_item_trace",
        pageId: "page_tag_test",
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

    await screen.findByTestId("notebook-page-canvas");
    await openMenuAndClick(user, "Notebook Management");
    const inboxRow = (await screen.findByDisplayValue("Inbox")).closest("li");

    if (inboxRow === null) {
      throw new Error("Expected Inbox Section row.");
    }

    await user.click(
      within(inboxRow).getByRole("button", { name: "New Blank Page" })
    );
    await openMenuAndClick(user, "Canvas Items");
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

    await openMenuAndClick(user, "Notebook Management");
    await user.type(await screen.findByLabelText(/Search Canvas Items/), "cache");

    expect(await screen.findByText("Link Card")).toBeInTheDocument();
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

    await screen.findByTestId("notebook-page-canvas");
    await openMenuAndClick(user, "Canvas Items");
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

    await screen.findByTestId("notebook-page-canvas");
    await openMenuAndClick(user, "Notebook Management");
    const inboxRow = (await screen.findByDisplayValue("Inbox")).closest("li");

    if (inboxRow === null) {
      throw new Error("Expected Inbox Section row.");
    }

    await user.click(
      within(inboxRow).getByRole("button", { name: "New Blank Page" })
    );
    await openMenuAndClick(user, "Canvas Items");
    await user.type(
      await screen.findByLabelText("Code Block content"),
      "const complement = target - nums[i];"
    );
    await user.type(screen.getByLabelText("Code Block Tags"), "arrays, two sum");
    await user.click(screen.getByRole("button", { name: "Add Code Block" }));

    expect(await screen.findByDisplayValue(/const complement/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /run/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/judge/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/sandbox/i)).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText("Edit Code Block"));
    await user.type(
      screen.getByLabelText("Edit Code Block"),
      "return seen.get(complement);"
    );
    await openMenuAndClick(user, "Notebook Management");
    await user.type(await screen.findByLabelText(/Search Canvas Items/), "two sum");

    expect(await screen.findByText("Code Block")).toBeInTheDocument();
    expect(screen.getByText("Matched Tags: #two sum")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open Result" }));

    await openMenuAndClick(user, "Canvas Items");
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

    await screen.findByTestId("notebook-page-canvas");
    await openMenuAndClick(user, "Canvas Items");
    expect(
      await screen.findByDisplayValue("return seen.get(complement);")
    ).toBeInTheDocument();
  });

  it("adds Image Items with optional captions and Tags, persists them, and searches without AI summaries", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("Network is disabled by default."));
    const firstRender = await renderApp();

    await screen.findByTestId("notebook-page-canvas");
    await openMenuAndClick(user, "Notebook Management");
    const inboxRow = (
      await screen.findByDisplayValue("Inbox")
    ).closest("li");

    if (inboxRow === null) {
      throw new Error("Expected Inbox Section row.");
    }

    await user.click(
      within(inboxRow).getByRole("button", { name: "New Blank Page" })
    );
    await openMenuAndClick(user, "Canvas Items");
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

    await user.clear(screen.getByLabelText("Edit Image Item caption"));
    await user.type(
      screen.getByLabelText("Edit Image Item caption"),
      "Updated failover sketch"
    );
    await openMenuAndClick(user, "Notebook Management");
    await user.type(await screen.findByLabelText(/Search Canvas Items/), "availability");

    expect(await screen.findByText("Image Item")).toBeInTheDocument();
    expect(screen.getByText("Matched Tags: #availability")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open Result" }));

    await openMenuAndClick(user, "Canvas Items");
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

    await screen.findByTestId("notebook-page-canvas");
    await openMenuAndClick(user, "Canvas Items");
    expect(
      await screen.findByRole("img", { name: "Updated failover sketch" })
    ).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("creates, edits, reloads, searches, and highlights Diagram Items for system design", async () => {
    const user = userEvent.setup();
    const firstRender = await renderApp();

    await screen.findByTestId("notebook-page-canvas");
    await openMenuAndClick(user, "Notebook Management");
    const inboxRow = (
      await screen.findByDisplayValue("Inbox")
    ).closest("li");

    if (inboxRow === null) {
      throw new Error("Expected Inbox Section row.");
    }

    await user.click(
      within(inboxRow).getByRole("button", { name: "New Blank Page" })
    );
    await openMenuAndClick(user, "Canvas Items");
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
      await screen.findByDisplayValue("API Gateway publishes to queue")
    ).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Diagram Item kind"), "sticky-note");
    await user.clear(screen.getByLabelText("Edit Diagram Item label"));
    await user.type(
      screen.getByLabelText("Edit Diagram Item label"),
      "Queue absorbs write spikes"
    );
    await openMenuAndClick(user, "Notebook Management");
    await user.type(await screen.findByLabelText(/Search Canvas Items/), "backpressure");

    expect(await screen.findByText("Diagram Item")).toBeInTheDocument();
    expect(screen.getByText("Matched Tags: #backpressure")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open Result" }));

    await openMenuAndClick(user, "Canvas Items");
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

    await screen.findByTestId("notebook-page-canvas");
    await openMenuAndClick(user, "Canvas Items");
    expect(
      await screen.findByDisplayValue("Queue absorbs write spikes")
    ).toBeInTheDocument();
  });

  it("shows Freehand Drawing controls without OCR or searchable handwriting claims", async () => {
    const user = userEvent.setup();
    const starterNotebook = createStarterNotebook();
    const inbox = starterNotebook.sections[0];

    if (inbox === undefined) {
      throw new Error("Expected seeded Inbox Section.");
    }

    const notebookWithDrawing = replacePageCanvasItems(
      addBlankPage(starterNotebook, inbox.id, "page_drawing_test"),
      "page_drawing_test",
      [],
      [
        {
          id: "canvas_item_sketch",
          pageId: "page_drawing_test",
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
          pageId: "page_drawing_test",
          canvasItemId: "canvas_item_sketch",
          bounds: { x: 24, y: 36, width: 180, height: 90 }
        }
      ]
    );

    await renderApp(notebookWithDrawing);
    await screen.findByRole("heading", { name: "Interview Prep Notebook" });
    await openMenuAndClick(user, "Notebook Management");
    const untitledPageRow = (await screen.findByText("Untitled Page")).closest("li");

    if (untitledPageRow === null) {
      throw new Error("Expected Untitled Page row.");
    }

    await user.click(within(untitledPageRow).getByRole("button", { name: "Open Page" }));

    await screen.findByTestId("notebook-page-canvas");

    await openMenuAndClick(user, "Notebook Management");
    await user.type(screen.getByLabelText(/Search Canvas Items/), "encoded-handwriting-stroke");

    expect(await screen.findByText("No Search Results found in this Notebook.")).toBeInTheDocument();
    expect(screen.queryByText("Freehand Drawing")).not.toBeInTheDocument();
  });

  it("searches seeded Code Blocks and opens their highlighted Canvas Region", async () => {
    const user = userEvent.setup();
    const starterNotebook = createStarterNotebook();
    const inbox = starterNotebook.sections[0];

    if (inbox === undefined) {
      throw new Error("Expected seeded Inbox Section.");
    }

    const notebookWithCodeBlock = addCodeBlockCanvasItem(
      addBlankPage(starterNotebook, inbox.id, "page_code_test"),
      "page_code_test",
      "canvas_item_code_block",
      "function bfs(queue) { return queue.shift(); }",
      ["graphs"]
    );

    await renderApp(notebookWithCodeBlock);
    await screen.findByRole("heading", { name: "Interview Prep Notebook" });
    await openMenuAndClick(user, "Notebook Management");
    await user.type(await screen.findByLabelText(/Search Canvas Items/), "bfs");
    await user.click(await screen.findByRole("button", { name: "Open Result" }));

    await openMenuAndClick(user, "Canvas Items");
    expect(
      await screen.findByLabelText("Highlighted Code Block Canvas Region")
    ).toBeInTheDocument();
  });

  it("searches seeded Image Items and opens their highlighted Canvas Region", async () => {
    const user = userEvent.setup();
    const starterNotebook = createStarterNotebook();
    const inbox = starterNotebook.sections[0];

    if (inbox === undefined) {
      throw new Error("Expected seeded Inbox Section.");
    }

    const notebookWithImage = addImageCanvasItem(
      addBlankPage(starterNotebook, inbox.id, "page_image_test"),
      "page_image_test",
      "canvas_item_image",
      "data:image/png;base64,ZGlhZ3JhbQ==",
      "image/png",
      "Queue backpressure diagram",
      ["queues"]
    );

    await renderApp(notebookWithImage);
    await screen.findByRole("heading", { name: "Interview Prep Notebook" });
    await openMenuAndClick(user, "Notebook Management");
    await user.type(await screen.findByLabelText(/Search Canvas Items/), "backpressure");
    await user.click(await screen.findByRole("button", { name: "Open Result" }));

    await openMenuAndClick(user, "Canvas Items");
    expect(
      await screen.findByLabelText("Highlighted Image Item Canvas Region")
    ).toBeInTheDocument();
  });

  it("exports and imports a Notebook backup while rebuilding Search Results", async () => {
    const user = userEvent.setup();
    const starterNotebook = createStarterNotebook();

    const notebookWithPage = addBlankPage(
      starterNotebook,
      STARTER_INBOX_SECTION_ID,
      "page_export_test"
    );
    const notebookWithText = replacePageTextCanvasItems(
      notebookWithPage,
      "page_export_test",
      [
        {
          id: "canvas_item_note",
          pageId: "page_export_test",
          type: "text",
          text: "Consistent hashing notes",
          tags: ["distributed systems"]
        }
      ],
      [
        {
          pageId: "page_export_test",
          canvasItemId: "canvas_item_note",
          bounds: { x: 12, y: 24, width: 240, height: 80 }
        }
      ]
    );
    const notebookWithLink = addLinkCardCanvasItem(
      notebookWithText,
      "page_export_test",
      "canvas_item_link",
      "https://example.com/cache",
      "Cache reference",
      ["reading"]
    );
    const notebookWithCode = addCodeBlockCanvasItem(
      notebookWithLink,
      "page_export_test",
      "canvas_item_code",
      "function shard(key) { return hash(key) % nodes.length; }",
      ["sharding"]
    );
    const notebookWithImage = addImageCanvasItem(
      notebookWithCode,
      "page_export_test",
      "canvas_item_image",
      "data:image/png;base64,Y2FjaGU=",
      "image/png",
      "Cache topology",
      ["topology"]
    );
    const importedNotebook = addDiagramCanvasItem(
      notebookWithImage,
      "page_export_test",
      "canvas_item_diagram",
      "sticky-note",
      "Eviction policy reminder",
      ["eviction"]
    );

    await renderApp();
    await screen.findByRole("heading", { name: "Interview Prep Notebook" });
    await openMenuAndClick(user, "Notebook Management");
    await user.click(await screen.findByRole("button", { name: "Export Notebook Backup" }));

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
    await user.type(await screen.findByLabelText(/Search Canvas Items/), "eviction");

    expect(await screen.findByText("Diagram Item")).toBeInTheDocument();
    expect(screen.getByText("Matched Tags: #eviction")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open Result" }));

    await openMenuAndClick(user, "Canvas Items");
    expect(
      await screen.findByLabelText("Highlighted Diagram Item Canvas Region")
    ).toBeInTheDocument();
  });

  it("opens the last opened Page when a returning user navigates to root", async () => {
    const firstRender = await renderApp();
    const user = userEvent.setup();

    await screen.findByTestId("notebook-page-canvas");
    await openMenuAndClick(user, "Notebook Management");
    const inboxRow = (await screen.findByDisplayValue("Inbox")).closest("li");

    if (inboxRow === null) {
      throw new Error("Expected Inbox Section row.");
    }

    await user.click(within(inboxRow).getByRole("button", { name: "New Blank Page" }));
    await screen.findByRole("heading", { name: "Untitled Page" });
    const lastOpenedPath = window.location.pathname;

    firstRender.unmount();
    firstRender.store.close();
    window.history.replaceState({}, "", "/");
    await renderApp();

    await screen.findByRole("heading", { name: "Untitled Page" });
    expect(window.location.pathname).toBe(lastOpenedPath);
  });

  it("opens search overlay from Drawing Screen, finds seeded Code Block, and highlights Canvas Region", async () => {
    const user = userEvent.setup();
    const starterNotebook = createStarterNotebook();
    const inbox = starterNotebook.sections[0];

    if (inbox === undefined) {
      throw new Error("Expected seeded Inbox Section.");
    }

    const notebookWithCodeBlock = addCodeBlockCanvasItem(
      addBlankPage(starterNotebook, inbox.id, "page_search_overlay_test"),
      "page_search_overlay_test",
      "canvas_item_search_code",
      "function dfs(graph, start) { return graph[start]; }",
      ["graphs", "dfs"]
    );

    await renderApp(notebookWithCodeBlock);
    await screen.findByTestId("notebook-page-canvas");

    await openMenuAndClick(user, "Search Notebook");

    const searchDialog = await screen.findByRole("dialog", { name: "Search Notebook" });
    expect(searchDialog).toBeInTheDocument();

    const searchInput = within(searchDialog).getByRole("textbox", { name: "Search Notebook" });
    await user.type(searchInput, "dfs");

    expect(await within(searchDialog).findByText("Code Block")).toBeInTheDocument();
    expect(within(searchDialog).getByText("#dfs")).toBeInTheDocument();
    expect(within(searchDialog).getByText("Inbox")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Open Result" }));

    expect(screen.queryByRole("textbox", { name: "Search Notebook" })).not.toBeInTheDocument();
    await openMenuAndClick(user, "Canvas Items");
    expect(
      await screen.findByLabelText("Highlighted Code Block Canvas Region")
    ).toBeInTheDocument();
  });

  it("does not show the Assistant Bubble when AI is disabled by default", async () => {
    await renderApp();

    await screen.findByTestId("notebook-page-canvas");

    expect(screen.queryByRole("button", { name: "Open Notebook Assistant" })).not.toBeInTheDocument();
    expect(localStorage.getItem("notebook_ai_enabled")).toBeNull();
  });

  it("shows the Assistant Bubble after enabling AI in Settings and persists the preference", async () => {
    await renderApp();
    const user = userEvent.setup();

    await screen.findByTestId("notebook-page-canvas");
    await openMenuAndClick(user, "Settings");

    const settingsDialog = await screen.findByRole("dialog", { name: "Settings" });
    const aiToggle = within(settingsDialog).getByRole("checkbox", { name: /enable ai features/i });

    expect(aiToggle).not.toBeChecked();
    await user.click(aiToggle);
    expect(aiToggle).toBeChecked();

    expect(screen.getByRole("button", { name: "Open Notebook Assistant" })).toBeInTheDocument();
    expect(localStorage.getItem("notebook_ai_enabled")).toBe("true");
  });

  it("hides the Assistant Bubble after disabling AI in Settings", async () => {
    localStorage.setItem("notebook_ai_enabled", "true");
    await renderApp();
    const user = userEvent.setup();

    await screen.findByTestId("notebook-page-canvas");
    expect(screen.getByRole("button", { name: "Open Notebook Assistant" })).toBeInTheDocument();

    await openMenuAndClick(user, "Settings");

    const settingsDialog = await screen.findByRole("dialog", { name: "Settings" });
    const aiToggle = within(settingsDialog).getByRole("checkbox", { name: /enable ai features/i });

    expect(aiToggle).toBeChecked();
    await user.click(aiToggle);
    expect(aiToggle).not.toBeChecked();

    expect(screen.queryByRole("button", { name: "Open Notebook Assistant" })).not.toBeInTheDocument();
    expect(localStorage.getItem("notebook_ai_enabled")).toBe("false");
  });

});
