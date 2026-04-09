'use strict';

(function initLifetimePopupUi() {
  const MODE_ONE_TIME = 'one_time';
  const UNLIMITED_BATCH_RESULTS = 100;
  const WATCHED_MESSAGE_TYPES = new Set(['STATE', 'CREDITS_UPDATE', 'RESULT', 'DONE', 'NO_CREDITS']);
  const WATCHED_STORAGE_KEYS = ['pricingMode', 'unlimitedAccess', 'credits', 'rawCredits'];
  let refreshTimer = null;
  let lastRenderKey = '';

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function setHtml(id, value) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = value;
  }

  function sendMessage(message) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) {
            resolve(null);
            return;
          }
          resolve(response || null);
        });
      } catch {
        resolve(null);
      }
    });
  }

  function readStorage(keys) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(keys, (data) => resolve(data || {}));
      } catch {
        resolve({});
      }
    });
  }

  async function getPopupState() {
    const [runtimeState, storedState] = await Promise.all([
      sendMessage({ type: 'GET_STATE' }),
      readStorage(['pricingMode', 'unlimitedAccess', 'credits', 'rawCredits']),
    ]);

    return {
      pricingMode: runtimeState?.pricingMode || storedState.pricingMode || 'credit_based',
      unlimited: runtimeState?.unlimited === true || storedState.unlimitedAccess === true,
      credits: Number.isFinite(Number(runtimeState?.credits))
        ? Number(runtimeState.credits)
        : Math.max(0, Number(storedState.credits || 0)),
      rawCredits: Number.isFinite(Number(storedState.rawCredits))
        ? Number(storedState.rawCredits)
        : Math.max(0, Number(storedState.credits || 0)),
    };
  }

  function applyLifetimeView(state) {
    const renderKey = JSON.stringify({
      pricingMode: state.pricingMode,
      unlimited: state.unlimited,
      credits: state.credits,
      rawCredits: state.rawCredits,
    });
    if (renderKey === lastRenderKey) return;
    lastRenderKey = renderKey;

    if (state.pricingMode !== MODE_ONE_TIME) return;

    if (state.unlimited) {
      document.body.dataset.lifetimeAccess = 'true';
      setText('creditLabel', 'License Status');
      setText('creditCount', 'Unlimited');
      setText('creditSub', `Lifetime access active · ${UNLIMITED_BATCH_RESULTS} results per batch`);
      setText('btnTopupText', 'Manage Access');
      setText('tabShopText', 'Access');
      setText('shopTitle', 'Lifetime Access');
      setText('shopSub', `Full access is active · ${UNLIMITED_BATCH_RESULTS} results per batch`);
      setText('costPill', `${UNLIMITED_BATCH_RESULTS} results / batch`);
      setText('ftrCredits', 'Lifetime access');
      setText('histBalance', 'Unlimited access');
      setHtml('noCreditsTitle', 'Lifetime access active');
      setHtml('noCreditsSub', `Your license is active.<br>Each run is capped at ${UNLIMITED_BATCH_RESULTS} results per batch.`);
      return;
    }

    document.body.dataset.lifetimeAccess = 'false';
    setText('ftrCredits', `${state.credits} credits`);

    const historyBalance = document.getElementById('histBalance');
    if (historyBalance && /Unlimited access/i.test(historyBalance.textContent || '')) {
      historyBalance.textContent = String(state.credits);
    }
  }

  async function refreshLifetimeView() {
    const state = await getPopupState();
    applyLifetimeView(state);
  }

  function scheduleRefresh(delay = 0) {
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => {
      refreshLifetimeView().catch(() => {});
    }, delay);
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message && WATCHED_MESSAGE_TYPES.has(message.type)) {
      scheduleRefresh(30);
    }
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    if (WATCHED_STORAGE_KEYS.some((key) => Object.prototype.hasOwnProperty.call(changes, key))) {
      scheduleRefresh(30);
    }
  });

  sendMessage({ type: 'SYNC_CREDITS' }).catch(() => null);
  scheduleRefresh(0);
  scheduleRefresh(250);
  scheduleRefresh(900);
})();