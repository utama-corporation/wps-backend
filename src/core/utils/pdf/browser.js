const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

let browser = null;
let cachedPath = null;

// Lokasi Chrome/Edge/Chromium yang umum dipakai, per platform.
const SYSTEM_PATHS = {
  win32: [
    "Google\\Chrome\\Application\\chrome.exe",
    "Google\\Chrome Beta\\Application\\chrome.exe",
    "Microsoft\\Edge\\Application\\msedge.exe",
    "Chromium\\Application\\chrome.exe",
  ],
  darwin: [
    "Google Chrome.app/Contents/MacOS/Google Chrome",
    "Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "Chromium.app/Contents/MacOS/Chromium",
  ],
  linux: [
    "google-chrome-stable",
    "google-chrome",
    "chromium-browser",
    "chromium",
    "microsoft-edge",
  ],
};

function systemCandidates() {
  let bases;
  if (process.platform === "win32") {
    bases = [process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"], process.env.LOCALAPPDATA];
  } else if (process.platform === "darwin") {
    bases = ["/Applications", path.join(process.env.HOME || "", "Applications")];
  } else {
    bases = ["/usr/bin", "/usr/local/bin", "/snap/bin"];
  }

  return bases
    .filter(Boolean)
    .flatMap((base) =>
      (SYSTEM_PATHS[process.platform] || []).map((rel) => path.join(base, rel)),
    );
}

/**
 * Cari executable Chrome yang akan dipakai Puppeteer.
 *
 * Urutannya:
 *   1. PUPPETEER_EXECUTABLE_PATH - untuk container/CI yang menunjuk Chrome sendiri.
 *   2. Chrome bawaan Puppeteer (hasil `npx puppeteer browsers install chrome`).
 *   3. Chrome/Edge/Chromium yang terinstall di mesin ini.
 *
 * Puppeteer hanya melempar error saat benar-benar me-launch, jadi langkah 2
 * dicek manual dengan fs.existsSync - executablePath() selalu mengembalikan
 * path walau filenya belum ada.
 */
function resolveExecutablePath() {
  if (cachedPath) return cachedPath;

  const fromEnv = String(process.env.PUPPETEER_EXECUTABLE_PATH || "").trim();
  if (fromEnv) {
    cachedPath = fromEnv;
    return cachedPath;
  }

  try {
    const bundled = puppeteer.executablePath();
    if (bundled && fs.existsSync(bundled)) {
      cachedPath = bundled;
      return cachedPath;
    }
  } catch (err) {
    // Diabaikan, dilanjut ke pencarian di sistem.
  }

  const found = systemCandidates().find((p) => fs.existsSync(p));
  if (found) {
    console.log(`[pdf] Chrome bawaan Puppeteer tidak ada, memakai: ${found}`);
    cachedPath = found;
    return cachedPath;
  }

  const err = new Error(
    "Chrome tidak ditemukan. Jalankan `npx puppeteer browsers install chrome`, " +
      "atau set PUPPETEER_EXECUTABLE_PATH ke path Chrome/Chromium yang tersedia.",
  );
  err.status = 500;
  throw err;
}

async function getBrowser() {
  if (!browser || !browser.isConnected()) {
    browser = await puppeteer.launch({
      executablePath: resolveExecutablePath(),
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  }
  return browser;
}

async function closeBrowser() {
  if (browser) {
    await browser.close();
    browser = null;
  }
}

module.exports = { getBrowser, closeBrowser, resolveExecutablePath };