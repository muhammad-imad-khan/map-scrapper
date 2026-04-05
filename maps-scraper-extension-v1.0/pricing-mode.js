'use strict';

(function initPricingModeUI() {
  const MODE_ONE_TIME = 'one_time';

  function setHtml(id, html) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  }

  function applyMode(mode) {
    const isOneTime = mode === MODE_ONE_TIME;

    if (isOneTime) {
      setHtml('creditLabel', 'License Status');
      setHtml('creditSub', 'One-time purchase unlocks full access');
      setHtml('btnTopupText', 'Unlock Lifetime');
      setHtml('tabShopText', 'Purchase');
      setHtml('shopTitle', 'One-Time Purchase');
      setHtml('shopSub', 'Pay once and unlock full scraping access');
      setHtml('noCreditsTitle', 'Unlock full access');
      setHtml('noCreditsSub', 'One-time purchase enables unlimited scraping.<br>Complete checkout to continue.');
      return;
    }

    setHtml('creditLabel', 'Your Credits');
    setHtml('creditSub', '1 credit = 1 result');
    setHtml('btnTopupText', '+ Buy Credits');
    setHtml('tabShopText', 'Buy Credits');
    setHtml('shopTitle', 'Buy Credits');
    setHtml('shopSub', 'Credits never expire · 1 credit = 1 scraped result');
    setHtml('noCreditsTitle', "You're out of credits");
    setHtml('noCreditsSub', 'Each scraped result costs <strong>1 credit</strong>.<br>Top up to keep scraping.');
  }

  function getPricingMode() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'GET_PRICING_MODE' }, (resp) => {
        if (chrome.runtime.lastError || !resp || !resp.pricingMode) {
          chrome.runtime.sendMessage({ type: 'GET_STATE' }, (stateResp) => {
            if (chrome.runtime.lastError || !stateResp) {
              resolve('credit_based');
              return;
            }
            resolve(stateResp.pricingMode || 'credit_based');
          });
          return;
        }
        resolve(resp.pricingMode);
      });
    });
  }

  getPricingMode()
    .then((mode) => applyMode(mode))
    .catch(() => applyMode('credit_based'));
})();
