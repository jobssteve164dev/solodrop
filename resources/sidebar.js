(function () {
  const vscode = acquireVsCodeApi();
  const text = window.solodropStrings;
  function format(template, values) { return template.replace(/\{(\w+)\}/g, (_match, key) => String(values[key] ?? `{${key}}`)); }
  const elements = {
    selection: document.getElementById('selection'),
    share: document.getElementById('share'),
    choose: document.getElementById('choose'),
    status: document.getElementById('status'),
    result: document.getElementById('result'),
    resultMeta: document.getElementById('result-meta'),
    open: document.getElementById('open-link'),
    copy: document.getElementById('copy-link'),
    claim: document.getElementById('claim-link'),
    refresh: document.getElementById('refresh'),
    language: document.getElementById('language'),
    history: document.getElementById('history')
  };
  elements.dropZone = document.getElementById('drop-zone');
  let latestRecord = null;

  function post(command, extras) { vscode.postMessage(Object.assign({ command }, extras || {})); }
  function setLoading(loading) {
    elements.share.classList.toggle('loading', loading);
    elements.share.disabled = loading || elements.selection.classList.contains('empty');
    elements.choose.disabled = loading;
    elements.status.textContent = loading ? text.buildingChecking : '';
  }
  function renderSelection(selection) {
    elements.selection.classList.toggle('empty', !selection);
    elements.selection.querySelector('strong').textContent = selection ? selection.name : text.noFile;
    elements.selection.querySelector('small').textContent = selection ? `${selection.kind} · ${selection.displaySize}` : text.dragOrChoose;
    elements.share.disabled = !selection;
    elements.result.classList.add('hidden');
  }
  function relativeTime(iso) {
    const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
    if (seconds < 60) return text.justNow;
    if (seconds < 3600) return format(text.minutesAgo, { count: Math.floor(seconds / 60) });
    if (seconds < 86400) return format(text.hoursAgo, { count: Math.floor(seconds / 3600) });
    return format(text.daysAgo, { count: Math.floor(seconds / 86400) });
  }
  function renderHistory(records) {
    elements.history.replaceChildren();
    if (!records || records.length === 0) {
      const empty = document.createElement('p'); empty.className = 'muted'; empty.textContent = text.emptyHistory; elements.history.append(empty); return;
    }
    records.forEach((record) => {
      const item = document.createElement('div'); item.className = 'history-item';
      const copy = document.createElement('span'); copy.className = 'history-copy';
      const heading = document.createElement('span'); heading.className = 'history-heading';
      const name = document.createElement('strong'); name.textContent = record.name; heading.append(name);
      const expiresAt = record.expiresAt || (record.temporary ? new Date(new Date(record.createdAt).getTime() + 60 * 60 * 1000).toISOString() : null);
      const expired = Boolean(record.temporary && Date.now() >= new Date(expiresAt).getTime());
      if (record.temporary) {
        const tag = document.createElement('span'); tag.className = `expiry-tag ${expired ? 'expired' : 'active'}`; tag.textContent = expired ? text.expired : text.active; heading.append(tag);
      }
      const meta = document.createElement('small'); meta.textContent = `${record.temporary ? text.temporary : text.persistent} · ${relativeTime(record.createdAt)}`;
      const actions = document.createElement('span'); actions.className = 'history-actions';
      const open = document.createElement('button'); open.type = 'button'; open.className = 'history-action'; open.textContent = text.open; open.addEventListener('click', () => post('open', { url: record.previewUrl })); actions.append(open);
      if (expired) {
        const reshare = document.createElement('button'); reshare.type = 'button'; reshare.className = 'history-action reshare'; reshare.textContent = text.shareAgain; reshare.addEventListener('click', () => post('reshare', { id: record.id })); actions.append(reshare);
      }
      copy.append(heading, meta); item.append(copy, actions);
      elements.history.append(item);
    });
  }
  elements.choose.addEventListener('click', () => post('choose'));
  elements.share.addEventListener('click', () => post('share'));
  elements.refresh.addEventListener('click', () => post('refresh'));
  elements.language.addEventListener('click', () => post('setLanguage'));
  elements.open.addEventListener('click', () => latestRecord && post('open', { url: latestRecord.previewUrl }));
  elements.copy.addEventListener('click', () => latestRecord && post('copy', { url: latestRecord.previewUrl }));
  elements.claim.addEventListener('click', () => latestRecord?.claimUrl && post('open', { url: latestRecord.claimUrl }));
  let dragDepth = 0;
  elements.dropZone.addEventListener('dragenter', (event) => { event.preventDefault(); dragDepth += 1; elements.dropZone.classList.add('dragging'); });
  elements.dropZone.addEventListener('dragover', (event) => { event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'; });
  elements.dropZone.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (dragDepth === 0) elements.dropZone.classList.remove('dragging'); });
  elements.dropZone.addEventListener('drop', async (event) => {
    event.preventDefault(); dragDepth = 0; elements.dropZone.classList.remove('dragging');
    const transfer = event.dataTransfer;
    const uriList = transfer?.getData('text/uri-list') || transfer?.getData('application/vnd.code.uri-list');
    if (uriList) {
      const uri = uriList.split(/\r?\n/).find((line) => line && !line.startsWith('#'));
      if (uri) { post('dropUri', { uri }); return; }
    }
    const file = transfer?.files?.[0];
    if (!file) { elements.status.textContent = text.dropOneFile; return; }
    if (file.size > 5 * 1024 * 1024) { elements.status.textContent = text.droppedFileLimit; return; }
    const bytes = await file.arrayBuffer();
    vscode.postMessage({ command: 'dropFile', name: file.name, bytes });
  });
  window.addEventListener('message', (event) => {
    const message = event.data;
    if (message.command === 'selectionChanged') renderSelection(message.selection);
    if (message.command === 'historyLoaded') renderHistory(message.records);
    if (message.command === 'shareStarted') setLoading(true);
    if (message.command === 'shareFailed') { setLoading(false); elements.status.textContent = message.message; }
    if (message.command === 'shareCompleted') {
      setLoading(false); latestRecord = message.record; elements.result.classList.remove('hidden');
      elements.resultMeta.textContent = message.record.temporary ? text.temporaryMeta : text.persistentMeta;
      elements.claim.classList.toggle('hidden', !message.record.claimUrl);
      renderHistory(message.records || [message.record]);
    }
  });
  post('ready');
}());
