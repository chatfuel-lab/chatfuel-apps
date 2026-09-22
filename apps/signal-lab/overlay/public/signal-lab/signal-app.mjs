import { mountSignalStage } from './flow-stage.mjs';
import { corpus, businesses } from './field-data.mjs';
import { palette, defaultConfig, generalConfig, presets, validateConfig, configSignature, normalizeAnswers, routeResult, routeNames, routeColors, parseMessages } from './signal-core.mjs';

const $ = id => document.getElementById(id);
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = v => `${Math.round(v * 100)}%`;
const format = v => v.toLocaleString('en-US');
const businessMap = Object.fromEntries(businesses.map(b => [b.id, b]));
const storageKey = 'signal-lab:classifier:2';
let config = structuredClone(generalConfig);
try { const stored = localStorage.getItem(storageKey); if (stored) config = validateConfig(JSON.parse(stored)); } catch { }
let signature = configSignature(config), messages = [], demo = [], dataset = 'demo', selectedId = null;
let unsaved = false, sourceFilter = '', touring = false, tourTimers = [], tourOriginal = null;
let view = 'map', lens = 'all', query = '', categoryFilter = '', filtered = [], shown = [], live = false, busy = false, stopRequested = false, importBuffer = null;
let width = 0, height = 0, points = [], animation = 0, selectionIndex = 0, listLimit = 250, draft;
const corrections = new Map();
const results = new Map(), canvas = $('map'), ctx = canvas.getContext('2d');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const keyFor = (m, sig = signature) => `${sig}\n${m.id}`;
const resultFor = m => results.get(keyFor(m));
const categoryFor = m => config.categories.find(c => c.id === resultFor(m)?.answers.intent.choice);
const colorFor = m => categoryFor(m)?.color || '#bdc9c1';
const routeFor = m => routeResult(resultFor(m)?.answers, config);
let toastTimer;
function toast(text) { $('toast').textContent = text; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 4200); }
function save() { try { localStorage.setItem(storageKey, JSON.stringify(config)); } catch { toast('Settings could not be saved in this browser. Download your config to keep it.'); } }
function download(name, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type })); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function api(path, body) {
  if (new URLSearchParams(location.search).has('sdk') && window.parent !== window) {
    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      const timer = setTimeout(() => { window.removeEventListener('message', handler); reject(new Error('The SDK connection timed out.')); }, 90000);
      function handler(event) {
        if (event.origin !== location.origin || event.source !== window.parent || event.data?.type !== 'signal:response' || event.data.id !== id) return;
        clearTimeout(timer); window.removeEventListener('message', handler);
        if (event.data.error) reject(new Error(event.data.error)); else resolve(event.data.body);
      }
      window.addEventListener('message', handler);
      window.parent.postMessage({ type: 'signal:request', id, path, body }, location.origin);
    });
  }
  const response = await fetch(`/api/signal/${path}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || `Request failed (${response.status}).`);
  return value;
}
function matchLens(m, name) {
  const a = resultFor(m)?.answers;
  return name === 'all' || name === 'pending' && !a || name === 'next' && routeFor(m) === 'next' || name === 'human' && routeFor(m) === 'human' || name === 'uncertain' && a && a.intent.confidence < config.policy.confidence;
}
function render() {
  filtered = messages.filter(m => (!sourceFilter || m.channel === sourceFilter) && (!query || `${m.text} ${m.name}`.toLowerCase().includes(query)));
  shown = filtered.filter(m => matchLens(m, lens) && (!categoryFilter || categoryFor(m)?.id === categoryFilter));
  if (!shown.some(m => m.id === selectedId)) selectedId = shown.find(m => /doorway/i.test(m.text))?.id || shown[0]?.id || null;
  $('message-count').textContent = format(shown.length);
  document.querySelector('.map-heading h1').innerHTML = 'Your messages.<br><em>Made clear.</em>';
  const sources=[...new Set(messages.map(m=>m.channel))]; $('source-filter').innerHTML='<option value="">All sources</option>'+sources.map(channel=>`<option value="${esc(channel)}">${esc(channel)}</option>`).join(''); $('source-filter').value=sourceFilter;
  $('group-strip').innerHTML=config.categories.map(c=>`<button data-category="${c.id}" style="--group:${c.color}" aria-pressed="${categoryFilter===c.id}"><span>${esc(c.label)}</span><strong>${format(filtered.filter(m=>categoryFor(m)?.id===c.id).length)}</strong><small>View messages ↗</small></button>`).join('');
  $('map-empty').hidden = shown.length > 0;
  $('dataset-name').textContent = dataset === 'demo' ? 'Mixed messages' : 'Your messages';
  $('dataset-description').textContent = `${format(messages.length)} ${dataset === 'demo' ? (messages.some(m => m.business === 'custom') ? 'demo + test messages' : 'synthetic messages') : 'imported messages'}`;
  $('dataset-source').textContent = dataset === 'demo' ? (messages.some(m => m.business === 'custom') ? 'Demo + your tests · real Jev responses' : 'Synthetic messages · real Jev responses') : 'Your dataset · stored in this tab';
  $('threshold').value = config.policy.confidence * 100; $('threshold-value').textContent = pct(config.policy.confidence);
  $('preset').value = presets.find(p => configSignature(p.config) === signature)?.id || 'custom';
  document.querySelectorAll('[data-lens]').forEach(b => { b.classList.toggle('active', lens === b.dataset.lens); b.setAttribute('aria-pressed', String(lens === b.dataset.lens)); b.querySelector('b').textContent = format(filtered.filter(m => matchLens(m, b.dataset.lens)).length); });
  document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', String(view === b.dataset.view)));
  $('plot').hidden = view === 'list'; $('message-list').hidden = view !== 'list';
  const pending = shown.filter(m => !resultFor(m)).length;
  $('analysis-banner').hidden = pending === 0 && !busy;
  if (!busy) $('analysis-copy').textContent = `${format(pending)} messages need analysis with “${config.name}”.`;
  $('analyze-button').textContent = `Analyze ${Math.min(20, pending)}`;
  $('analyze-button').disabled = !live || busy || pending === 0;
  $('analyze-button').title = live ? 'Sends up to 20 messages to the AI provider' : 'Configure a server-side provider key to enable analysis';
  $('stop-button').hidden = !busy;
  $('footer-note').textContent = busy ? 'Analyzing with Jev' : 'Explore without API calls';
  $('plot-note').textContent = view === 'priority' ? `${config.score.label} → · ${config.flag.label} ↑` : view === 'routes' ? 'Your policy, applied to model responses' : 'Click a group to explore its messages';
  $('legend').innerHTML = config.categories.map(c => `<button data-category="${c.id}" class="${categoryFilter === c.id ? 'active' : ''}" aria-pressed="${categoryFilter === c.id}"><i style="background:${c.color}"></i>${esc(c.label)}</button>`).join('');
  renderInspector();
  if (view === 'list') renderList(); else layout();
  $('preset').disabled = busy; $('settings-open').disabled = busy; $('import-open').disabled = busy||touring; $('try-open').disabled=busy||touring; $('tour-open').disabled=busy||touring; $('demo-load').disabled = busy;
}
function renderInspector() {
  const m = messages.find(m => m.id === selectedId), target = $('inspector-content');
  if (!m) { target.innerHTML = '<p class="inspector-empty">Pick a point or a message from the list to see its classification, score, and route.</p>'; return; }
  const r = resultFor(m), a = r?.answers;
  let html = `<div class="person"><div class="avatar">${esc(m.name.slice(0, 1))}</div><div><strong>${esc(m.name)}</strong><small>${esc(businessMap[m.business]?.name || m.channel)}</small></div></div><p class="message-text">“${esc(m.text)}”</p><div class="message-meta"><span>${esc(m.channel)}</span><span>${esc(m.id)}</span></div>`;
  if (!a) html += `<div class="pending-state">This message hasn’t been analyzed with your current questions.<br><br><button class="button primary" id="analyze-selected" ${!live || busy ? 'disabled' : ''}>Analyze this message</button></div>`;
  else {
    const route = routeFor(m), chosen = categoryFor(m);
    const bars = config.categories.map(c => ({ ...c, p: a.intent.probabilities[c.id] })).sort((x,y) => y.p-x.p);
    html += `<div class="result-header"><b>Classification</b><span class="badge">${pct(a.intent.confidence)} confidence</span></div>${bars.map(c => `<div class="probability-row"><span>${esc(c.label)}</span><div><i style="width:${c.p * 100}%;background:${c.color}"></i></div><b>${pct(c.p)}</b></div>`).join('')}
      <div class="score-block"><div><span>${esc(config.score.label)}</span><strong>${a.readiness.score.toFixed(2)}<small> / ${config.score.levels.length - 1}</small></strong><div class="meter"><i style="width:${a.readiness.score / (config.score.levels.length - 1) * 100}%"></i></div></div><div><span>${esc(config.flag.label)}</span><strong>${pct(a.urgent.noul)}</strong><div class="meter"><i style="width:${a.urgent.noul * 100}%;background:#b2b989"></i></div></div></div>
      <div class="route-card"><small>Suggested route</small><h3 style="color:${routeColors[route]}">${routeNames[route]}</h3><p>${a.needs_human.noul >= config.policy.review ? `${esc(config.review.label)} at ${pct(a.needs_human.noul)} exceeds your ${pct(config.policy.review)} threshold.` : a.intent.confidence < config.policy.confidence ? `Confidence is below your ${pct(config.policy.confidence)} threshold.` : chosen?.action === 'human' ? 'Your category rule sends this to a person.' : chosen?.action === 'separate' ? 'Your category rule uses a separate queue.' : `${esc(config.score.label)} is ${a.readiness.score >= config.policy.score ? 'at or above' : 'below'} your ${config.policy.score} threshold.`}</p></div>
      <p class="record-note">${r.source === 'recorded' ? 'Recorded model response' : 'Live model response'} · ${esc(r.model || 'Jev')}<br>${r.durationMs ?? '—'} ms · ${format(r.usage?.inputTokens || 0)} input tokens<br>Model assessment, not a verified outcome.</p>`;
  }
  target.innerHTML = html;
  $('analyze-selected')?.addEventListener('click', () => analyze([m]));
}
function renderList() {
  $('message-list').innerHTML = shown.slice(0, listLimit).map(m => `<button class="message-row ${m.id === selectedId ? 'selected' : ''}" data-message="${esc(m.id)}"><i style="background:${colorFor(m)}"></i><div><strong>${esc(m.name)}</strong><p>${esc(m.text)}</p></div><span>${esc(categoryFor(m)?.label || 'Pending')}</span></button>`).join('') + (shown.length > listLimit ? '<button class="button full" id="show-more">Show more messages</button>' : '');
}
function choose(id) { selectedId = id; renderInspector(); draw(1); if (view === 'list') renderList(); }
function hashSeed(id) { let n = 0; for (const c of id) n = (Math.imul(31, n) + c.charCodeAt(0)) >>> 0; return (n % 1000) / 1000; }
function layout() {
  if (!width || !height) return;
  cancelAnimationFrame(animation);
  const previous = new Map(points.map(p => [p.m.id, p])); points = []; const labels = [];
  const analyzed = shown.filter(m => resultFor(m)), pending = shown.filter(m => !resultFor(m));
  if (view === 'priority') {
    analyzed.forEach(m => { const a = resultFor(m).answers, seed = hashSeed(m.id); points.push({ m, tx: 30 + a.readiness.score / (config.score.levels.length - 1) * (width - 65) + (seed-.5)*15, ty: height-55-a.urgent.noul*(height-105)+(seed-.5)*15 }); });
    pending.forEach((m,i) => points.push({ m, tx: 18+(i%Math.max(1,Math.floor((width-36)/7)))*7, ty: height-23-Math.floor(i/Math.max(1,Math.floor((width-36)/7)))*7 }));
  } else if (view === 'routes') {
    const routes = ['next','clarify','human','separate', ...(pending.length ? ['pending'] : [])];
    const lane = (height-50)/routes.length;
    routes.forEach((route,i) => { const group = shown.filter(m => routeFor(m) === route), cy = 26+lane*i;
      labels.push({ x: Math.min(100,width*.25), y: cy+8, label: routeNames[route], color: routeColors[route], count: group.length });
      const cols = Math.max(1,Math.floor((width-36)/7)), gap = Math.min(7, (lane-30)/Math.max(1,Math.ceil(group.length/cols)));
      group.forEach((m,n) => points.push({ m, tx: 22+n%cols*7, ty: cy+30+Math.floor(n/cols)*gap }));
    });
  } else {
    const groups = config.categories.map(c => ({ ...c, items: shown.filter(m => resultFor(m)?.answers.intent.choice === c.id) })).filter(c => c.items.length);
    if (pending.length) groups.push({ id: null, pending: true, label: 'Not analyzed', color: '#93a89a', items: pending });
    const centers = groups.length === 1 ? [[.5,.48]] : groups.length === 2 ? [[.3,.43],[.73,.57]] : [[.31,.28],[.72,.25],[.52,.61],[.17,.68],[.81,.63],[.77,.86],[.26,.89],[.49,.91],[.49,.11]];
    const max = Math.max(1,...groups.map(g=>g.items.length));
    groups.forEach((g,i) => { const center = centers[i], cx=center[0]*width, cy=center[1]*(height-40)+10;
      const radius = Math.min(width*.205,height*.23) * (.38+.62*Math.sqrt(g.items.length/max));
      labels.push({ x:cx, y:cy+radius*.82+17, label:g.label, color:g.color, count:g.items.length, id:g.id, pending:g.pending });
      g.items.forEach((m,n) => { const angle=n*2.3999632297, r=radius*Math.sqrt((n+.7)/g.items.length); points.push({ m, tx:cx+Math.cos(angle)*r, ty:cy+Math.sin(angle)*r*.86 }); });
    });
  }
  points.forEach(p => { const old=previous.get(p.m.id); p.x=old?.x??width*.5; p.y=old?.y??height*.5; p.sx=p.x; p.sy=p.y; });
  $('cluster-labels').innerHTML = labels.map(g => `<button class="cluster-label" ${g.pending ? 'data-pending="true"' : g.id ? `data-category="${g.id}"` : ''} style="left:${g.x}px;top:${g.y}px;color:${g.color}"><b>${esc(g.label)}</b><span>${g.count}</span></button>`).join('');
  const start=performance.now(), duration=reduced.matches?0:650;
  function tick(now) { const t=duration?Math.min(1,(now-start)/duration):1; draw(1-Math.pow(1-t,3)); if(t<1)animation=requestAnimationFrame(tick); }
  animation=requestAnimationFrame(tick);
}
function draw(t=1) {
  ctx.clearRect(0,0,width,height);
  if (view === 'priority') {
    ctx.strokeStyle='#e6ece5';ctx.lineWidth=1;ctx.setLineDash([2,5]);
    for(let i=0;i<5;i++){const y=height-55-i*(height-105)/4;ctx.beginPath();ctx.moveTo(25,y);ctx.lineTo(width-20,y);ctx.stroke();}
    ctx.setLineDash([]);ctx.fillStyle='#96a297';ctx.font='10px sans-serif';ctx.fillText('High',6,35);ctx.fillText('Low',6,height-36);ctx.fillText('0',30,height-36);ctx.fillText(String(config.score.levels.length-1),width-35,height-36);
  }
  points.forEach(p => { p.x=p.sx+(p.tx-p.sx)*t;p.y=p.sy+(p.ty-p.sy)*t;ctx.beginPath();ctx.arc(p.x,p.y,shown.length<200?(width<420?3.2:4.4):(width<420?1.9:2.5),0,Math.PI*2);ctx.fillStyle=colorFor(p.m);ctx.globalAlpha=resultFor(p.m)?.answers.intent.confidence < config.policy.confidence ? .5 : .8;ctx.fill(); });
  ctx.globalAlpha=1;const p=points.find(p=>p.m.id===selectedId);
  if(p){ctx.beginPath();ctx.arc(p.x,p.y,9,0,Math.PI*2);ctx.fillStyle='#ffffff';ctx.fill();ctx.strokeStyle=colorFor(p.m);ctx.lineWidth=1.5;ctx.stroke();ctx.beginPath();ctx.arc(p.x,p.y,4,0,Math.PI*2);ctx.fillStyle=colorFor(p.m);ctx.fill();}
}
new ResizeObserver(entries => {
  const r=entries[0].contentRect;if(!r.width||!r.height)return;width=r.width;height=r.height;
  const d=Math.min(devicePixelRatio||1,2);canvas.width=width*d;canvas.height=height*d;ctx.setTransform(d,0,0,d,0,0);layout();
}).observe($('plot'));
function hit(event) { const r=canvas.getBoundingClientRect(),x=event.clientX-r.left,y=event.clientY-r.top;let found=null,best=169;for(const p of points){const distance=(x-p.x)**2+(y-p.y)**2;if(distance<best){best=distance;found=p;}}return found; }
canvas.addEventListener('click',e=>{const p=hit(e);if(p)choose(p.m.id);});
canvas.addEventListener('mousemove',e=>{const p=hit(e),tip=$('hover-tip');canvas.style.cursor=p?'pointer':'default';tip.hidden=!p;if(p){tip.textContent=p.m.text;tip.style.left=`${Math.max(0,Math.min(width-235,p.x+15))}px`;tip.style.top=`${Math.max(0,Math.min(height-100,p.y-50))}px`;}});
canvas.addEventListener('mouseleave',()=>$('hover-tip').hidden=true);
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
  if(b.dataset.lens){lens=b.dataset.lens;categoryFilter='';render();}
  if(b.dataset.view){view=b.dataset.view;render();}
  if(b.dataset.pending){lens='pending';categoryFilter='';render();}
  if(b.dataset.category){categoryFilter=categoryFilter===b.dataset.category?'':b.dataset.category;if(b.closest('#group-strip')){view='list';lens='all';}render();}
  if(b.dataset.message)choose(b.dataset.message);
  if(b.id==='show-more'){listLimit+=250;renderList();}
  if(b.hasAttribute('data-close'))b.closest('dialog').close();
});
$('search').addEventListener('input',e=>{query=e.target.value.toLowerCase();render();});
$('threshold').addEventListener('input',e=>{config.policy.confidence=Number(e.target.value)/100;save();render();});
function clearFilters(){lens='all';categoryFilter='';sourceFilter='';query='';$('search').value='';render();}
$('source-filter').onchange=e=>{sourceFilter=e.target.value;render();};$('groups-reset').onclick=()=>{clearFilters();view='map';render();};
$('clear-filters').onclick=clearFilters;$('fit-view').onclick=clearFilters;
$('next-message').onclick=()=>{if(shown.length){selectionIndex=(shown.findIndex(m=>m.id===selectedId)+1)%shown.length;choose(shown[selectionIndex].id);}};
$('preset').innerHTML=presets.map(p=>`<option value="${p.id}">${p.name}</option>`).join('')+'<option value="custom">Custom classifier</option>';
function applyConfig(value){config=validateConfig(value);signature=configSignature(config);categoryFilter='';lens='all';save();render();}
$('preset').onchange=e=>{const p=presets.find(p=>p.id===e.target.value);if(p){applyConfig(structuredClone(p.config));toast('Classifier applied. New questions need new analysis.');}else openSettings();};
function settingsHTML(){
  $('settings-body').innerHTML=`<label>Classifier name<input id="cfg-name" maxlength="60" value="${esc(draft.name)}" required></label><label>Context for these messages<textarea id="cfg-context" rows="2" maxlength="3000" placeholder="Used for every message. Leave blank to use the message’s own context.">${esc(draft.context)}</textarea></label><label>Classification question<textarea id="cfg-instruction" maxlength="1600" required>${esc(draft.instruction)}</textarea></label><div class="section-title">Categories<button type="button" id="add-category" class="text-button" ${draft.categories.length>=8?'disabled':''}>+ Add category</button></div><div id="category-editors">${draft.categories.map((c,i)=>`<div class="category-editor" data-index="${i}"><div class="category-top"><input type="color" aria-label="${esc(c.label)} color" data-field="color" value="${c.color}"><input data-field="label" aria-label="Category name" maxlength="40" value="${esc(c.label)}" required><select data-field="action" aria-label="Category route"><option value="score" ${c.action==='score'?'selected':''}>Use score</option><option value="human" ${c.action==='human'?'selected':''}>Human review</option><option value="separate" ${c.action==='separate'?'selected':''}>Separate queue</option></select><button type="button" class="icon-button" data-remove="${i}" aria-label="Remove ${esc(c.label)}" ${draft.categories.length<=2?'disabled':''}>×</button></div><textarea data-field="description" aria-label="Category definition" maxlength="600" required>${esc(c.description)}</textarea></div>`).join('')}</div><div class="section-title">Scoring</div><label>Score name<input id="cfg-score-label" maxlength="40" value="${esc(draft.score.label)}" required></label><label>What should the score measure?<textarea id="cfg-score-instruction" maxlength="1200" required>${esc(draft.score.instruction)}</textarea></label><label>Scale definitions — one level per line, starting at 0<textarea id="cfg-levels" rows="5" required>${esc(draft.score.levels.join('\n'))}</textarea></label><div class="settings-grid"><label>Signal name<input id="cfg-flag-label" maxlength="40" value="${esc(draft.flag.label)}" required></label><label>Review flag name<input id="cfg-review-label" maxlength="40" value="${esc(draft.review.label)}" required></label></div><div class="settings-grid"><label>Signal question<textarea id="cfg-flag-instruction" maxlength="1200" required>${esc(draft.flag.instruction)}</textarea></label><label>When is a person needed?<textarea id="cfg-review-instruction" maxlength="1200" required>${esc(draft.review.instruction)}</textarea></label></div><div class="section-title">Routing policy</div><div class="settings-grid"><label>Minimum score for the next step<input type="number" step="0.1" min="0" id="cfg-score-threshold" value="${draft.policy.score}" required></label><label>Human-review probability threshold (%)<input type="number" min="10" max="99" id="cfg-review-threshold" value="${draft.policy.review*100}" required></label></div><p class="settings-notice">Question changes need fresh model responses. Labels, colors and routing rules update immediately without API calls.</p>`;
  $('add-category').onclick=()=>{readDraft();draft.categories.push({id:`category_${Date.now().toString(36)}`,label:'New category',description:'Describe which messages belong here.',color:palette[draft.categories.length],action:'score'});settingsHTML();};
  document.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{readDraft();draft.categories.splice(Number(b.dataset.remove),1);settingsHTML();});
}
function readDraft(){draft.name=$('cfg-name').value;draft.context=$('cfg-context').value;draft.instruction=$('cfg-instruction').value;document.querySelectorAll('.category-editor').forEach(row=>{const c=draft.categories[Number(row.dataset.index)];row.querySelectorAll('[data-field]').forEach(input=>c[input.dataset.field]=input.value);});for(const key of ['score','flag','review']){draft[key].label=$(`cfg-${key}-label`).value;draft[key].instruction=$(`cfg-${key}-instruction`).value;}draft.score.levels=$('cfg-levels').value.split('\n').map(v=>v.trim()).filter(Boolean);draft.policy.score=Number($('cfg-score-threshold').value);draft.policy.review=Number($('cfg-review-threshold').value)/100;}
function openSettings(){draft=structuredClone(config);$('settings-error').textContent='';settingsHTML();$('settings-dialog').showModal();}
$('settings-open').onclick=openSettings;
$('settings-form').onsubmit=e=>{e.preventDefault();try{readDraft();applyConfig(draft);$('settings-dialog').close();toast('Classifier saved.');}catch(error){$('settings-error').textContent=error.message;}};
$('config-export').onclick=()=>{try{readDraft();download('signal-classifier.json',JSON.stringify(validateConfig(draft),null,2));}catch(e){$('settings-error').textContent=e.message;}};
$('config-load').onclick=()=>$('config-file').click();
$('config-file').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>60000)throw new Error('Config file is too large.');draft=validateConfig(JSON.parse(await file.text()));settingsHTML();$('settings-error').textContent='';}catch(error){$('settings-error').textContent=error.message;}finally{e.target.value='';}};
async function analyze(batch){
  if(busy||!batch.length)return;if(!confirm(`Send these ${batch.length} selected messages, their available conversation context and your classification rules to TypeSafe (Jev) for analysis?`))return;busy=true;stopRequested=false;const sig=signature,current=structuredClone(config);render();
  let completed=0,failed=0;
  try{
    for(let i=0;i<batch.length&&!stopRequested;i+=5){
      $('analysis-copy').textContent=`Analyzing ${Math.min(i+5,batch.length)} of ${batch.length} messages…`;
      const response=await api('analyze',{consent:{provider:'TypeSafe',confirmed:true,messageCount:Math.min(5,batch.length-i)},config:current,messages:batch.slice(i,i+5).map(m=>({id:m.id,text:m.text,context:m.context||'',channel:m.channel}))});
      if(response.signature!==sig)throw new Error('The server returned results for different questions.');
      for(const r of response.results){if(r.error){failed++;continue;}const m=batch.find(m=>m.id===r.id);if(m){normalizeAnswers(r,current);results.set(keyFor(m,sig),r);completed++;unsaved=true;}}
      render();
    }
    toast(`${completed} analyzed${failed?`, ${failed} failed — retry pending messages`:''}.`);
  }catch(error){toast(error.message);}finally{busy=false;render();}
}
$('analyze-button').onclick=()=>analyze(shown.filter(m=>!resultFor(m)).slice(0,20));
$('stop-button').onclick=()=>{stopRequested=true;$('analysis-copy').textContent='Stopping after the current request…';};
$('try-open').onclick=()=>{$('try-error').textContent='';$('try-dialog').showModal();};
$('try-form').onsubmit=async e=>{
  e.preventDefault();if(!live){$('try-error').textContent='Configure a server-side TYPESAFE_API_KEY to enable live analysis.';return;}
  if(!confirm('Send this message and its business context to TypeSafe (Jev) for analysis?'))return;
  $('try-submit').disabled=true;$('try-error').textContent='';const current=structuredClone(config),sig=signature;
  const m={id:`live-${crypto.randomUUID().slice(0,8)}`,name:'Your message',text:$('try-text').value.trim(),context:$('try-context').value.trim(),channel:'Manual test',business:'custom'};
  try{const r=await api('analyze',{consent:{provider:'TypeSafe',confirmed:true,messageCount:1},config:current,messages:[m]});if(r.signature!==sig||r.results[0]?.error)throw new Error(r.results[0]?.error||'Question mismatch.');normalizeAnswers(r.results[0],current);messages.push(m);unsaved=true;results.set(keyFor(m,sig),r.results[0]);selectedId=m.id;lens='all';categoryFilter='';sourceFilter='';query='';$('search').value='';$('try-dialog').close();render();toast('A real Jev response, added to your map.');}catch(error){$('try-error').textContent=error.message;}finally{$('try-submit').disabled=false;}
};
$('import-open').onclick=()=>{importBuffer=null;$('import-preview').textContent='';$('import-confirm').disabled=true;$('data-file').value='';$('paste-messages').value='';$('import-error').textContent='';$('import-dialog').showModal();};
$('data-file').onchange=async e=>{importBuffer=null;$('import-confirm').disabled=true;$('import-error').textContent='';$('import-preview').textContent='';try{const file=e.target.files[0];if(!file)return;if(file.size>5e6)throw new Error('Choose a file smaller than 5 MB.');importBuffer=parseMessages(await file.text(),file.name.toLowerCase().endsWith('.csv')?'csv':'json');$('import-preview').textContent=`${format(importBuffer.length)} messages ready. This replaces the current dataset in this tab.`;$('import-confirm').disabled=false;}catch(error){$('import-error').textContent=error.message;}finally{e.target.value='';}};
$('paste-preview').onclick=()=>{importBuffer=null;$('import-confirm').disabled=true;$('import-preview').textContent='';$('import-error').textContent='';try{importBuffer=parseMessages(JSON.stringify($('paste-messages').value.split(/\r?\n/).map(text=>text.trim()).filter(Boolean).map(text=>({text,channel:'Pasted text'}))));$('import-preview').textContent=`${format(importBuffer.length)} messages ready. Nothing has been sent for analysis.`;$('import-confirm').disabled=false;}catch(error){$('import-error').textContent=error.message;}};
$('import-confirm').onclick=()=>{if(!importBuffer)return;if(unsaved&&!confirm('Replace your current messages and analysis results? Export first to keep them.'))return;unsaved=false;messages=importBuffer;results.clear();dataset='imported';corrections.clear();selectedId=null;importBuffer=null;$('import-dialog').close();clearFilters();toast('Imported. Review your question, then analyze a sample.');$('workbench').hidden=true;signalStage.show({workspace:true});};
$('download-sample').onclick=()=>download('signal-messages.csv','text,name,channel,context\n"If it fits through a 75cm doorway, we can take it tomorrow.",Alex,Instagram,A furniture store\n"I was charged twice. Can someone help?",Maya,WhatsApp,A furniture store\n','text/csv');
$('export-open').onclick=()=>download('signal-results.json',JSON.stringify({version:1,exportedAt:new Date().toISOString(),source:dataset,config,messages:messages.map(m=>({...m,result:resultFor(m)||null,reviewedCategory:corrections.get(keyFor(m))||null}))},null,2));
$('about-open').onclick=()=>$('about-dialog').showModal();
async function loadDemo(){
  const record=window.__GENERAL_RESULTS__||await(await fetch('./general-results.json')).json();
  if(record.signature!==configSignature(generalConfig))throw new Error('Demo questions have changed. Regenerate the recorded demo.');
  results.clear();const sig=record.signature;
  demo=record.messages;
  for(const m of demo){const r=record.records[m.id];if(r){try{normalizeAnswers(r,generalConfig);results.set(keyFor(m,sig),{...r,source:'recorded'});}catch{}}}
  messages=[...demo];dataset='demo';selectedId=null;sourceFilter='';render();
}
$('demo-load').onclick=async()=>{if((dataset!=='demo'||unsaved)&&!confirm('Replace your current messages and analysis results with the synthetic demo? Export first to keep them.'))return;try{applyConfig(structuredClone(generalConfig));await loadDemo();unsaved=false;clearFilters();}catch(e){toast(e.message);}};
try{await loadDemo();}catch(error){$('map-subtitle').textContent='Could not load the demo. Check the connection and reload.';toast(error.message);}
if(document.documentElement.dataset.preview==='static'){$('connection').textContent='Recorded demo';}
else{try{const status=await api('status');live=status.live;$('connection').textContent=live?'Jev connected':'Recorded demo';}catch{$('connection').textContent='Recorded demo';}}
render();

function stopTour(){
  tourTimers.forEach(clearTimeout);tourTimers=[];touring=false;$('tour-bar').hidden=true;document.querySelector('main').inert=false;
  if(tourOriginal){view=tourOriginal.view;lens=tourOriginal.lens;categoryFilter=tourOriginal.categoryFilter;sourceFilter=tourOriginal.sourceFilter;query=tourOriginal.query;selectedId=tourOriginal.selectedId;config.policy.confidence=tourOriginal.confidence;$('search').value=query;tourOriginal=null;}
  render();
}
function playTour(){
  if(busy||touring)return;
  if(dataset!=='demo'){toast('Open the demo dataset to play the guided preview. Your imported messages stay unchanged.');return;}
  if(signature!==configSignature(generalConfig)){toast('Use the Everyday messages preset to play this demo.');return;}
  tourOriginal={view,lens,categoryFilter,sourceFilter,query,selectedId,confidence:config.policy.confidence};touring=true;document.querySelector('main').inert=true;$('tour-bar').hidden=false;
  lens='all';categoryFilter='';sourceFilter='';query='';$('search').value='';config.policy.confidence=.7;
  const steps=[
    ['01 / 04','Every message finds its group.',()=>{view='map';}],
    ['02 / 04','Click a message. See the signal.',()=>{view='list';categoryFilter='idea';selectedId=messages.find(m=>resultFor(m)?.answers.intent.choice==='idea')?.id;}],
    ['03 / 04','Set your rules. Build useful queues.',()=>{view='routes';categoryFilter='';}],
    ['04 / 04','Raise the bar. Review more decisions.',()=>{config.policy.confidence=.96;}],
  ];
  steps.forEach(([step,title,action],i)=>{const run=()=>{action();$('tour-step').textContent=step;$('tour-bar').dataset.step=String(i+1);$('tour-title').textContent=title;$('tour-progress').style.width=`${(i+1)*25}%`;render();};if(i===0)run();else tourTimers.push(setTimeout(run,i*2700));});
  tourTimers.push(setTimeout(stopTour,11500));
}
$('tour-open').onclick=playTour;$('tour-stop').onclick=stopTour;

const signalStage = mountSignalStage({
  getWorkspace: () => {
    const allChannels = [...new Set(messages.map(message => message.channel))];
    const channels = allChannels.length > 8 ? [...allChannels.slice(0, 7), 'Other sources'] : allChannels;
    return {
      live, question: config.instruction.split(/(?<=[?.!])\s/)[0], datasetIdentity: dataset + ':' + messages.map(message => message.id + message.text).join('|'),
      categories: config.categories.map(category => ({ id: category.id, label: category.label })),
      dimensionNames: { topic: 'Source', intent: 'Category', urgency: config.flag.label },
      dimensions: { topic: channels, urgency: ['Flagged ≥70%', 'Uncertain 30–70%', 'Not flagged <30%', 'Not analyzed'], intent: [...config.categories.map(category => category.label), 'Not analyzed'] },
      messages: messages.map(message => {
        const result = resultFor(message), corrected = corrections.get(keyFor(message));
        const categoryIndex = config.categories.findIndex(category => category.id === (corrected || result?.answers.intent.choice));
        return { ...message, originalId: message.id, seed: hashSeed(message.id), topic: Math.max(0, channels.includes(message.channel) ? channels.indexOf(message.channel) : channels.length - 1), intent: categoryIndex < 0 ? config.categories.length : categoryIndex, urgency: !result ? 3 : result.answers.urgent.noul >= .7 ? 0 : result.answers.urgent.noul >= .3 ? 1 : 2, source: result?.source || 'pending', reviewedCategory: corrected || null, evidence: corrected ? (result ? 'Human-corrected category; original model response retained.' : 'Human-labeled category; no model response yet.') : result ? `${result.source === 'recorded' ? 'Recorded' : 'Live'} Jev response` : 'Not analyzed · no classification result' };
      }),
    };
  },
  setQuestion: question => { if (question.trim() !== config.instruction.split(/(?<=[?.!])\s/)[0]) applyConfig({ ...config, instruction: question }); },
  analyzeMessages: ids => analyze(messages.filter(message => ids.includes(message.id))),
  reviewMessage: (id, category) => { if (!messages.some(message => message.id === id) || !config.categories.some(item => item.id === category)) return; corrections.set(keyFor(messages.find(message => message.id === id)), category); unsaved = true; },
  useTopics: topics => applyConfig({ ...config, name: 'Topics from your messages', categories: [...topics.slice(0, 6).map((topic, index) => ({ id: `topic_${index}`, label: topic.label.slice(0, 40), description: `Messages about ${topic.phrase}. Consider meaning and conversation context, not just an exact phrase.`, color: palette[index], action: 'score' })), { id: 'other', label: 'Other', description: 'None of the defined topics, or insufficient context.', color: palette[6], action: 'separate' }] }),
  openWorkbench: (action, id) => {
    $('workbench').hidden = false; render();
    if (id) { selectedId = id; renderInspector(); }
    if (action === 'import') $('import-open').click();
    if (action === 'settings') openSettings();
  },
});
$('flow-return').onclick = () => { if (touring) stopTour(); $('workbench').hidden = true; signalStage.show(); };

const sdkMode = new URLSearchParams(location.search).has('sdk') && window.parent !== window;
if (sdkMode) {
  $('inbox-import').hidden = false;
  $('inbox-description').textContent = 'Read incoming text from up to 10 recent WhatsApp or Instagram conversations in the selected workspace. Preview first; analysis is a separate action.';
  $('inbox-import').onclick = async () => {
    $('inbox-import').disabled = true; $('import-error').textContent = '';
    importBuffer = null; $('import-confirm').disabled = true;
    try {
      const response = await api('inbox');
      if (!response.messages?.length) throw new Error('No incoming text found in the recent conversations. Connect a WhatsApp or Instagram channel, or import a file.');
      importBuffer = parseMessages(JSON.stringify(response.messages), 'json');
      $('import-preview').textContent = `${importBuffer.length} messages ready. ${response.note} No messages sent to Jev.`;
      $('import-confirm').disabled = false;
    } catch (error) { $('import-error').textContent = error.message; }
    finally { $('inbox-import').disabled = false; }
  };
}
