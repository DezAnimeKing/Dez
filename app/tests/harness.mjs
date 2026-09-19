import { chromium } from "playwright";

// Shared browser boot for the three suites. Set CHROME_PATH to use a browser
// Playwright did not download itself; BASE to point at a running server.
export const BASE = process.env.BASE || "http://127.0.0.1:8899";
export const SHOT_DIR = process.env.SHOT_DIR || null;

export async function launch() {
  const executablePath = process.env.CHROME_PATH;
  return chromium.launch(executablePath ? { executablePath } : {});
}

/** Records every console error and uncaught exception, and returns the page. */
export function watch(page, errors, prefix = "") {
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`${prefix}console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`${prefix}pageerror: ${error.message}`));
  return page;
}

export function reporter(errors) {
  return async function step(name, fn) {
    const before = errors.length;
    try {
      await fn();
    } catch (error) {
      errors.push(`step "${name}": ${error.message.split("\n")[0]}`);
    }
    console.log(`${errors.length > before ? "FAIL" : "ok  "}  ${name}`);
  };
}

export function finish(errors) {
  console.log(errors.length ? `\n${errors.length} problem(s):\n${errors.join("\n")}` : "\nall clean");
  if (errors.length) process.exit(1);
}
