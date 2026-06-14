import { expect, test, type Page } from "@playwright/test";

test("mobile touch users can create Excalidraw text and freehand work, reload it, and stay offline", async ({
  page
}) => {
  const runtimeRequests: string[] = [];
  const consoleErrors: string[] = [];

  await page.route("http://127.0.0.1:5173/**", (route) => route.continue());
  page.on("request", (request) => {
    const url = new URL(request.url());

    if (
      url.origin !== "http://127.0.0.1:5173" &&
      !request.url().startsWith("data:")
    ) {
      runtimeRequests.push(request.url());
    }
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Default Page" })).toBeVisible();
  await expect(page.getByTestId("notebook-page-canvas")).toBeVisible();
  await expect(page.getByRole("radio", { name: "Text" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Draw" })).toBeVisible();
  await expect(page.getByTestId("main-menu-trigger")).toBeVisible();

  await page.getByRole("radio", { name: "Text" }).check({ force: true });
  await page.mouse.click(190, 240);
  await page.keyboard.type("MobileExcalidrawTrace");
  await page.keyboard.press("Escape");

  await page.getByRole("radio", { name: "Draw" }).check({ force: true });
  await page.mouse.move(110, 330);
  await page.mouse.down();
  await page.mouse.move(140, 360, { steps: 5 });
  await page.mouse.move(180, 345, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.press("Escape");

  await expect
    .poll(async () => notebookSummary(page))
    .toMatchObject({
      freehandCount: 1,
      text: "MobileExcalidrawTrace"
    });

  await page.getByTestId("main-menu-trigger").tap();
  await expect(page.getByText("Find on canvas")).toBeVisible();
  await expect(page.getByText("Search Notebook")).toBeVisible();
  await expect(page.getByText("Settings")).toBeVisible();

  await page.getByText("Light", { exact: true }).tap();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("radio", { name: "Draw" }).check({ force: true });
  await page.mouse.move(90, 390);
  await page.mouse.down();
  await page.mouse.move(125, 410, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.press("Escape");
  await expect
    .poll(async () => notebookSummary(page))
    .toMatchObject({
      freehandCount: 2,
      strokeColors: expect.arrayContaining(["#172033", "#f5f7ff"])
    });

  await page.getByTestId("main-menu-trigger").tap();
  await page.getByText("Dark", { exact: true }).tap();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.getByTestId("main-menu-trigger").tap();
  await page.getByText("Open Drawer").tap();
  const drawer = page.locator('aside[aria-label="Notebook Drawer"]');
  await expect(drawer).toBeVisible();
  await expect(drawer).toHaveAttribute("aria-hidden", "false");
  const drawerBox = await drawer.boundingBox();
  expect(drawerBox?.width).toBeLessThan(page.viewportSize()?.width ?? 394);
  await page.getByRole("button", { name: "Close Notebook Drawer" }).tap();
  await expect(drawer).toHaveAttribute("aria-hidden", "true");
  await expect(page.getByRole("radio", { name: "Text" })).toBeVisible();

  await page.reload();

  await expect(page).toHaveURL(/\/sections\/section_inbox\/pages\/page_default$/);
  await expect(page.getByTestId("notebook-page-canvas")).toBeVisible();
  await expect
    .poll(async () => notebookSummary(page))
    .toMatchObject({
      freehandCount: 2,
      text: "MobileExcalidrawTrace"
    });
  await expect(page.getByRole("radio", { name: "Text" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Draw" })).toBeVisible();

  expect(runtimeRequests).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

const notebookSummary = async (page: Page) =>
  page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("interview_prep_notebook");
      request.addEventListener("success", () => resolve(request.result));
      request.addEventListener("error", () => reject(request.error));
    });

    const record = await new Promise<{
      notebook: {
        canvasItems: Array<{
          text?: string;
          type: string;
          shape?: { props?: { strokeColor?: string } };
        }>;
      };
    }>((resolve, reject) => {
      const transaction = database.transaction("notebooks", "readonly");
      const request = transaction
        .objectStore("notebooks")
        .get("notebook_private_interview_prep");

      request.addEventListener("success", () => resolve(request.result));
      request.addEventListener("error", () => reject(request.error));
    });

    database.close();

    const textItem = record.notebook.canvasItems.find(
      (canvasItem) => canvasItem.type === "text"
    );
    return {
      freehandCount: record.notebook.canvasItems.filter(
        (canvasItem) => canvasItem.type === "freehand-drawing"
      ).length,
      strokeColors: record.notebook.canvasItems
        .filter((canvasItem) => canvasItem.type === "freehand-drawing")
        .map((canvasItem) => canvasItem.shape?.props?.strokeColor),
      text: textItem?.text ?? null
    };
  });
