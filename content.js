// content.js — Scrapes eBay product data and responds to popup messages

function safeText(selector, context = document) {
  const el = context.querySelector(selector);
  return el ? el.innerText.trim() : null;
}

// eBay item-specifics labels → our field keys
const FIELD_MAP = {
  "Manufacturer Part Number": "mpn",
  "UPC": "upc",
  "Type": "type",
  "Coil Type": "coiltype",
  "Items Included": "inc",
  "Features": "feature",
  "Brand": "brand",
  "Model": "model",
  "Country/Region of Manufacture": "country",
  "Country of Origin": "country",
  "Material": "material",
  "Color": "color",
  "California Prop 65 Warning": "prop65",
};

// Specifics recorded only as a presence flag — the popup supplies its own text.
const FLAG_FIELDS = new Set(["prop65"]);

function normalize(text) {
  return text.replace(/\s+/g, ' ').trim();
}

// Reads a value cell. eBay keeps a truncated copy plus an aria-hidden expanded
// copy of long values, so prefer the expanded one and strip the "Read more"
// control and screen-reader-only text.
function specValueText(cell) {
  const expanded = cell.querySelector('[data-testid="ux-expandable-textual-display-block-inline"]');
  const clone = (expanded || cell).cloneNode(true);
  clone.querySelectorAll('.clipped, .ux-action, button, script, style').forEach(n => n.remove());
  return normalize(clone.textContent) || null;
}

// Returns every [label, value] pair of the item specifics under `root`.
function readSpecifics(root = document) {
  const pairs = [];
  // Current markup: dt/dd pairs under .ux-layout-section-evo__col
  // Older markup:   .ux-labels-values__labels / __values under .ux-layout-section__row
  root.querySelectorAll('.ux-layout-section-evo__col, .ux-layout-section__row').forEach((row) => {
    const labelEl = row.querySelector('.ux-labels-values__labels');
    const valueEl = row.querySelector('.ux-labels-values__values');
    if (!labelEl || !valueEl) return;

    const label = normalize(labelEl.textContent).replace(/:$/, '');
    const value = specValueText(valueEl);
    if (label && value) pairs.push([label, value]);
  });
  return pairs;
}

function scrapeSpecifics(product) {
  readSpecifics().forEach(([label, value]) => {
    const key = FIELD_MAP[label];
    if (!key || product[key]) return; // first match wins
    product[key] = FLAG_FIELDS.has(key) ? "Yes" : value;
  });
}

// Data for the AI bullet points, taken only from the "About this item"
// (.x-about-this-item) and description (.d-item-description) containers.
function scrapeAiSource() {
  const about = document.querySelector('.x-about-this-item');
  const desc = document.querySelector('.d-item-description');

  const specifics = about ? readSpecifics(about) : [];
  // The description body is a cross-origin iframe, so the popup fetches its URL
  const frame = desc ? desc.querySelector('iframe') : null;

  return {
    specifics,
    // Raw text as a fallback when the label/value markup isn't recognised
    aboutText: about && !specifics.length ? about.innerText.trim() : '',
    descUrl: frame ? frame.getAttribute('src') : null,
    // Any description text rendered directly in the container
    descText: desc ? desc.innerText.trim() : '',
  };
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
  scrapeSpecifics(product);

  // Source data for the AI bullet points
  product.aiSource = scrapeAiSource();

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
