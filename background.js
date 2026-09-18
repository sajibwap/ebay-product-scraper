// background.js — Service worker for eBay Product Scraper

// Create context menu for WebP → JPG conversion
chrome.contextMenus.create({
  id: "imgconvert",
  title: "Convert WebP to JPG",
  contexts: ["image"],
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "imgconvert") {
    const imgURL = info.srcUrl;
    const conURL = `https://ezgif.com/webp-to-jpg?url=${encodeURIComponent(imgURL)}`;
    chrome.tabs.create({ url: conURL });
  }
});
