// content.js — Scrapes eBay product data and responds to popup messages

function safeText(selector, context = document) {
  const el = context.querySelector(selector);
  return el ? el.innerText.trim() : null;
}

function scrapeProduct() {
  const product = {};

  // Title
  product.title = safeText("h1.x-item-title__mainTitle span");

  // Breadcrumbs
  const bcEl = document.querySelector('.breadcrumbs.breadcrumb--overflow ul');
  if (bcEl) {
    product.breadcrumbs = bcEl.innerText.trim().replaceAll('\n', ' > ');
  }

  // Price
  product.price = safeText(".x-price-primary span.ux-textspans") ||
                  safeText("[itemprop='price']") ||
                  safeText(".x-bin-price__content .x-price-primary");

  // Seller
  product.seller = safeText(".x-sellercard-atf__info__about-seller a span");

  // Condition
  product.condition = safeText(".x-item-condition-text .ux-textspans");

  // Item specifics
  document.querySelectorAll(".ux-layout-section-evo__col .ux-labels-values").forEach((e) => {
    if (!e.children[0]) return;
    const label = e.children[0].querySelector('.ux-labels-values__labels .ux-textspans');
    const value = e.children[1]?.textContent?.trim();
    if (!label || !value) return;

    const labelText = label.innerText.trim();
    const fieldMap = {
      "Manufacturer Part Number": "mpn",
      "UPC": "upc",
      "Type": "type",
      "Coil Type": "coiltype",
      "Items Included": "inc",
      "Features": "feature",
      "Brand": "brand",
      "Model": "model",
      "Country/Region of Manufacture": "country",
      "Material": "material",
      "Color": "color",
    };
    if (fieldMap[labelText]) {
      product[fieldMap[labelText]] = value;
    }
  });

  // Description iframe URL
  const descIframe = document.querySelector("#desc_ifr");
  product.descUrl = descIframe ? descIframe.getAttribute('src') : null;

  // Current URL
  product.url = window.location.href;

  return product;
}

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  // Scroll to description section
  if (request.type === "scrollToDesc") {
    const el = document.getElementById('desc_ifr') ||
               document.querySelector('[id="desc_ifr"]') ||
               document.querySelector('.x-item-description');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    sendResponse({ status: 'ok' });
    return true;
  }

  try {
    const product = scrapeProduct();

    if (request.type === "scrapeProduct") {
      sendResponse({ status: "success", product });
    } else if (request.type === "infoButtonClicked") {
      sendResponse({ status: "success", product, inDiv: product.descUrl, curl: product.url });
    } else {
      sendResponse({ status: "success", product, inDiv: product.descUrl, curl: product.url });
    }
  } catch (error) {
    console.error('[eBay Scraper] Error:', error);
    sendResponse({ status: "error", message: error.message });
  }

  return true; // Keep message channel open for async
});
