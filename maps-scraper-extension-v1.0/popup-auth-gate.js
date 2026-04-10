'use strict';

(function initAuthGate() {
  const overlay = document.getElementById('authGateOverlay');
  const emailInput = document.getElementById('authGateEmail');
  const passwordInput = document.getElementById('authGatePassword');
  const msgEl = document.getElementById('authGateMsg');
  const btnLogin = document.getElementById('authGateLogin');

  if (!overlay || !emailInput || !passwordInput || !btnLogin) return;

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

  function showGate() {
    overlay.style.display = 'flex';
  }

  function hideGate() {
    overlay.style.display = 'none';
  }

  function showError(text) {
    msgEl.textContent = text;
    msgEl.style.color = 'var(--red)';
  }

  function showSuccess(text) {
    msgEl.textContent = text;
    msgEl.style.color = 'var(--g)';
  }

  // Check auth state on load
  sendMessage({ type: 'CHECK_AUTH' }).then((auth) => {
    if (auth && auth.authenticated && auth.lifetimeAccess) {
      hideGate();
    } else {
      showGate();
    }
  });

  btnLogin.addEventListener('click', async () => {
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showError('Please enter a valid email address.');
      emailInput.focus();
      return;
    }
    if (!password || password.length < 6) {
      showError('Password must be at least 6 characters.');
      passwordInput.focus();
      return;
    }

    btnLogin.disabled = true;
    btnLogin.textContent = 'Signing in\u2026';
    msgEl.textContent = '';

    try {
      const result = await sendMessage({ type: 'EXT_LOGIN', email, password });

      if (!result || !result.ok) {
        showError(result?.error || 'Login failed. Check your credentials.');
        btnLogin.disabled = false;
        btnLogin.textContent = 'Sign In & Activate';
        return;
      }

      if (!result.entitlements?.lifetimeAccess) {
        showError('No active license found. Please purchase the tool first.');
        btnLogin.disabled = false;
        btnLogin.textContent = 'Sign In & Activate';
        return;
      }

      showSuccess('\u2713 Lifetime access activated!');
      btnLogin.textContent = 'Activated!';

      // Sync credits then hide gate
      await sendMessage({ type: 'SYNC_CREDITS' });

      setTimeout(() => {
        hideGate();
        // Trigger UI refresh for lifetime mode
        sendMessage({ type: 'SYNC_CREDITS' });
      }, 800);
    } catch {
      showError('Connection error. Check your internet.');
      btnLogin.disabled = false;
      btnLogin.textContent = 'Sign In & Activate';
    }
  });

  passwordInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btnLogin.click();
  });
  emailInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') passwordInput.focus();
  });
})();
