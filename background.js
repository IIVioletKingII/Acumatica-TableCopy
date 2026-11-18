const HOST = 'hdfowler.acumatica.com';

// Clicking the toolbar icon (or pressing Alt+Shift+C) toggles picker mode in every frame of the tab.
// Acumatica renders screens inside an <iframe>, so we always target allFrames.
chrome.action.onClicked.addListener(async (tab) => {
	if (!tab.id || !tab.url) return;
	if (new URL(tab.url).hostname !== HOST) return;

	const target = { tabId: tab.id, allFrames: true };

	try {
		// Is the picker already running in any frame? If so, this click turns it off.
		const results = await chrome.scripting.executeScript({
			target,
			func: () => Boolean(window.__acuTableCopy)
		});
		if (results.some(r => r.result)) return stopPicker(tab.id);

		await chrome.scripting.insertCSS({ target, files: ['picker.css'] });
		await chrome.scripting.executeScript({ target, files: ['picker.js'] });
		await chrome.action.setBadgeText({ tabId: tab.id, text: 'ON' });
	} catch (err) {
		console.error('[Acumatica Table Copier] failed to start picker', err);
	}
});

// picker.js sends this after a copy or Esc, so every frame shuts down together.
chrome.runtime.onMessage.addListener((msg, sender) => {
	if (msg?.type === 'acu-copy-stop' && sender.tab?.id) stopPicker(sender.tab.id);
});

async function stopPicker(tabId) {
	const target = { tabId, allFrames: true };
	try {
		await chrome.scripting.executeScript({ target, func: () => window.__acuTableCopy?.stop() });
		await chrome.scripting.removeCSS({ target, files: ['picker.css'] });
	} catch (err) {
		console.error('[Acumatica Table Copier] failed to stop picker', err);
	}
	await chrome.action.setBadgeText({ tabId, text: '' });
}
