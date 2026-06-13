import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
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

  const renderApp = () => {
    const store = createNotebookStore(databaseName);
    stores.push(store);
    const view = render(<App store={store} />);

    return {
      ...view,
      store
    };
  };

  it("shows a private Interview Prep Notebook with seeded Sections", async () => {
    renderApp();

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
    renderApp();

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

  it("makes no default runtime fetch calls", () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("Network is disabled by default."));

    renderApp();

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("creates a blank Page in a Section and opens a URL-addressable route", async () => {
    const user = userEvent.setup();
    renderApp();

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
    expect(window.location.pathname).toMatch(
      /^\/sections\/section_dsa\/pages\/page_/
    );
  });

  it("reopens the same Page from its URL after reload", async () => {
    const user = userEvent.setup();
    const firstRender = renderApp();

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
    renderApp();

    expect(
      await screen.findByRole("heading", { name: "Untitled Page" })
    ).toBeInTheDocument();
    expect(screen.getByText("DSA")).toBeInTheDocument();
  });

  it("shows invalid Section and Page URL states without resetting the Notebook", async () => {
    window.history.replaceState(
      {},
      "",
      "/sections/section_missing/pages/page_missing"
    );
    const firstRender = renderApp();

    expect(await screen.findByRole("alert")).toHaveTextContent("Section not found");
    firstRender.unmount();
    firstRender.store.close();

    window.history.replaceState(
      {},
      "",
      "/sections/section_dsa/pages/page_missing"
    );
    renderApp();

    expect(await screen.findByRole("alert")).toHaveTextContent("Page not found");
  });
});
