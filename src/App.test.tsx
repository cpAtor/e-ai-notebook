import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import {
  addBlankPage,
  createStarterNotebook,
  replacePageTextCanvasItems,
  type Notebook
} from "./domain/notebook";
import {
  createNotebookStore,
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

  it("shows a private Interview Prep Notebook with seeded Sections", async () => {
    await renderApp();

    expect(
      await screen.findByRole("heading", { name: "Interview Prep Notebook" })
    ).toBeInTheDocument();
    expect(screen.getByText("Private Notebook")).toBeInTheDocument();
    expect(screen.getByDisplayValue("DSA")).toBeInTheDocument();
    expect(screen.getByDisplayValue("System Design")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Research")).toBeInTheDocument();
  });

  it("renames, adds, and removes Sections", async () => {
    const user = userEvent.setup();
    await renderApp();

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
      close: vi.fn()
    };

    const view = render(<App store={failingStore} />);

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

    expect(await screen.findByDisplayValue("Behavioral")).toBeInTheDocument();
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
    await user.type(screen.getByLabelText(/Search text Canvas Items/), "invariant");

    const result = await screen.findByText(
      "Interview Prep Notebook / DSA / Untitled Page"
    );

    expect(result).toBeInTheDocument();
    expect(screen.getByText(/Binary search invariant/)).toBeInTheDocument();
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
    await user.click(screen.getByRole("button", { name: "Open Page" }));
    await user.type(
      await screen.findByLabelText("Tags for Binary search invariant"),
      "arrays, invariant"
    );
    await user.click(screen.getByRole("button", { name: "Back to Notebook" }));
    await user.type(screen.getByLabelText(/Search text Canvas Items/), "arrays");

    expect(await screen.findByText("Matched Tags: #arrays")).toBeInTheDocument();
    await waitFor(async () => {
      const reloadedNotebook = await store.loadNotebook();
      expect(reloadedNotebook.canvasItems[0]?.tags).toEqual([
        "arrays",
        "invariant"
      ]);
    });
  });
});
