import { expect, test } from "@playwright/test";

test("mobile touch users can create a Page, edit tldraw text, reload it, and stay offline", async ({
  page
}) => {
  const runtimeRequests: string[] = [];

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

  await page.goto("/");

  const dsaSection = page
    .locator("li")
    .filter({ has: page.getByRole("textbox", { name: "Rename DSA" }) });
  await dsaSection.getByRole("button", { name: "New Blank Page" }).tap();

  await expect(page.getByRole("heading", { name: "Untitled Page" })).toBeVisible();
  await expect(page.getByTestId("tldraw-page-canvas")).toBeVisible();

  const canvas = page.getByTestId("tldraw-page-canvas");
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();

  if (box === null) {
    throw new Error("Expected tldraw canvas to have visible bounds.");
  }

  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.type("MobileBinarySearchTrace");
  await page.keyboard.press("Escape");

  await expect(page.getByText("Tags for MobileBinarySearchTrace")).toBeVisible({
    timeout: 10_000
  });

  const pagePath = new URL(page.url()).pathname;
  await page.reload();

  await expect(page).toHaveURL(new RegExp(`${pagePath.replaceAll("/", "\\/")}$`));
  await expect(page.getByText("Tags for MobileBinarySearchTrace")).toBeVisible();
  await expect(runtimeRequests).toEqual([]);
});
