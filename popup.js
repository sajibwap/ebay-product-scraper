// popup.js — eBay Product Scraper UI logic

// Fixed copy payload for the Prop 65 row (the listing value itself is just a flag).
const PROP65_COPY =
  '<p>California Proposition</p>\n' +
  '<p>⚠️ 65 Warning ⚠️</p>\n' +
  '<p>WARNING: This product contains Chemicals known to the state of California to cause cancer and birth defects or other reproductive harm.</p>';

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
  { key: "prop65",      label: "⚠️ 65 Warning", section: "specs", copyText: PROP65_COPY },
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

function copyText(text, msg) {
  navigator.clipboard.writeText(text).then(() => showToast(msg));
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

  FIELD_CONFIG.forEach(({ key, label, section, highlight, copyText: override }) => {
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

      // eBay item ID from the listing URL, beside the Listing Info heading
      const id = section === 'listing' && itemId(product.url);
      if (id) {
        const idEl = document.createElement('span');
        idEl.className = 'item-id';
        idEl.title = 'Click to copy item ID';
        idEl.textContent = id;
        idEl.addEventListener('click', () => copyText(id, 'Item ID copied!'));
        sec.appendChild(idEl);
      }
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
      if (override) {
        // Field supplies its own copy payload
        copyText(override);
      } else if (section === 'listing') {
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

  // AI bullet points — show the tab bar and load any bullets already generated for this listing
  document.getElementById('tabs').style.display = 'flex';
  chrome.storage.session.get('lastBullets', ({ lastBullets }) => {
    // The side panel stays open across listings, so drop bullets from another one
    renderBullets(lastBullets && lastBullets.url === listingUrl(product) ? lastBullets.bullets : []);
    setAiStatus('');
  });
}

// Item number from /itm/123456789012 or the older /itm/title-slug/123456789012
function itemId(url) {
  const match = (url || '').match(/\/itm\/(?:[^/?#]+\/)?(\d{9,})/);
  return match ? match[1] : null;
}

// ── Scrape ────────────────────────────────────────────────────────────────────

// Tab the shown listing came from — the panel keeps it while other tabs are viewed
let scrapedTabId = null;

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
      scrapedTabId = tab.id;
      const count = Object.keys(currentProduct).filter(k => currentProduct[k] && k !== 'descUrl' && k !== 'url' && k !== 'aiSource').length;
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
  copyText(lines.join('\n'), 'All fields copied!');
});

document.getElementById('btn-copy-json').addEventListener('click', () => {
  if (!currentProduct) return;
  const clean = {};
  FIELD_CONFIG.forEach(f => { if (currentProduct[f.key]) clean[f.label] = currentProduct[f.key]; });
  copyText(JSON.stringify(clean, null, 2), 'JSON copied!');
});

document.getElementById('btn-scrape').addEventListener('click', doScrape);

// ── Scroll to Description ─────────────────────────────────────────────────────

// Acts on the scraped listing's tab, which may not be the active one any more
document.getElementById('btn-desc').addEventListener('click', () => {
  chrome.tabs.get(scrapedTabId, function (tab) {
    if (chrome.runtime.lastError || !tab) {
      setStatus('error', 'The listing tab was closed — open it and scrape again');
      return;
    }
    chrome.tabs.sendMessage(tab.id, { type: "scrollToDesc" });
    // Also update the tab URL hash so the page jumps, and bring the tab forward
    chrome.tabs.update(tab.id, { active: true, url: tab.url.split('#')[0] + '#desc_ifr' });
  });
});

// ── Tabs ──────────────────────────────────────────────────────────────────────

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t === tab));
    document.querySelectorAll('.tab-panel').forEach((panel) => {
      panel.style.display = panel.id === tab.dataset.tab ? 'flex' : 'none';
    });
  });
});

// ── AI Bullet Points ──────────────────────────────────────────────────────────

let currentBullets = [];

// Listing URL without the #desc_ifr hash the Description button adds
function listingUrl(product) {
  return product.url.split('#')[0];
}

function setAiStatus(text, isError = false) {
  const el = document.getElementById('ai-status');
  el.textContent = text;
  el.classList.toggle('error', isError);
}

function renderBullets(bullets) {
  currentBullets = bullets;
  const list = document.getElementById('bullets-list');
  list.innerHTML = '';

  bullets.forEach((bullet) => {
    const row = document.createElement('div');
    row.className = 'field-row bullet-row';
    row.title = 'Click to copy this bullet';

    const mark = document.createElement('span');
    mark.className = 'field-label';
    mark.textContent = '•';
    const value = document.createElement('span');
    value.className = 'field-value';
    value.textContent = bullet;
    const hint = document.createElement('span');
    hint.className = 'copy-hint';
    hint.textContent = 'copy';

    row.append(mark, value, hint);
    row.addEventListener('click', () => copyText(bullet));
    list.appendChild(row);
  });

  document.getElementById('ai-empty').style.display = bullets.length ? 'none' : '';
  document.getElementById('bullet-actions').style.display = bullets.length ? 'flex' : 'none';
  document.getElementById('btn-generate').textContent =
    bullets.length ? 'Regenerate Bullet Points' : 'Generate 5 Bullet Points';
}

// The description lives in a separate iframe document, so fetch it and reduce it to text.
async function fetchDescription(descUrl, pageUrl) {
  if (!descUrl) return '';
  try {
    const res = await fetch(new URL(descUrl, pageUrl));
    if (!res.ok) return '';
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    doc.querySelectorAll('script, style, noscript').forEach(n => n.remove());
    // Keep block boundaries as line breaks so the text doesn't run together
    doc.querySelectorAll('br, p, div, li, tr, h1, h2, h3, h4, h5, h6').forEach(n => n.after('\n'));
    return (doc.body ? doc.body.textContent : '')
      .replace(/[^\S\n]+/g, ' ')
      .replace(/\s*\n\s*/g, '\n')
      .trim();
  } catch (error) {
    return '';
  }
}

async function generateBullets() {
  if (!currentProduct) return;
  const btn = document.getElementById('btn-generate');
  btn.disabled = true;

  try {
    // Only the .x-about-this-item and .d-item-description containers are used
    const source = currentProduct.aiSource;
    if (!source) throw new Error('Reload the eBay page, then scrape again');

    setAiStatus('Reading description…');
    const frameText = await fetchDescription(source.descUrl, currentProduct.url);
    const description = [source.descText, frameText].filter(Boolean).join('\n');

    setAiStatus('Generating bullet points…');
    const response = await chrome.runtime.sendMessage({
      type: 'generateBullets',
      listing: {
        url: listingUrl(currentProduct),
        title: currentProduct.title,
        condition: currentProduct.condition,
        specifics: source.specifics,
        aboutText: source.aboutText,
        description,
      },
    });

    if (!response || response.status !== 'success') {
      throw new Error(response ? response.message : 'No response from the extension — try reloading it');
    }
    renderBullets(response.bullets);
    setAiStatus('');
  } catch (error) {
    setAiStatus(error.message, true);
  } finally {
    btn.disabled = false;
  }
}

document.getElementById('btn-generate').addEventListener('click', generateBullets);

document.getElementById('btn-copy-bullets').addEventListener('click', () => {
  copyText(currentBullets.map(b => `• ${b}`).join('\n'));
});

document.getElementById('btn-copy-bullets-html').addEventListener('click', () => {
  const escape = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  copyText('<ul>\n' + currentBullets.map(b => `  <li>${escape(b)}</li>`).join('\n') + '\n</ul>');
});

document.getElementById('btn-settings').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

// Auto-scrape when the side panel opens. After that the listing stays put
// while switching tabs; the Scrape button loads the current tab's listing.
doScrape();