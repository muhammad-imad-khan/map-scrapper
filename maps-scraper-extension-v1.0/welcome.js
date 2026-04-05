const btnSave = document.getElementById('btnSave');
const btnSkip = document.getElementById('btnSkip');
const emailInput = document.getElementById('emailInput');
const nameInput = document.getElementById('nameInput');
const msg = document.getElementById('msg');

btnSave.addEventListener('click', async () => {
  const email = emailInput.value.trim();
  const name = nameInput.value.trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    msg.textContent = 'Please enter a valid email address.';
    msg.className = 'msg err';
    emailInput.focus();
    return;
  }
  btnSave.disabled = true;
  btnSave.textContent = 'Saving…';
  msg.textContent = '';
  try {
    const res = await new Promise(resolve => {
      chrome.runtime.sendMessage({ type: 'GET_INSTALL_ID' }, resolve);
    });
    const installId = res?.installId;
    if (!installId) throw new Error('No install ID');

    const resp = await fetch('https://map-scraper-paddle-backend.vercel.app/api/credits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Install-Id': installId },
      body: JSON.stringify({ action: 'saveEmail', email, name }),
    });
    const data = await resp.json();
    if (data.ok) {
      chrome.storage.local.set({ emailCollected: true, userEmail: email, userName: name });
      msg.textContent = '✓ You\'re all set!';
      msg.className = 'msg ok';
      btnSave.textContent = 'Done!';
      setTimeout(() => {
        chrome.runtime.sendMessage({ type: 'OPEN_POPUP' }).catch(() => {});
        window.close();
      }, 1500);
    } else {
      throw new Error(data.error || 'Save failed');
    }
  } catch (e) {
    msg.textContent = e.message || 'Network error. Try again.';
    msg.className = 'msg err';
    btnSave.disabled = false;
    btnSave.textContent = 'Get Started →';
  }
});

btnSkip.addEventListener('click', () => {
  chrome.storage.local.set({ emailCollected: true });
  chrome.runtime.sendMessage({ type: 'OPEN_POPUP' }).catch(() => {});
  window.close();
});
