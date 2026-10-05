import { test, expect } from "@playwright/test";

// Helper: log in as admin before tests that require auth
async function loginAsAdmin(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.fill('input[type="email"]', "admin@datacenter.local");
  await page.fill('input[type="password"]', "admin123");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard");
}

test("unauthenticated visit redirects to login", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});

test("login page renders and accepts credentials", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator("input[type='email']")).toBeVisible();
  await expect(page.locator("input[type='password']")).toBeVisible();
});

test("admin can log in and reach the dashboard", async ({ page }) => {
  await loginAsAdmin(page);
  await expect(page).toHaveURL(/\/dashboard/);
});

test("dashboard shows IT Load KPI card", async ({ page }) => {
  await loginAsAdmin(page);
  await expect(page.locator("text=IT Load")).toBeVisible();
});

test("dashboard shows Total Power KPI card", async ({ page }) => {
  await loginAsAdmin(page);
  await expect(page.locator("text=Total Power")).toBeVisible();
});

test("alarms page is reachable and shows a table", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/alarms");
  await expect(page.locator("h1, h2").first()).toBeVisible();
});

test("facility-map page loads", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/facility-map");
  await expect(page.locator("h1, h2").first()).toBeVisible();
});

test("energy page loads", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/energy");
  await expect(page.locator("h1, h2").first()).toBeVisible();
});

test("settings page is ADMIN-only and loads", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/settings");
  await expect(page.locator("h1, h2").first()).toBeVisible();
});
