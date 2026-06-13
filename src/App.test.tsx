import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import {
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
    expect(
      screen.getByLabelText("Local browser storage and backup guidance")
    ).toHaveTextContent(
      /Stored in local browser storage by default\.\s*Your Notebook stays in this browser unless you export it or configure a connected feature\. Browser storage is not server-grade encrypted storage, so use Notebook Export for backups rather than expecting cloud sync\./
    );
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
    await user.type(screen.getByLabelText(/Search Canvas Items/), "invariant");

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
    await user.type(screen.getByLabelText(/Search Canvas Items/), "arrays");

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
    await user.type(screen.getByLabelText(/Search Canvas Items/), "cache");

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

    expect(await screen.findByDisplayValue(/const complement/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /run/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/judge/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/sandbox/i)).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText("Edit Code Block"));
    await user.type(
      screen.getByLabelText("Edit Code Block"),
      "return seen.get(complement);"
    );
    await user.click(screen.getByRole("button", { name: "Back to Notebook" }));
    await user.type(screen.getByLabelText(/Search Canvas Items/), "two sum");

    expect(await screen.findByText("Code Block")).toBeInTheDocument();
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
      await screen.findByDisplayValue("return seen.get(complement);")
    ).toBeInTheDocument();
  });

  it("adds Image Items with optional captions and Tags, persists them, and searches without AI summaries", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("Network is disabled by default."));
    const firstRender = await renderApp();

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

    await user.clear(screen.getByLabelText("Edit Image Item caption"));
    await user.type(
      screen.getByLabelText("Edit Image Item caption"),
      "Updated failover sketch"
    );
    await user.click(screen.getByRole("button", { name: "Back to Notebook" }));
    await user.type(screen.getByLabelText(/Search Canvas Items/), "availability");

    expect(await screen.findByText("Image Item")).toBeInTheDocument();
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
      await screen.findByDisplayValue("API Gateway publishes to queue")
    ).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Diagram Item kind"), "sticky-note");
    await user.clear(screen.getByLabelText("Edit Diagram Item label"));
    await user.type(
      screen.getByLabelText("Edit Diagram Item label"),
      "Queue absorbs write spikes"
    );
    await user.click(screen.getByRole("button", { name: "Back to Notebook" }));
    await user.type(screen.getByLabelText(/Search Canvas Items/), "backpressure");

    expect(await screen.findByText("Diagram Item")).toBeInTheDocument();
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
      await screen.findByDisplayValue("Queue absorbs write spikes")
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
    await user.click(screen.getByRole("button", { name: "Open Page" }));

    expect(await screen.findByRole("button", { name: "Use Draw Tool" })).toBeInTheDocument();
    expect(screen.getByText(/not OCR or searchable handwriting/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back to Notebook" }));
    await user.type(screen.getByLabelText(/Search Canvas Items/), "encoded-handwriting-stroke");

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
    await user.type(screen.getByLabelText(/Search Canvas Items/), "bfs");
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
    await user.type(screen.getByLabelText(/Search Canvas Items/), "backpressure");
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
    await user.type(screen.getByLabelText(/Search Canvas Items/), "eviction");

    expect(await screen.findByText("Diagram Item")).toBeInTheDocument();
    expect(screen.getByText("Matched Tags: #eviction")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open Result" }));

    expect(
      await screen.findByLabelText("Highlighted Diagram Item Canvas Region")
    ).toBeInTheDocument();
  });
});
