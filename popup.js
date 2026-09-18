// popup.js — eBay Product Scraper UI logic

const FIELD_CONFIG = [
  { key: "breadcrumbs", label: "Category",  section: "listing" },
  { key: "title",       label: "Title",     section: "listing", highlight: true },
  { key: "price",       label: "Price",     section: "listing", highlight: true },
  { key: "condition",   label: "Condition", section: "listing" },
  { key: "seller",      label: "Seller",    section: "listing" },
  { key: "mpn",         label: "MPN",       section: "listing" },
  { key: "upc",         label: "UPC",       section: "listing" },
  { key: "country",     label: "Origin",    section: "listing" },
  { key: "brand",       label: "Brand",     section: "specs" },
  { key: "model",       label: "Model",     section: "specs" },
  { key: "type",        label: "Type",      section: "specs" },
  { key: "coiltype",    label: "Coil Type", section: "specs" },
  { key: "color",       label: "Color",     section: "specs" },
  { key: "material",    label: "Material",  section: "specs" },
  { key: "inc",         label: "Included",  section: "specs" },
  { key: "feature",     label: "Features",  section: "specs" },
];

let currentProduct = null;

// ── Helpers ──────────────────────────────────────────────────────────────────

function setStatus(type, text) {
  const bar = document.getElementById('status-bar');
  const txt = document.getElementById('status-text');
  bar.className = `status-bar status-${type}`;
  const dot = type === 'loading' ? '<span class="status-dot"></span>' : '';
  bar.innerHTML = `${dot}<span id="status-text">${text}</span>`;
}

function showToast(msg = 'Copied!') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 1800);
}

function copyText(text) {
  navigator.clipboard.writeText(text).then(() => showToast());
}

// ── Render ────────────────────────────────────────────────────────────────────

function renderFields(product) {
  const container = document.getElementById('fields-container');
  container.innerHTML = '';

  const hasData = FIELD_CONFIG.some(f => product[f.key]);

  if (!hasData) {
    container.innerHTML = `
      <div class="empty-state">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <p>No product data found.<br>Make sure you're on an eBay listing page.</p>
      </div>`;
    return;
  }

  let lastSection = null;

  FIELD_CONFIG.forEach(({ key, label, section, highlight }) => {
    const val = product[key];
    if (!val) return;

    if (section !== lastSection) {
      if (lastSection !== null) {
        const div = document.createElement('div');
        div.className = 'divider';
        container.appendChild(div);
      }
      const sec = document.createElement('div');
      sec.className = 'section-label';
      sec.textContent = section === 'listing' ? '📋 Listing Info' : '🔧 Specifications';
      container.appendChild(sec);
      lastSection = section;
    }

    const row = document.createElement('div');
    row.className = 'field-row';
    row.title = `Click to copy ${label}`;
    row.innerHTML = `
      <span class="field-label">${label}</span>
      <span class="field-value ${highlight ? 'highlighted' : ''}">${val}</span>
      <span class="copy-hint">copy</span>
    `;
    // Copy behavior differs by section
    row.addEventListener('click', () => {
      if (section === 'listing') {
        // Listing: copy only value
        copyText(val);
      } else {
        // Specs: copy label and value
        copyText(`${label}: ${val}`);
      }
    });
    container.appendChild(row);
  });

  // Show footer
  document.getElementById('footer').style.display = 'flex';

  // Description scroll button — show once data is loaded
  document.getElementById('btn-desc').style.display = 'inline-flex';
}

// ── Scrape ────────────────────────────────────────────────────────────────────

function doScrape() {
  const btn = document.getElementById('btn-scrape');
  btn.classList.add('loading');
  setStatus('loading', 'Scraping product data…');

  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    const tab = tabs[0];

    if (!tab || !tab.url || !/ebay\.(com|ca|co\.uk|com\.au|de|fr|it|es)/.test(tab.url)) {
      setStatus('error', 'Not an eBay page — navigate to a listing first');
      btn.classList.remove('loading');
      return;
    }

    chrome.tabs.sendMessage(tab.id, { type: "scrapeProduct" }, function (response) {
      btn.classList.remove('loading');

      if (chrome.runtime.lastError || !response) {
        setStatus('error', 'Could not connect — try reloading the page');
        return;
      }

      if (response.status === 'error') {
        setStatus('error', `Error: ${response.message}`);
        return;
      }

      currentProduct = response.product;
      const count = Object.keys(currentProduct).filter(k => currentProduct[k] && k !== 'descUrl' && k !== 'url').length;
      setStatus('success', `${count} fields extracted successfully`);
      renderFields(currentProduct);
    });
  });
}

// ── Copy All ─────────────────────────────────────────────────────────────────

document.getElementById('btn-copy-all').addEventListener('click', () => {
  if (!currentProduct) return;
  const lines = FIELD_CONFIG
    .filter(f => currentProduct[f.key])
    .map(f => `${f.label}: ${currentProduct[f.key]}`);
  copyText(lines.join('\n'));
  showToast('All fields copied!');
});

document.getElementById('btn-copy-json').addEventListener('click', () => {
  if (!currentProduct) return;
  const clean = {};
  FIELD_CONFIG.forEach(f => { if (currentProduct[f.key]) clean[f.label] = currentProduct[f.key]; });
  copyText(JSON.stringify(clean, null, 2));
  showToast('JSON copied!');
});

document.getElementById('btn-scrape').addEventListener('click', doScrape);

// ── Scroll to Description ─────────────────────────────────────────────────────

document.getElementById('btn-desc').addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    chrome.tabs.sendMessage(tabs[0].id, { type: "scrollToDesc" });
    // Also update the tab URL hash so the page jumps
    chrome.tabs.update(tabs[0].id, { url: tabs[0].url.split('#')[0] + '#desc_ifr' });
  });
});

// Auto-scrape on popup open
doScrape();