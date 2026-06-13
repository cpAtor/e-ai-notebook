import { expect, test } from "@playwright/test";

test("browser can load local Interview Prep Notebook install metadata without external requests", async ({
  page
}) => {
  const externalRequests: string[] = [];

  page.on("request", (request) => {
    const url = new URL(request.url());

    if (
      url.origin !== "http://127.0.0.1:5173" &&
      !request.url().startsWith("data:")
    ) {
      externalRequests.push(request.url());
    }
  });

  await page.goto("/");

  const manifestPath = await page
    .locator('link[rel="manifest"]')
    .getAttribute("href");

  expect(manifestPath).toBe("/manifest.webmanifest");
  if (manifestPath === null) {
    throw new Error("Expected the app shell to link to a web manifest.");
  }

  const manifestResponse = await page.request.get(manifestPath);
  expect(manifestResponse.ok()).toBe(true);

  const manifest = (await manifestResponse.json()) as {
    name?: string;
    short_name?: string;
    description?: string;
    display?: string;
    start_url?: string;
    icons?: Array<{ src?: string; type?: string; purpose?: string }>;
  };

  expect(manifest).toMatchObject({
    name: "Interview Prep Notebook",
    short_name: "Prep Notebook",
    description:
      "Private Interview Prep Notebook for capturing and revisiting rough work.",
    display: "standalone",
    start_url: "/"
  });
  expect(manifest.icons).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        src: "/icons/notebook-icon.svg",
        type: "image/svg+xml",
        purpose: "any maskable"
      })
    ])
  );

  const iconResponse = await page.request.get("/icons/notebook-icon.svg");
  expect(iconResponse.ok()).toBe(true);
  expect(iconResponse.headers()["content-type"]).toContain("image/svg+xml");
  expect(externalRequests).toEqual([]);
});
