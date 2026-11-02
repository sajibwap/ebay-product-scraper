// save-jpg.js — Converts an image to JPG and saves it where the user chooses

const JPG_QUALITY = 0.92;
// Chrome remembers the last folder used with this picker id, across sessions
const PICKER_ID = "ebay-scraper-jpg";

const srcUrl = new URLSearchParams(location.search).get("src");
let jpgBlob = null;

function setStatus(text, type = "") {
  const el = document.getElementById("status");
  el.textContent = text;
  el.className = `status ${type}`;
}

// Suggested filename: the image's own name with a .jpg extension
function jpgFilename(url) {
  let name = "";
  try {
    name = decodeURIComponent(new URL(url).pathname.split("/").pop() || "");
  } catch (e) { /* data: or malformed URL — use the default */ }
  name = name.replace(/\.[^.]*$/, "").replace(/[\\/:*?"<>|]/g, "_").trim();
  return `${name || "image"}.jpg`;
}

async function convertToJpg(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Image request failed (${res.status})`);
  const bitmap = await createImageBitmap(await res.blob());

  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d");
  // JPG has no transparency, so transparent areas would otherwise turn black
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  return canvas.convertToBlob({ type: "image/jpeg", quality: JPG_QUALITY });
}

async function saveJpg() {
  const filename = jpgFilename(srcUrl);

  // Browsers without the File System Access API (e.g. Brave by default):
  // fall back to the regular download Save As dialog, which starts in Downloads.
  if (!window.showSaveFilePicker) {
    const url = URL.createObjectURL(jpgBlob);
    await chrome.downloads.download({ url, filename, saveAs: true });
    // Not closed automatically: closing would revoke the blob URL mid-download
    setStatus("Download started — you can close this window", "success");
    return;
  }

  let handle;
  try {
    handle = await window.showSaveFilePicker({
      id: PICKER_ID,
      suggestedName: filename,
      types: [{ description: "JPEG image", accept: { "image/jpeg": [".jpg", ".jpeg"] } }],
    });
  } catch (error) {
    if (error.name === "AbortError") return; // dialog cancelled — keep the window open
    throw error;
  }

  const writable = await handle.createWritable();
  await writable.write(jpgBlob);
  await writable.close();
  window.close();
}

document.getElementById("btn-save").addEventListener("click", () => {
  saveJpg().catch(error => setStatus(`Could not save: ${error.message}`, "error"));
});

async function init() {
  if (!srcUrl) {
    setStatus("No image to convert", "error");
    return;
  }

  try {
    jpgBlob = await convertToJpg(srcUrl);
  } catch (error) {
    setStatus(`Could not convert image: ${error.message}`, "error");
    return;
  }

  const preview = document.getElementById("preview");
  preview.onload = () => {
    document.getElementById("dimensions").textContent = `${preview.naturalWidth} × ${preview.naturalHeight}`;
  };
  preview.src = URL.createObjectURL(jpgBlob);

  setStatus(`Ready · ${Math.round(jpgBlob.size / 1024)} KB`, "success");
  const btn = document.getElementById("btn-save");
  btn.disabled = false;
  btn.focus();
}

init();
