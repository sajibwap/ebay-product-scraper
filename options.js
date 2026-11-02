// options.js — Settings page logic (AI provider, key, model)

const $ = id => document.getElementById(id);

let settings = null;

function setStatus(type, text) {
  const el = $('status');
  el.className = `status ${type}`;
  el.textContent = text;
}

// Fill the key/model inputs for the given provider
function showProvider(provider) {
  const info = AI_PROVIDERS[provider];

  $('api-key').value = settings.keys[provider] || '';
  $('model').value = settings.models[provider] || info.defaultModel;
  $('model').placeholder = info.defaultModel || 'Model ID, e.g. llama-3.3-70b';

  const list = $('model-list');
  list.innerHTML = '';
  info.models.forEach((model) => {
    const opt = document.createElement('option');
    opt.value = model;
    list.appendChild(opt);
  });

  $('base-url-field').style.display = provider === 'custom' ? '' : 'none';
  $('key-link').style.display = info.keyUrl ? '' : 'none';
  $('key-link').href = info.keyUrl || '#';
}

// Copy the inputs back into `settings` for the provider currently shown
function readForm() {
  const provider = settings.provider;
  settings.keys[provider] = $('api-key').value.trim();
  settings.models[provider] = $('model').value.trim();
  settings.customBaseUrl = $('base-url').value.trim();
  settings.instructions = $('instructions').value.trim();
}

async function init() {
  settings = await loadAiSettings();

  const select = $('provider');
  Object.entries(AI_PROVIDERS).forEach(([id, info]) => {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = info.label;
    select.appendChild(opt);
  });
  if (!AI_PROVIDERS[settings.provider]) settings.provider = DEFAULT_AI_SETTINGS.provider;

  select.value = settings.provider;
  $('base-url').value = settings.customBaseUrl;
  $('instructions').value = settings.instructions;
  showProvider(settings.provider);
}

$('provider').addEventListener('change', (e) => {
  readForm(); // keep what was typed for the previous provider
  settings.provider = e.target.value;
  showProvider(settings.provider);
  setStatus('', '');
});

$('btn-toggle-key').addEventListener('click', () => {
  const input = $('api-key');
  const reveal = input.type === 'password';
  input.type = reveal ? 'text' : 'password';
  $('btn-toggle-key').textContent = reveal ? 'Hide' : 'Show';
});

$('btn-save').addEventListener('click', async () => {
  readForm();
  await chrome.storage.local.set({ aiSettings: settings });
  setStatus('success', 'Settings saved');
});

$('btn-test').addEventListener('click', async () => {
  readForm();
  const btn = $('btn-test');
  btn.disabled = true;
  setStatus('', `Contacting ${AI_PROVIDERS[settings.provider].label}…`);

  try {
    const response = await chrome.runtime.sendMessage({ type: 'testAi', settings });
    if (!response || response.status !== 'success') {
      throw new Error(response ? response.message : 'No response from the extension — try reloading it');
    }
    setStatus('success', 'Connection works — remember to save');
  } catch (error) {
    setStatus('error', error.message);
  } finally {
    btn.disabled = false;
  }
});

init();
