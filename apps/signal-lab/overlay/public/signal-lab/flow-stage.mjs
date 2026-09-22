import { generateFlowMessages, flowGroups, flowDimensions } from './flow-data.mjs';
import { findRepeatedTopics, evidenceSummary, createFinding } from './signal-insights.mjs';

export const mountSignalStage = ({ getWorkspace, openWorkbench, setQuestion, analyzeMessages, useTopics, reviewMessage }) => {
  const root = document.getElementById('signal-stage');
  const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const number = value => Math.floor(value).toLocaleString('en-US');
  root.innerHTML = `
    <header class="flow-header"><a href="./" class="flow-brand"><span class="flow-symbol">✳</span>Signal Lab</a><nav><button id="flow-workspace">Categories & rules</button><button id="flow-saved">Findings <span id="flow-saved-count">0</span></button><button class="flow-solid" id="flow-import">Add messages ＋</button></nav></header>
    <form class="flow-research" id="flow-research"><div><label for="flow-question">Your question</label><input id="flow-question" maxlength="1600" required value="What are people talking about?"><small id="flow-question-note">Select a group to inspect its messages.</small></div><button type="submit" class="flow-solid">Apply question</button></form>
    <div class="flow-toolbar"><div class="flow-dimensions" role="group" aria-label="Group messages"><button data-dimension="topic" aria-pressed="true">Topic</button><button data-dimension="intent">Intent</button><button data-dimension="urgency">Urgency</button></div><label class="flow-source-filter"><span>Source</span><select id="flow-source" aria-label="Filter map by source"></select></label><button id="flow-present" class="flow-stream-toggle" aria-pressed="false">▶ Play stream</button><select id="flow-speed" aria-label="Playback speed" title="Visual playback speed, not analysis throughput"><option value="1">1×</option><option value="10" selected>10×</option><option value="50">50×</option></select><button id="flow-video" aria-pressed="false">Video view</button><button class="flow-solid" id="flow-analyze" hidden>Analyze messages</button></div>
    <div class="flow-coverage"><span id="flow-coverage"></span><span id="flow-map-note">One dot = one message</span></div>
    <div class="flow-analysis"><section class="flow-visual" aria-label="Interactive message map"><canvas id="flow-canvas" role="img" aria-label="Messages grouped by the selected category. Group area shows count; position does not encode semantic similarity. Use group buttons to inspect messages."></canvas><div id="flow-labels" class="flow-labels"></div><div class="flow-core" id="flow-core"><span class="flow-core-mark">✳</span><strong id="flow-total">Signal</strong><small id="flow-core-caption">message map</small></div><div id="flow-stream" class="flow-stream" hidden aria-label="Message playback" aria-live="off"><div class="flow-stream-heading"><span class="flow-stream-light"></span>Message stream <small>Playback</small></div><div class="flow-stream-window" id="flow-stream-window"><div id="flow-stream-cards"></div></div></div><p id="flow-empty" hidden>No messages match these filters.</p></section><aside class="flow-evidence" aria-label="Message evidence"><div class="flow-panel-head"><div><small id="flow-panel-scope">All messages</small><h2 id="flow-panel-title">Explore a group</h2></div><button id="flow-clear" aria-label="Clear selection">×</button></div><div id="flow-panel"></div></aside></div>
    <footer class="flow-footer"><button id="flow-data-toggle">Use workspace data</button><span id="flow-provenance"></span><button id="flow-list-open">All messages ↗</button></footer>
    <dialog class="flow-dialog" id="flow-findings"><div class="flow-dialog-head"><h2>Saved findings</h2><button id="flow-findings-close" aria-label="Close saved findings">×</button></div><p>Stored in this tab. Export to keep your evidence.</p><div id="flow-findings-body"></div><button id="flow-export" class="flow-solid">Export findings</button></dialog><p id="flow-notice" role="status" hidden></p>`;
  const el = id => root.querySelector(`#${id}`);
  const canvas = el('flow-canvas'), context = canvas.getContext('2d', { alpha: false });
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const demoMessages = generateFlowMessages();
  let allMessages = demoMessages, messages = demoMessages, groups = [], dimension = 'topic', dimensions = flowDimensions, source = 'demo';
  let dimensionNames = { topic: 'Topic', intent: 'Intent', urgency: 'Urgency' };
  let w = 0, h = 0, dots = [], centers = [], core = { x: 0, y: 0 }, selected = null;
  let paused = false, active = true, presenting = false, settling = 2, clock = 0, last = 0, frame = 0;
  let selectedGroup = null, selectedTopic = null, search = '', pageSize = 30, topics = [], findingDraft = null, busy = false;
  let currentQuestion = 'What are people talking about?', datasetIdentity = '';
  let playbackSpeed = 10, streamElapsed = 0, streamIndex = 0, streamMessages = [], streamedId = null, videoMode = false;
  let streamAnimation = null, streamGeneration = 0, streamScopeKey = '', streamCapacity = 4;
  const excluded = new Set(), findings = [];
  const labelsFor = () => dimensions;
  const getGroup = message => groups[message[dimension]];
  const groupColor = message => getGroup(message)?.color || '#92a8ff';
  let noticeTimer;
  const notice = text => { el('flow-notice').textContent = text; el('flow-notice').hidden = false; clearTimeout(noticeTimer); noticeTimer=setTimeout(()=>el('flow-notice').hidden=true,6500); };
  const download = (name, data) => { const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
  const selection = () => messages.filter(message => (!search || `${message.text} ${message.context || ''}`.toLowerCase().includes(search.toLowerCase())) && (selectedGroup === null || message[dimension] === selectedGroup) && (!selectedTopic || selectedTopic.ids.includes(message.id)));
  const updatePlayback = () => {
    el('flow-present').setAttribute('aria-pressed', String(presenting));
    el('flow-present').textContent = presenting ? 'Ⅱ Pause stream' : '▶ Play stream';
    el('flow-stream').hidden = !streamMessages.length;
    el('flow-speed').disabled = motion.matches;
  };
  const cancelStreamTransition = () => {
    streamGeneration++;
    streamAnimation?.cancel();
    streamAnimation = null;
  };
  const renderStream = () => {
    const track = el('flow-stream-cards');
    if (!streamMessages.length) { el('flow-stream').hidden = true; track.replaceChildren(); streamedId = null; return; }
    el('flow-stream').hidden = false;
    const width = el('flow-stream-window').clientWidth || w;
    streamCapacity = w >= 1050 && h >= 600 ? 4 : 3;
    const cardHeight = w < 700 ? 94 : h < 560 ? 110 : 124;
    el('flow-stream-window').style.height = `${streamCapacity * cardHeight + 12 * (streamCapacity - 1)}px`;
    track.style.setProperty('--flow-card-height', `${cardHeight}px`);
    track.style.setProperty('--flow-card-width', `${Math.max(1, width)}px`);
    const existing = new Map([...track.children].map(card => [card.dataset.streamId, card]));
    const cards = Array.from({ length: Math.min(streamCapacity + 1, streamMessages.length) }, (_, offset) => {
      const message = streamMessages[(streamIndex + offset) % streamMessages.length];
      let card = existing.get(message.id);
      if (!card) {
        card = document.createElement('button');
        card.type = 'button';
        card.dataset.streamId = message.id;
        card.innerHTML = `<span>${escape(message.channel)}<b>${escape(getGroup(message)?.label || 'Message')}</b></span><p>${escape(message.text)}</p>`;
      }
      card.style.setProperty('--signal-color', groupColor(message));
      card.classList.toggle('is-current', offset === 0);
      card.tabIndex = offset < streamCapacity ? 0 : -1;
      card.setAttribute('aria-hidden', String(offset >= streamCapacity));
      return card;
    });
    track.replaceChildren(...cards);
    streamedId = streamMessages[streamIndex % streamMessages.length].id;
  };
  const advanceStream = () => {
    if (streamAnimation || streamMessages.length <= streamCapacity || motion.matches) return;
    const track = el('flow-stream-cards'), card = track.firstElementChild;
    if (!card || track.matches(':focus-within')) return;
    const generation = streamGeneration;
    const distance = card.getBoundingClientRect().height + 12;
    const animation = track.animate([{ transform: 'translateY(0)' }, { transform: `translateY(-${distance}px)` }], { duration: 550, easing: 'cubic-bezier(.22,.61,.36,1)', fill: 'forwards' });
    streamAnimation = animation;
    animation.finished.then(() => {
      if (generation !== streamGeneration || streamAnimation !== animation) return;
      streamIndex = (streamIndex + 1) % streamMessages.length;
      renderStream();
      animation.cancel();
      streamAnimation = null;
    }).catch(() => {});
  };
  const refreshStream = () => {
    const next = selection().filter(message => !excluded.has(message.id));
    const key = `${source}:${dimension}:${labelsFor()[dimension].join('|')}`;
    const changed = key !== streamScopeKey || next.length !== streamMessages.length || next.some((message, index) => message !== streamMessages[index]);
    if (changed) {
      cancelStreamTransition();
      el('flow-stream-cards').replaceChildren();
      streamMessages = next; streamScopeKey = key; streamIndex = 0; streamElapsed = 0;
    }
    renderStream();
  };
  const setInspection = () => { presenting = false; streamAnimation?.pause(); updatePlayback(); settling = 0; paused = true; paint(0); };
  const startPlayback = () => {
    if (motion.matches) { notice('Motion is reduced in your device settings. The map remains available for exploration.'); return; }
    presenting = true; selected = null; paused = false; refreshStream(); streamAnimation?.play(); updatePlayback(); renderPanel();
  };
  const clearSelection = () => { selectedGroup = null; selectedTopic = null; selected = null; topics = []; excluded.clear(); findingDraft = null; search = ''; pageSize = 30; };
  const coverage = () => {
    const summary = evidenceSummary(messages, messages);
    el('flow-coverage').textContent = source === 'demo' ? '' : `${number(summary.analyzed)} of ${number(summary.total)} analyzed · ${number(summary.total - summary.analyzed)} pending`;
    el('flow-total').textContent = source === 'demo' ? 'Signal' : number(selection().length);
    el('flow-core-caption').textContent = source === 'demo' ? 'message map' : 'messages in view';
    el('flow-coverage').title = source === 'demo' ? 'Generated messages with scripted classifications. No customer data or live analysis.' : '';
    const workspace = getWorkspace();
    el('flow-analyze').hidden = source !== 'workspace';
    const pending = selection().filter(message => message.source === 'pending').length;
    el('flow-analyze').textContent = busy ? 'Analyzing…' : `Analyze ${Math.min(20, pending)} pending`;
    el('flow-analyze').disabled = busy || !workspace.live || !pending;
    el('flow-analyze').title = workspace.live ? 'Confirm selected messages, context and rules before sending to Jev.' : 'Add a server-side provider key to analyze. Import and exploration work without one.';
    el('flow-present').disabled = !messages.length;
    updatePlayback();
  };
  const layout = () => {
    if (!w || !h) return;
    const mapped = messages.filter(message => (!selectedTopic || selectedTopic.ids.includes(message.id)) && (!search || `${message.text} ${message.context || ''}`.toLowerCase().includes(search.toLowerCase())));
    groups = flowGroups(mapped, dimension, labelsFor()[dimension]);
    const visible = groups.filter(group => group.count);
    const count = visible.length, columns = count <= 3 ? 2 : 3;
    const compact = w < 700;
    root.classList.toggle('flow-compact-map', compact);
    const graphTop = compact ? 370 : 0, graphHeight = Math.max(220, h - graphTop);
    const graphLeft = compact ? 0 : Math.min(280, w * .25) + 26, graphWidth = w - graphLeft;
    core = { x: graphLeft + graphWidth * .08, y: graphTop + graphHeight * .49 };
    const max = Math.max(1, ...(selectedTopic || search ? groups : flowGroups(allMessages, dimension, labelsFor()[dimension])).map(group => group.count));
    centers = groups.map((group, i) => {
      const order = visible.findIndex(item => item.index === group.index), col = Math.max(0, order) % columns, row = Math.floor(Math.max(0, order) / columns), rows = Math.ceil(count / columns);
      const focused = selectedGroup === i, focusMode = selectedGroup !== null;
      const radius = Math.min(graphWidth * .125, graphHeight * .15) * Math.sqrt(group.count / max);
      return {
        x: graphLeft + graphWidth * (focusMode ? (focused ? .64 : .32 + col * .26) : (count === 1 ? .62 : .32 + col * (count <= 3 ? .46 : .28))),
        y: graphTop + graphHeight * (focusMode ? (focused ? .38 : .76 + row * .14) : (count === 1 ? .49 : rows === 1 ? .48 : .18 + row * (.62 / Math.max(1, rows - 1)))),
        radius: radius * (focusMode ? focused ? 1.55 : .35 : 1), group,
      };
    });
    const old = new Map(dots.map(dot => [dot.message.id, dot])), ranks = groups.map(() => 0);
    dots = mapped.map((message, i) => {
      const groupIndex = Math.min(groups.length - 1, Math.max(0, message[dimension] || 0)), rank = ranks[groupIndex]++, center = centers[groupIndex];
      const previous = old.get(message.id);
      return { message, i, groupIndex, angle: rank * 2.3999632297, radius: center.radius * Math.sqrt((rank + .5) / Math.max(1, groups[groupIndex].count)), seed: message.seed ?? ((i * 31) % 1000) / 1000, x: previous?.x ?? core.x, y: previous?.y ?? core.y };
    });
    el('flow-labels').innerHTML = centers.filter(center => center.group.count).map(center => `<button data-flow-group="${center.group.index}" aria-pressed="${selectedGroup === center.group.index}" style="left:${center.x}px;top:${Math.min(h - 38, center.y + center.radius * .82 + 17)}px;--signal-color:${center.group.color}"><i></i>${escape(center.group.label)}<span>${number(center.group.count)}</span></button>`).join('');
    el('flow-core').style.left = `${core.x}px`; el('flow-core').style.top = `${core.y}px`;
    el('flow-empty').hidden = Boolean(mapped.length); settling = motion.matches || selected ? 0 : 1.8; paused = motion.matches || Boolean(selected); refreshStream(); paint(0);
  };
  const bezier = (a, b, c, d, t) => (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t * t * c + t ** 3 * d;
  const drawTracks = () => {
    context.lineWidth = 1;
    centers.forEach((center, i) => {
      if (!center.group.count) return;
      context.strokeStyle = `${center.group.color}1d`;
      for (let lane = -1; lane <= 1; lane++) {
        context.beginPath(); context.moveTo(core.x, core.y + lane * 7);
        context.bezierCurveTo(core.x + w * .16, core.y - h * .2 + lane * 20, center.x - w * .12, center.y + lane * 30, center.x, center.y); context.stroke();
      }
      context.save(); context.translate(center.x, center.y); context.rotate(clock * .05 * (i % 2 ? 1 : -1));
      context.strokeStyle = `${center.group.color}22`; context.setLineDash([3, 9]);
      context.beginPath(); context.ellipse(0, 0, center.radius * 1.2, center.radius * .94, 0, 0, Math.PI * 2); context.stroke(); context.restore();
    });
    context.strokeStyle = '#b4c3e419'; context.beginPath(); context.moveTo(w * .04, h * .43); context.bezierCurveTo(w * .19, h * .43, core.x - 50, core.y, core.x, core.y); context.stroke();
    for (let ring = 0; ring < 3; ring++) {
      context.strokeStyle = ring === 0 ? '#b5bded60' : '#b5bded16'; context.lineWidth = ring === 0 ? 1.5 : 1;
      const radius = (w < 600 ? 28 : 51) + ring * 14;
      context.beginPath(); context.arc(core.x, core.y, radius, clock * .18 + ring, clock * .18 + ring + Math.PI * (ring === 0 ? 1.65 : 2)); context.stroke();
    }
  };
  const paint = dt => {
    if (!w || !h) return;
    context.fillStyle = '#090e1c'; context.fillRect(0, 0, w, h);
    const grid = 36;
    context.fillStyle = '#687da826';
    for (let x = 18; x < w; x += grid) for (let y = 18; y < h; y += grid) context.fillRect(x, y, 1, 1);
    drawTracks();
    const ease = paused || motion.matches ? 1 : Math.min(1, dt * 5.8);
    const bins = centers.map(() => []);
    dots.forEach(dot => {
      const center = centers[dot.groupIndex];
      const a = dot.angle + clock * .20 * (dot.groupIndex % 2 ? 1 : -1);
      const breathing = 1 + Math.sin(clock * .65 + dot.seed * 7) * .04;
      const tx = center.x + Math.cos(a) * dot.radius * breathing;
      const ty = center.y + Math.sin(a) * dot.radius * .74 * breathing;
      dot.x += (tx - dot.x) * ease; dot.y += (ty - dot.y) * ease;
      bins[dot.groupIndex].push(dot);
    });
    bins.forEach((bin, i) => {
      context.fillStyle = centers[i].group.color; context.globalAlpha = selectedGroup !== null && selectedGroup !== i ? .12 : .72; context.beginPath();
      for (const dot of bin) { const radius = w < 600 ? .85 : dot.seed > .985 ? 2.5 : 1.15; context.moveTo(dot.x + radius, dot.y); context.arc(dot.x, dot.y, radius, 0, Math.PI * 2); }
      context.fill();
    });
    context.globalAlpha = 1;
    const flowing = selectedGroup === null ? dots : dots.filter(dot => dot.groupIndex === selectedGroup);
    const count = presenting ? Math.min(flowing.length, w < 600 ? 100 : 280) : 0;
    for (let i = 0; i < count; i++) {
      const dot = flowing[(i * 37) % flowing.length], center = centers[dot.groupIndex];
      const t = (clock * .16 + dot.seed + i / count) % 1;
      const before = Math.max(0, t - .045);
      const coords = v => [bezier(core.x, core.x + w * .16, center.x - w * .12, center.x, v), bezier(core.y, core.y - h * .2, center.y, center.y, v)];
      const [x, y] = coords(t), [px, py] = coords(before);
      context.strokeStyle = `${center.group.color}65`; context.lineWidth = 1; context.beginPath(); context.moveTo(px, py); context.lineTo(x, y); context.stroke();
      context.fillStyle = center.group.color; context.fillRect(x - 1.2, y - 1.2, 2.4, 2.4);
    }
    const focused = dots.find(dot => dot.message.id === (selected?.id || streamedId));
    if (focused) { context.strokeStyle = '#ffffffcc'; context.lineWidth = 1; context.beginPath(); context.arc(focused.x, focused.y, 7 + Math.sin(clock * 2) * 2, 0, Math.PI * 2); context.stroke(); }
  };
  const renderPanel = () => {
    const items = selection(), kept = items.filter(message => !excluded.has(message.id));
    el('flow-panel-scope').textContent = (source === 'demo' ? (selectedGroup !== null || selectedTopic || search ? `${number(kept.length)} matching messages` : 'Messages in view') : `${number(kept.length)} of ${number(messages.length)} messages in view`) + (excluded.size ? ` · ${items.length - kept.length} excluded` : '');
    el('flow-panel-title').textContent = selectedTopic?.label || (selectedGroup === null ? 'All messages' : groups[selectedGroup]?.label) || 'Messages';
    let html = '';
    if (selected) {
      html += `<section class="flow-evidence-detail"><div class="flow-detail-meta">${escape(selected.channel)}${selected.timestamp ? ` · ${escape(new Date(selected.timestamp).toLocaleString())}` : ''}</div><blockquote>${escape(selected.text)}</blockquote>${selected.context ? `<details><summary>Conversation context</summary><p class="flow-context">${escape(selected.context)}</p></details>` : ''}<p class="flow-evidence-meta">${escape(selected.evidence || selected.source)}<br>Source ID: ${escape(selected.sourceId || selected.id)}</p>${source === 'workspace' ? `<label>Reviewed category<select id="flow-correct"><option value="">Choose a correction…</option>${getWorkspace().categories.map(category => `<option value="${escape(category.id)}">${escape(category.label)}</option>`).join('')}</select></label><button data-open-response="${escape(selected.id)}">Original model response ↗</button>` : ''}<button id="flow-message-back">Back to evidence</button></section>`;
    }
    if (findingDraft) {
      html += `<form id="flow-finding-form"><label>Observation<textarea id="finding-title" maxlength="2000" required>${escape(findingDraft.title)}</textarea></label><label>Next action<textarea id="finding-action" maxlength="2000" placeholder="For example: update the FAQ or check the booking link.">${escape(findingDraft.action)}</textarea></label><p>${number(kept.length)} source messages will be attached. This does not establish lost sales or a trend.</p><button class="flow-solid" type="submit">Save finding with evidence</button><button id="flow-cancel-finding" type="button">Cancel</button></form>`;
    } else {
      html += `<div class="flow-panel-actions"><button id="flow-topics" ${items.length < 2 ? 'disabled' : ''}>Find repeated topics</button><button id="flow-save" ${kept.length ? '' : 'disabled'}>Save finding</button></div>`;
      if (topics.length) html += `<section class="flow-topics"><p>Suggested from repeated wording. Review the messages before using a topic.</p>${topics.map((topic, index) => `<button data-topic="${index}" aria-pressed="${selectedTopic === topic}">${escape(topic.label)} <b>${topic.count}</b></button>`).join('')}${source === 'workspace' ? '<button id="flow-use-topics">Use these topics as categories</button>' : ''}</section>`;
      html += `<label class="flow-evidence-search">Search this evidence<input id="flow-evidence-search" type="search" value="${escape(search)}" placeholder="Word or phrase"></label>`;
      const found = items.filter(message => `${message.text} ${message.context || ''}`.toLowerCase().includes(search.toLowerCase()));
      html += `<div class="flow-evidence-list">${found.slice(0, pageSize).map(message => `<div class="flow-evidence-row ${excluded.has(message.id) ? 'is-excluded' : ''}"><button data-evidence-id="${escape(message.id)}"><small>${escape(message.channel)}${message.source === 'pending' ? ' · Not analyzed' : ''}</small><p>${escape(message.text)}</p></button><label><input type="checkbox" data-evidence-keep="${escape(message.id)}" ${excluded.has(message.id) ? '' : 'checked'}>Keep</label></div>`).join('')}</div><p class="flow-page-count">${source === 'demo' && selectedGroup === null && !selectedTopic && !search ? `${Math.min(pageSize, found.length)} messages shown` : `${Math.min(pageSize, found.length)} of ${number(found.length)} matching messages`}</p>${pageSize < found.length ? '<button id="flow-more">Load 30 more</button>' : ''}`;
    }
    el('flow-panel').innerHTML = html;
    el('flow-topics')?.addEventListener('click', () => { topics = findRepeatedTopics(kept); if (!topics.length) notice('No repeated phrases found. Try a larger group, search a phrase or edit the category rules.'); renderPanel(); });
    el('flow-save')?.addEventListener('click', () => { findingDraft = { title: `${number(kept.length)} of ${number(messages.length)} messages in view concern ${selectedTopic?.label || (selectedGroup === null ? 'this selection' : groups[selectedGroup]?.label)}.`, action: '' }; renderPanel(); });
    el('flow-finding-form')?.addEventListener('submit', event => {
      event.preventDefault();
      try { findings.push(createFinding({ question: currentQuestion, title: el('finding-title').value, action: el('finding-action').value, messages: items, scope: messages, excluded, provenance: source === 'demo' ? 'Generated demo; scripted categories; manually selected evidence.' : 'User-selected evidence; model classifications are assessments.' })); findingDraft = null; el('flow-saved-count').textContent = findings.length; notice('Finding saved in this tab. Export it to keep the evidence.'); renderPanel(); }
      catch (error) { notice(error.message); }
    });
    el('flow-cancel-finding')?.addEventListener('click', () => { findingDraft = null; renderPanel(); });
    el('flow-correct')?.addEventListener('change', event => { if (!event.target.value) return; const id=selected.id; reviewMessage(id,event.target.value); loadWorkspace(); selected=messages.find(message=>message.id===id); renderPanel(); notice('Category corrected by you. Original model response retained.'); });
    el('flow-message-back')?.addEventListener('click', () => { selected = null; renderPanel(); });
    el('flow-more')?.addEventListener('click', () => { pageSize += 30; renderPanel(); });
    el('flow-use-topics')?.addEventListener('click', () => { useTopics(topics); loadWorkspace(); notice('Topic categories applied. Review their names in Categories & rules, then analyze pending messages.'); });
    el('flow-evidence-search')?.addEventListener('input', event => { const value = event.target.value, cursor = event.target.selectionStart; search = value; pageSize = 30; layout(); renderPanel(); el('flow-evidence-search').focus(); el('flow-evidence-search').setSelectionRange(cursor, cursor); });
    coverage();
  };
  const showDetails = message => {
    if (videoMode) { videoMode = false; root.classList.remove('flow-video'); el('flow-video').setAttribute('aria-pressed', 'false'); el('flow-video').textContent = 'Video view'; }
    setInspection(); selected = message; renderPanel(); paint(0);
  };
  const filter = () => { clearSelection(); messages = allMessages.filter(message => !el('flow-source').value || message.channel === el('flow-source').value); layout(); renderPanel(); coverage(); };
  const setDimension = value => { if (!dimensions[value]) return; clearSelection(); dimension = value; root.dataset.dimension = value; root.querySelectorAll('[data-dimension]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.dimension === value))); layout(); renderPanel(); };
  const resetData = () => {
    const channel = el('flow-source').value;
    el('flow-source').innerHTML = '<option value="">All sources</option>' + [...new Set(allMessages.map(message => message.channel))].map(value => `<option value="${escape(value)}">${escape(value)}</option>`).join('');
    if ([...el('flow-source').options].some(option => option.value === channel)) el('flow-source').value = channel;
    root.querySelectorAll('[data-dimension]').forEach(button => button.textContent = dimensionNames[button.dataset.dimension]);
    el('flow-question').value = currentQuestion;
    el('flow-question-note').textContent = source === 'demo' ? 'Select a group, filter a source or play the message stream.' : 'Uses your category definitions. Question changes need new analysis.';
    el('flow-data-toggle').textContent = source === 'demo' ? 'Use workspace data' : 'Explore message map';
    el('flow-provenance').textContent = source === 'demo' ? '' : 'Workspace data · results stay in this tab';
    filter();
  };
  const loadWorkspace = () => {
    const workspace = getWorkspace();
    if (!workspace.messages.length) { leave('import'); return; }
    source = 'workspace'; presenting = false; allMessages = workspace.messages; dimensions = workspace.dimensions; dimensionNames = workspace.dimensionNames; currentQuestion = workspace.question;
    datasetIdentity = workspace.datasetIdentity; dimension = 'intent'; resetData(); setDimension('intent');
  };
  const leave = (action, id) => { setInspection(); active = false; root.hidden = true; document.body.classList.remove('flow-mode'); openWorkbench(action, id); };
  const show = ({ workspace = false } = {}) => { root.hidden = false; document.body.classList.add('flow-mode'); active = true; last = 0; if (workspace || source === 'workspace' || getWorkspace().datasetIdentity !== datasetIdentity) loadWorkspace(); else layout(); };
  el('flow-workspace').onclick = () => leave('settings');
  el('flow-import').onclick = () => leave('import');
  el('flow-source').onchange = filter;
  el('flow-clear').onclick = () => { clearSelection(); layout(); renderPanel(); };
  el('flow-list-open').onclick = () => { clearSelection(); setInspection(); layout(); renderPanel(); };
  el('flow-research').onsubmit = event => { event.preventDefault(); if (busy) return; try { setQuestion(el('flow-question').value); loadWorkspace(); notice('Question applied. Pending messages need analysis with these rules.'); } catch (error) { notice(error.message); } };
  el('flow-data-toggle').onclick = () => { if (busy) return; if (source === 'demo') loadWorkspace(); else { source = 'demo'; allMessages = demoMessages; dimensions = flowDimensions; dimensionNames = { topic: 'Topic', intent: 'Intent', urgency: 'Urgency' }; currentQuestion = 'What are people talking about?'; dimension = 'topic'; resetData(); setDimension('topic'); } };
  el('flow-analyze').onclick = async () => {
    if (busy) return;
    const ids = selection().filter(message => message.source === 'pending' && !excluded.has(message.id)).slice(0, 20).map(message => message.id);
    busy = true; coverage(); root.querySelectorAll('button, input, select').forEach(control => control.disabled = true);
    try { await analyzeMessages(ids); } catch (error) { notice(error.message); }
    finally { busy = false; root.querySelectorAll('button, input, select').forEach(control => control.disabled = false); loadWorkspace(); }
  };
  el('flow-stream-cards').addEventListener('focusin', () => { if (presenting) setInspection(); });
  el('flow-present').onclick = () => { if (presenting) setInspection(); else startPlayback(); };
  el('flow-speed').onchange = () => { playbackSpeed = Number(el('flow-speed').value); streamElapsed = 0; };
  el('flow-video').onclick = () => {
    videoMode = !videoMode; root.classList.toggle('flow-video', videoMode);
    el('flow-video').setAttribute('aria-pressed', String(videoMode));
    el('flow-video').textContent = videoMode ? 'Exit video view' : 'Video view';
    if (videoMode) startPlayback();
  };
  el('flow-saved').onclick = () => { setInspection(); el('flow-findings-body').innerHTML = findings.length ? findings.map((finding, index) => `<article><h3>${index + 1}. ${escape(finding.observation)}</h3><p>${escape(finding.nextAction)}</p><small>${finding.coverage.selected} source messages · ${escape(finding.provenance)}</small><button data-finding-download="${index}">Export this finding</button></article>`).join('') : '<p>No findings yet. Select a group, inspect its messages, then choose Save finding.</p>'; el('flow-export').disabled = !findings.length; el('flow-findings').showModal(); };
  el('flow-findings-close').onclick = () => el('flow-findings').close();
  el('flow-export').onclick = () => download('signal-findings.json', findings);
  root.addEventListener('change', event => { if (event.target.dataset.evidenceKeep) { const id = event.target.dataset.evidenceKeep; event.target.checked ? excluded.delete(id) : excluded.add(id); refreshStream(); renderPanel(); paint(0); } });
  root.addEventListener('click', event => {
    const button = event.target.closest('button'); if (!button || busy) return;
    if (button.dataset.dimension) setDimension(button.dataset.dimension);
    if (button.hasAttribute('data-flow-group')) { const next = Number(button.dataset.flowGroup); const previous = selectedGroup; clearSelection(); selectedGroup = previous === next ? null : next; layout(); renderPanel(); }
    if (button.dataset.evidenceId) { const message = messages.find(item => item.id === button.dataset.evidenceId); if (message) showDetails(message); }
    if (button.hasAttribute('data-topic')) { const next = topics[Number(button.dataset.topic)]; selectedTopic = selectedTopic === next ? null : next; selected = null; excluded.clear(); pageSize = 30; layout(); renderPanel(); }
    if (button.dataset.streamId) { const message = messages.find(item => item.id === button.dataset.streamId); if (message) showDetails(message); }
    if (button.dataset.openResponse) leave('inspect', button.dataset.openResponse);
    if (button.hasAttribute('data-finding-download')) download('signal-finding.json', findings[Number(button.dataset.findingDownload)]);
  });
  canvas.onclick = event => { const rect = canvas.getBoundingClientRect(), x = event.clientX - rect.left, y = event.clientY - rect.top; let closest, distance = 144; for (const dot of dots) { const d = (x - dot.x) ** 2 + (y - dot.y) ** 2; if (d < distance) { distance = d; closest = dot; } } if (closest) showDetails(closest.message); };
  const animate = now => {
    const dt = Math.min(.05, (now - (last || now)) / 1000); last = now;
    if (active && !document.hidden && (settling > 0 || presenting && !motion.matches)) { paused = false; if (presenting) {
        clock += dt * (playbackSpeed === 50 ? 12 : playbackSpeed === 10 ? 4 : 1);
        streamElapsed += dt;
        const interval = 1.6;
        if (streamElapsed >= interval) { streamElapsed = 0; advanceStream(); }
      }
      paint(dt); settling = Math.max(0, settling - dt); }
    frame = requestAnimationFrame(animate);
  };
  motion.addEventListener('change', () => { if (motion.matches) setInspection(); });
  const resizeObserver = new ResizeObserver(entries => { const rect = entries[0].contentRect; if (!rect.width || !rect.height) return; cancelStreamTransition(); w = rect.width; h = rect.height; const scale = Math.min(devicePixelRatio || 1, 2); canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale); context.setTransform(scale, 0, 0, scale, 0, 0); layout(); });
  resizeObserver.observe(canvas); datasetIdentity = getWorkspace().datasetIdentity;
  document.body.classList.add('flow-mode'); resetData(); frame = requestAnimationFrame(animate);
  return { show, stop: () => { cancelAnimationFrame(frame); cancelStreamTransition(); resizeObserver.disconnect(); } };
};
