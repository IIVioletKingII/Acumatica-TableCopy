// Injected into every frame of the Acumatica tab by background.js.
// Wrapped in an IIFE so re-injecting doesn't collide with earlier top-level declarations.
(() => {
	if (window.__acuTableCopy) return; // already running in this frame

	const HOVER_CLASS = 'acu-copy-hover';
	const PICKING_CLASS = 'acu-copy-picking';
	const LOG = '[Acumatica Table Copier]';

	let hovered = null;

	function cellText(td) {
		const textEl = td.querySelector('.text');

		let text;
		if (textEl) text = textEl.innerText;
		else if (td.matches('th.row-selector')) text = '⚙️';
		else if (td.matches('th.col-header[title="Files"]')) text = '📎';
		else if (td.matches('th.col-header[title="Notes"]')) text = '📄';
		else if (td.querySelector('.control-GridCheck')) text = '✅';
		else if (td.querySelector('.control-GridUncheck')) text = '🟩';
		else if (td.querySelector('.ac.control-CurrentRow')) text = '>';

		if (typeof text === 'undefined') {
			const svg_use = td.querySelector('qp-icon svg use');
			if (svg_use && svg_use.href) { // if no txt found yet try icons and continue through else ifs
				const href = svg_use.href.baseVal ?? svg_use.href.animVal ?? '';
				if (href.includes('#noteEmpty')) text = '📄';
				else if (href.includes('#note')) text = '📝';
				else if (href.includes('#rowFileEmpty')) text = '📎';
				else if (href.includes('#rowFile')) text = '📋';
			}
			else text = td.innerText;
		}

		// Tabs/newlines inside a cell would break the TSV layout when pasted into Excel.
		return text.replace(/[\t\r\n]+/g, ' ').trim();

		// 📎📋📄📝
	}

	const outlineTableQuery = '.grid';

	function extractTable(grid) {
		const header = grid.querySelector('thead');
		const body = grid.querySelector('tbody');
		if (!body) return '';
		return [...header.rows, ...body.rows]
			.map(row => [...row.cells].map(cellText).join('\t'))
			.filter(row => row.replaceAll('\t', '').trim().length > 0)
			.join('\n');
	}

	function setHover(tbody) {
		if (tbody === hovered) return;
		hovered?.classList.remove(HOVER_CLASS);
		hovered = tbody;
		hovered?.classList.add(HOVER_CLASS);
	}

	async function copyToClipboard(text) {
		try {
			await navigator.clipboard.writeText(text);
			return;
		} catch (err) {
			console.warn(LOG, 'navigator.clipboard failed, falling back to execCommand', err);
		}
		const ta = document.createElement('textarea');
		ta.value = text;
		ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
		document.body.append(ta);
		ta.select();
		const ok = document.execCommand('copy');
		ta.remove();
		if (!ok) throw new Error('execCommand("copy") returned false');
	}

	// Inline styles so the toast still looks right after picker.css is removed.
	function toast(message, isError = false) {
		const el = document.createElement('div');
		el.textContent = message;
		el.style.cssText = `
			position: fixed; z-index: 2147483647; bottom: 24px; left: 50%;
			transform: translateX(-50%); padding: 8px 16px; border-radius: 6px;
			font: 14px/1.4 system-ui, sans-serif; color: #fff; pointer-events: none;
			background: ${isError ? '#c62828' : '#2685d9'}; box-shadow: 0 2px 8px rgba(0,0,0,.25);
			transition: opacity .3s;`;
		document.body.append(el);
		setTimeout(() => { el.style.opacity = '0'; }, 1500);
		setTimeout(() => el.remove(), 1900);
	}

	// ---- event handlers (all registered in the capture phase on window, so they run before Acumatica's) ----

	function onPointerOver(event) {
		setHover(event.target.closest?.(outlineTableQuery) ?? null);
	}

	function onPointerLeaveDocument() {
		setHover(null);
	}

	// Block the press events Acumatica uses to select rows / enter edit mode, but only over a table.
	function swallowIfTable(event) {
		if (!event.target.closest?.(outlineTableQuery)) return;
		event.preventDefault();
		event.stopImmediatePropagation();
	}

	async function onClick(event) {
		const grid = event.target.closest?.(outlineTableQuery);
		if (!grid) return;

		event.preventDefault();
		event.stopImmediatePropagation();

		const text = extractTable(grid);
		const rowCount = text ? text.split('\n').length : 0;
		console.debug(LOG, 'extracted', { grid, rowCount, text });

		try {
			await copyToClipboard(text);
			toast(`Copied ${rowCount} row${rowCount === 1 ? '' : 's'}`);
		} catch (err) {
			console.error(LOG, 'copy failed', err);
			toast('Copy failed (see console)', true);
		}
		stopEverywhere();
	}

	function onKeyDown(event) {
		if (event.key !== 'Escape') return;
		event.preventDefault();
		event.stopImmediatePropagation();
		stopEverywhere();
	}

	const listeners = [
		['pointerover', onPointerOver],
		['pointerdown', swallowIfTable],
		['mousedown', swallowIfTable],
		['pointerup', swallowIfTable],
		['mouseup', swallowIfTable],
		['dblclick', swallowIfTable],
		['click', onClick],
		['keydown', onKeyDown]
	];

	function stop() {
		for (const [type, fn] of listeners) window.removeEventListener(type, fn, true);
		document.documentElement.removeEventListener('pointerleave', onPointerLeaveDocument);
		document.documentElement.classList.remove(PICKING_CLASS);
		setHover(null);
		delete window.__acuTableCopy;
	}

	// Stop this frame immediately, then ask the background to stop the other frames too.
	function stopEverywhere() {
		stop();
		chrome.runtime.sendMessage({ type: 'acu-copy-stop' }).catch(() => { /* extension reloaded */ });
	}

	for (const [type, fn] of listeners) window.addEventListener(type, fn, true);
	document.documentElement.addEventListener('pointerleave', onPointerLeaveDocument);
	document.documentElement.classList.add(PICKING_CLASS);

	window.__acuTableCopy = { stop, extractTbody: extractTable }; // extractTbody exposed for console debugging
})();
