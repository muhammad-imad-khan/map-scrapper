'use strict';

(function initWelcomeAuth() {
  const btnLogin = document.getElementById('btnLogin');
  const emailInput = document.getElementById('emailInput');
  const passwordInput = document.getElementById('passwordInput');
  const msg = document.getElementById('msg');

  function showMsg(text, type) {
    msg.textContent = text;
    msg.className = 'msg ' + type;
  }

  function sendMessage(message) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) { resolve(null); return; }
          resolve(response || null);
        });
      } catch { resolve(null); }
    });
  }

  function closeWelcomeTab() {
    try {
      chrome.tabs.getCurrent((tab) => {
        if (tab && tab.id) {
          chrome.tabs.remove(tab.id, () => {
            void chrome.runtime.lastError;
          });
          return;
        }
        window.close();
      });
    } catch {
      window.close();
    }
  }

  // Check if already authenticated
  chrome.storage.local.get(['extAuthenticated', 'extAuthLifetime'], (data) => {
    if (data.extAuthenticated && data.extAuthLifetime) {
      showMsg('Already signed in with lifetime access!', 'ok');
      btnLogin.textContent = 'Opening tool...';
      btnLogin.disabled = true;
      setTimeout(() => closeWelcomeTab(), 1500);
    }
  });

  btnLogin.addEventListener('click', async () => {
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showMsg('Please enter a valid email address.', 'err');
      emailInput.focus();
      return;
    }
    if (!password || password.length < 6) {
      showMsg('Password must be at least 6 characters.', 'err');
      passwordInput.focus();
      return;
    }

    btnLogin.disabled = true;
    btnLogin.textContent = 'Signing in...';
    showMsg('', '');

    try {
      const result = await sendMessage({ type: 'EXT_LOGIN', email, password });

      if (!result || !result.ok) {
        showMsg(result?.error || 'Login failed. Please check your credentials.', 'err');
        btnLogin.disabled = false;
        btnLogin.textContent = 'Sign In & Activate \u2192';
        return;
      }

      if (!result.entitlements?.lifetimeAccess) {
        showMsg('No active license found for this account. Please purchase the tool first.', 'err');
        btnLogin.disabled = false;
        btnLogin.textContent = 'Sign In & Activate \u2192';
        return;
      }

      showMsg('\u2713 Lifetime access activated! Opening tool...', 'ok');
      btnLogin.textContent = 'Activated!';

      setTimeout(() => closeWelcomeTab(), 1500);
    } catch (e) {
      showMsg('Connection error. Please check your internet and try again.', 'err');
      btnLogin.disabled = false;
      btnLogin.textContent = 'Sign In & Activate \u2192';
    }
  });

  // Allow Enter key to submit
  passwordInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btnLogin.click();
  });
  emailInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') passwordInput.focus();
  });
})();
