/* Грибна мапа ČR — frontend */
const REPO = 'demeshko-ops/hribni-mapa';
const PRIV_PATH = 'site/data/private.enc.json';
const API = `https://api.github.com/repos/${REPO}/contents/${PRIV_PATH}`;

const CLASSES = [[80,'#1a9641','Дуже висока'],[60,'#7cc46a','Висока'],[40,'#f2c12e','Середня'],[20,'#f28e2b','Слабка'],[0,'#d7301f','Низька']];
const INSTA = {id:'instagram', name:'Instagram', emoji:'📸', color:'#c13584'};
const DEFAULT_CATS = [{id:'osobni', name:'Особисті', emoji:'🍄', color:'#2f6f3e'}];
const EMOJIS = ['🍄','🟤','🟠','🟡','⭐','❤️','🌲','🌳','🏕️','🚗','🥾','💎','🔥','❓','🦌','💧'];
const COLORS = ['#2f6f3e','#1a9641','#8c510a','#d95f02','#e6ab02','#c13584','#7570b3','#1f78b4','#e7298a','#444444'];

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cls = v => CLASSES.find(c => v >= c[0]);
const store = {
  get(k){ try { return localStorage.getItem(k); } catch { return null; } },
  set(k,v){ try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k,v); } catch {} }
};

/* ---------- state ---------- */
let day = 0, G = null, PUB = [], idx = {};
let PRIV = null;            // {cats:[], spots:[]} when unlocked
let privExists = false, privEnc = null, privSha = null;
let password = store.get('hm_pass');
let token = store.get('hm_token');
let hidden = new Set(JSON.parse(store.get('hm_hidden') || '[]'));
let gridLayer, spotLayer, tmpMarker, meMarker, pickMode = false, editId = null;
let ncEmoji = EMOJIS[0], ncColor = COLORS[0];

/* ---------- map ---------- */
const map = L.map('map', {zoomControl:false, preferCanvas:true}).setView([49.8,15.4], 7);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom:18, attribution:'© OpenStreetMap · Open-Meteo'}).addTo(map);
const renderer = L.canvas({padding:.3});
const op = () => map.getZoom() >= 11 ? .22 : map.getZoom() >= 9 ? .35 : .5;
map.on('zoomend', () => gridLayer && gridLayer.eachLayer(l => l.setStyle({fillOpacity:op()})));

function cellAt(lat, lon){
  if (!G) return null;
  return idx[Math.round((lat-48.55)/G.dlat)+','+Math.round((lon-12.09)/G.dlon)];
}
const vals = c => day ? {s:c[6], a:c[7], t:c[8]} : {s:c[2], a:c[3], t:c[4]};
function growthHtml(c){
  if (!c) return '<span style="color:var(--muted)">Поза мапою ймовірності</span>';
  const v = vals(c), k = cls(v.s);
  return `<span class="pill" style="background:${k[1]}">${v.s}/100 · ${k[2]}</span><br>
  Вологість API30: <b>${v.a} мм</b> · T7: <b>${v.t ?? '–'} °C</b><br>Опади за 7 днів: <b>${c[5]} мм</b>`;
}
const route = (lat, lon) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;

function drawGrid(){
  if (gridLayer) gridLayer.remove();
  if (!G) return;
  gridLayer = L.layerGroup();
  const h = G.dlat/2, w = G.dlon/2;
  for (const c of G.cells){
    L.rectangle([[c[0]-h,c[1]-w],[c[0]+h,c[1]+w]], {renderer, stroke:false, fillColor:cls(vals(c).s)[1], fillOpacity:op(), interactive:false}).addTo(gridLayer);
  }
  gridLayer.addTo(map);
}

/* ---------- categories & spots ---------- */
const allCats = () => [INSTA, ...(PRIV ? PRIV.cats : DEFAULT_CATS)];
const catOf = id => allCats().find(c => c.id === id) || DEFAULT_CATS[0];
function allSpots(){
  const pub = PUB.map((s,i) => ({...s, id:'pub'+i, pub:true, cat:s.cat || 'instagram'}));
  return pub.concat(PRIV ? PRIV.spots : []);
}
function pinIcon(cat, score){
  const dot = score == null ? '' : `<i style="background:${cls(score)[1]}"></i>`;
  return L.divIcon({className:'', html:`<div class="pin" style="background:${cat.color}">${esc(cat.emoji)}${dot}</div>`, iconSize:[32,32], iconAnchor:[16,16], popupAnchor:[0,-16]});
}
const markers = {};
function drawSpots(){
  if (spotLayer) spotLayer.remove();
  spotLayer = L.layerGroup();
  const rows = [];
  for (const s of allSpots()){
    if (hidden.has(s.cat)) continue;
    const cat = catOf(s.cat), c = cellAt(s.lat, s.lon), v = c ? vals(c) : null;
    const title = s.area ? `${s.area}: ${s.name}` : (s.name || (s.note || '').split('\n')[0].slice(0, 40) || 'Без назви');
    let html = `<b>${cat.emoji} ${esc(title)}</b><br><small style="color:var(--muted)">${esc(cat.name)}${s.created ? ' · додано '+esc(s.created) : ''}</small>`;
    if (s.note) html += `<div class="note">${esc(s.note)}</div>`;
    html += `<div style="margin-top:4px">${growthHtml(c)}</div><div style="margin-top:6px"><a href="${route(s.lat,s.lon)}" target="_blank" rel="noopener">Маршрут у Google Maps →</a></div>`;
    if (!s.pub) html += `<div style="margin-top:6px"><a href="#" onclick="openEdit('${s.id}');return false">✏️ Редагувати</a></div>`;
    const m = L.marker([s.lat, s.lon], {icon:pinIcon(cat, v && v.s)}).bindPopup(html, {autoPanPaddingTopLeft:[10,150], autoPanPaddingBottomRight:[70,20]});
    m.addTo(spotLayer); markers[s.id] = m;
    rows.push({s, cat, v, title, m});
  }
  spotLayer.addTo(map);
  rows.sort((a,b) => (b.v ? b.v.s : -1) - (a.v ? a.v.s : -1));
  const list = $('list'); list.innerHTML = '';
  if (!rows.length) list.innerHTML = '<p>Немає місць у вибраних категоріях.</p>';
  for (const r of rows){
    const d = document.createElement('div'); d.className = 'row';
    const k = r.v ? cls(r.v.s) : ['', '#ccc'];
    d.innerHTML = `<b style="background:${k[1]}">${r.v ? r.v.s : '–'}</b><span>${esc(r.cat.emoji)} ${esc(r.title)}<em>${esc(r.s.note || r.cat.name)}</em></span>›`;
    d.onclick = () => { closeSheets(); map.setView([r.s.lat, r.s.lon], 12); r.m.openPopup(); };
    list.appendChild(d);
  }
  drawChips(); drawLegend();
  $('lockNote').hidden = !(privExists && !PRIV);
}
function drawChips(){
  const box = $('chips'); box.innerHTML = '';
  for (const c of allCats()){
    const b = document.createElement('button');
    b.className = 'chip' + (hidden.has(c.id) ? ' off' : '');
    b.textContent = `${c.emoji} ${c.name}`;
    b.onclick = () => { hidden.has(c.id) ? hidden.delete(c.id) : hidden.add(c.id); store.set('hm_hidden', JSON.stringify([...hidden])); drawSpots(); };
    box.appendChild(b);
  }
}
function drawLegend(){
  const used = new Set(allSpots().map(s => s.cat));
  $('legend').innerHTML = '<b>Шанс росту</b>' + CLASSES.map(c => `<div><i style="background:${c[1]}"></i>${c[2]} ${c[0]}+</div>`).join('')
    + allCats().filter(c => used.has(c.id)).map(c => `<div>${esc(c.emoji)} ${esc(c.name)}</div>`).join('');
}
function redraw(){ drawGrid(); drawSpots(); }

/* ---------- day toggle ---------- */
function setDay(d){ day = d; $('d0').classList.toggle('on', !d); $('d3').classList.toggle('on', !!d); map.closePopup(); redraw(); }
$('d0').onclick = () => setDay(0); $('d3').onclick = () => setDay(3);

/* ---------- sheets ---------- */
function closeSheets(){ document.querySelectorAll('.sheet').forEach(s => s.classList.remove('open')); }
function openSheet(id){ closeSheets(); $(id).classList.add('open'); }
document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => { closeSheets(); if (tmpMarker && !pickMode) { tmpMarker.remove(); tmpMarker = null; } });
$('bList').onclick = () => openSheet('sList');
$('unlockLink').onclick = e => { e.preventDefault(); askPassword(false).then(ok => ok && openSheet('sList')); };

/* ---------- location parsing ---------- */
function parseLoc(raw){
  let s = (raw || '').trim();
  if (!s) return null;
  try { s = decodeURIComponent(s); } catch {}
  if (/goo\.gl|maps\.app|mapy\.(cz|com)\/s\//i.test(s)) return {err:'short'};
  const ok = (a, b) => (Math.abs(a) <= 90 && Math.abs(b) <= 180) ? {lat:+a, lon:+b} : {err:'range'};
  let m;
  if ((m = s.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/))) return ok(m[1], m[2]);
  const mx = s.match(/[?&]x=(-?\d+\.\d+)/), my = s.match(/[?&]y=(-?\d+\.\d+)/);
  if (mx && my) return ok(my[1], mx[1]);   // Mapy.cz: x = lon, y = lat
  if ((m = s.match(/(\d{1,2})°\s*(\d{1,2})['′]\s*([\d.]+)["″]?\s*([NS])[\s,]*(\d{1,3})°\s*(\d{1,2})['′]\s*([\d.]+)["″]?\s*([EW])/i))){
    const lat = (+m[1] + m[2]/60 + m[3]/3600) * (/s/i.test(m[4]) ? -1 : 1);
    const lon = (+m[5] + m[6]/60 + m[7]/3600) * (/w/i.test(m[8]) ? -1 : 1);
    return ok(lat.toFixed(6), lon.toFixed(6));
  }
  if ((m = s.match(/(\d{1,2}\.\d+)°?\s*([NS])[\s,;]+(\d{1,3}\.\d+)°?\s*([EW])/i)))
    return ok(m[1] * (/s/i.test(m[2]) ? -1 : 1), m[3] * (/w/i.test(m[4]) ? -1 : 1));
  if ((m = s.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/))) return ok(m[1], m[2]);
  if ((m = s.match(/(-?\d{1,2}\.\d+)[\s,;+]+(-?\d{1,3}\.\d+)/))) return ok(m[1], m[2]);
  return {err:'none'};
}
window.parseLoc = parseLoc;
let curLoc = null;
function showLoc(){
  const r = parseLoc($('fLoc').value), msg = $('locMsg');
  curLoc = null;
  if (!r) { msg.innerHTML = ''; return; }
  if (r.err === 'short') { msg.innerHTML = '<div class="err">Короткі посилання (maps.app.goo.gl) не розпізнаються. У Google Maps затисніть точку і скопіюйте координати зверху (напр. 50.12345, 14.45678), або натисніть «Вибрати на мапі».</div>'; return; }
  if (r.err) { msg.innerHTML = '<div class="err">Не вдалося розпізнати координати.</div>'; return; }
  curLoc = r;
  const inCz = r.lat > 48.4 && r.lat < 51.2 && r.lon > 11.9 && r.lon < 19;
  msg.innerHTML = `<div class="ok">✓ ${r.lat.toFixed(5)}, ${r.lon.toFixed(5)}${inCz ? '' : ' (поза Чехією)'}</div>`;
  if (tmpMarker) tmpMarker.remove();
  tmpMarker = L.marker([r.lat, r.lon], {icon:L.divIcon({className:'', html:'<div class="pin tmp">＋</div>', iconSize:[32,32], iconAnchor:[16,16]})}).addTo(map);
  map.setView([r.lat, r.lon], Math.max(map.getZoom(), 11));
}
$('fLoc').addEventListener('input', showLoc);

/* ---------- add / edit ---------- */
function fillCats(sel){
  const s = $('fCat'); s.innerHTML = '';
  for (const c of allCats().filter(c => c.id !== 'instagram')) s.add(new Option(`${c.emoji} ${c.name}`, c.id));
  s.add(new Option('➕ Нова категорія…', '__new'));
  s.value = sel || store.get('hm_lastcat') || 'osobni';
  if (!s.value) s.value = 'osobni';
  $('newCat').hidden = s.value !== '__new';
}
$('fCat').onchange = () => { $('newCat').hidden = $('fCat').value !== '__new'; };
function buildPickers(){
  $('ncEmoji').innerHTML = EMOJIS.map(e => `<button type="button" data-e="${e}" class="${e===ncEmoji?'on':''}">${e}</button>`).join('');
  $('ncColor').innerHTML = COLORS.map(c => `<button type="button" data-c="${c}" class="${c===ncColor?'on':''}" style="background:${c}"></button>`).join('');
  $('ncEmoji').querySelectorAll('button').forEach(b => b.onclick = () => { ncEmoji = b.dataset.e; $('ncEmojiCustom').value = ''; buildPickers(); });
  $('ncColor').querySelectorAll('button').forEach(b => b.onclick = () => { ncColor = b.dataset.c; buildPickers(); });
}
buildPickers();

async function ensureUnlocked(){
  if (PRIV) return true;
  return askPassword(!privExists);
}
async function openAdd(lat, lon){
  if (privExists && !PRIV && !(await askPassword(false))) return;
  editId = null;
  $('addTitle').firstChild.textContent = 'Нове місце ';
  $('fLoc').value = lat != null ? `${lat.toFixed(6)}, ${lon.toFixed(6)}` : '';
  $('fName').value = ''; $('fNote').value = ''; $('saveMsg').innerHTML = '';
  $('bDel').hidden = true;
  fillCats();
  openSheet('sAdd'); showLoc();
}
window.openEdit = async id => {
  if (!PRIV) return;
  const s = PRIV.spots.find(x => x.id === id); if (!s) return;
  map.closePopup();
  editId = id;
  $('addTitle').firstChild.textContent = 'Редагувати місце ';
  $('fLoc').value = `${s.lat}, ${s.lon}`; $('fName').value = s.name || ''; $('fNote').value = s.note || '';
  $('saveMsg').innerHTML = ''; $('bDel').hidden = false;
  fillCats(s.cat); openSheet('sAdd'); showLoc();
};
window.addAt = (lat, lon) => { map.closePopup(); openAdd(lat, lon); };
$('bAdd').onclick = () => openAdd();

$('bHere').onclick = () => {
  if (!navigator.geolocation) return alert('Геолокація недоступна');
  $('locMsg').innerHTML = '<div class="ok">Визначаю позицію…</div>';
  navigator.geolocation.getCurrentPosition(p => {
    $('fLoc').value = `${p.coords.latitude.toFixed(6)}, ${p.coords.longitude.toFixed(6)}`; showLoc();
  }, () => { $('locMsg').innerHTML = '<div class="err">Не вдалося визначити позицію. Дозвольте доступ до геолокації.</div>'; }, {enableHighAccuracy:true, timeout:15000});
};
$('bPick').onclick = () => { pickMode = true; closeSheets(); $('pickHint').style.display = 'flex'; };
$('pickCancel').onclick = () => { pickMode = false; $('pickHint').style.display = 'none'; openSheet('sAdd'); };

map.on('click', e => {
  const {lat, lng} = e.latlng;
  if (pickMode){
    pickMode = false; $('pickHint').style.display = 'none';
    $('fLoc').value = `${lat.toFixed(6)}, ${lng.toFixed(6)}`; openSheet('sAdd'); showLoc(); return;
  }
  const c = cellAt(lat, lng);
  L.popup().setLatLng(e.latlng).setContent(
    `<b>${day ? 'Через 3 дні' : 'Сьогодні'}</b><br>${growthHtml(c)}<div style="margin-top:6px"><a href="${route(lat.toFixed(5), lng.toFixed(5))}" target="_blank" rel="noopener">Маршрут сюди →</a><br><a href="#" onclick="addAt(${lat},${lng});return false">＋ Додати місце тут</a></div>`
  ).openOn(map);
});

$('bSave').onclick = async () => {
  const msg = $('saveMsg');
  if (!curLoc) { msg.innerHTML = '<div class="err">Спершу вкажіть координати.</div>'; return; }
  if (!token) { msg.innerHTML = '<div class="err">Потрібен GitHub-токен для збереження. Відкрийте ⚙ Налаштування.</div>'; return; }
  let catId = $('fCat').value, newCat = null;
  if (catId === '__new'){
    const name = $('ncName').value.trim();
    if (!name) { msg.innerHTML = '<div class="err">Вкажіть назву нової категорії.</div>'; return; }
    catId = 'c' + Date.now().toString(36);
    newCat = {id:catId, name, emoji:$('ncEmojiCustom').value.trim() || ncEmoji, color:ncColor};
  }
  if (!(await ensureUnlocked())) { openSheet('sAdd'); return; }
  openSheet('sAdd');
  const spot = {
    id: editId || 's' + Date.now().toString(36),
    name: $('fName').value.trim(), note: $('fNote').value.trim(),
    lat: +curLoc.lat.toFixed(6), lon: +curLoc.lon.toFixed(6), cat: catId,
  };
  const id = editId;
  msg.innerHTML = '<div class="ok">Зберігаю…</div>'; $('bSave').disabled = true;
  try {
    await savePriv(st => {
      if (newCat) st.cats.push(newCat);
      const i = st.spots.findIndex(x => x.id === spot.id);
      if (i >= 0) st.spots[i] = {...st.spots[i], ...spot};
      else st.spots.push({...spot, created:new Date().toISOString().slice(0,10)});
    }, id ? 'Оновлено місце' : 'Додано місце');
    store.set('hm_lastcat', catId);
    if (tmpMarker) { tmpMarker.remove(); tmpMarker = null; }
    closeSheets(); drawSpots();
    setTimeout(() => markers[spot.id] && markers[spot.id].openPopup(), 50);
  } catch (e) {
    msg.innerHTML = `<div class="err">Не вдалося зберегти: ${esc(e.message)}</div>`;
  } finally { $('bSave').disabled = false; }
};
$('bDel').onclick = async () => {
  if (!editId || !confirm('Видалити це місце?')) return;
  const id = editId;
  try {
    await savePriv(st => { st.spots = st.spots.filter(x => x.id !== id); }, 'Видалено місце');
    if (tmpMarker) { tmpMarker.remove(); tmpMarker = null; }
    closeSheets(); drawSpots();
  } catch (e) { $('saveMsg').innerHTML = `<div class="err">${esc(e.message)}</div>`; }
};

/* ---------- crypto ---------- */
const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = s => Uint8Array.from(atob(s.replace(/\s/g,'')), c => c.charCodeAt(0));
async function deriveKey(pass, salt){
  const base = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2', salt, iterations:250000, hash:'SHA-256'}, base, {name:'AES-GCM', length:256}, false, ['encrypt','decrypt']);
}
async function encryptObj(obj, pass){
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({name:'AES-GCM', iv}, await deriveKey(pass, salt), enc.encode(JSON.stringify(obj)));
  return {v:1, alg:'PBKDF2-SHA256-250k/AES-256-GCM', salt:b64(salt), iv:b64(iv), ct:b64(new Uint8Array(ct))};
}
async function decryptObj(e, pass){
  const pt = await crypto.subtle.decrypt({name:'AES-GCM', iv:unb64(e.iv)}, await deriveKey(pass, unb64(e.salt)), unb64(e.ct));
  return JSON.parse(dec.decode(pt));
}

/* ---------- GitHub storage ---------- */
const ghHeaders = () => ({'Accept':'application/vnd.github+json', 'Authorization':`Bearer ${token}`, 'X-GitHub-Api-Version':'2022-11-28'});
async function fetchPriv(){
  if (token){
    const r = await fetch(API + '?ref=main&t=' + Date.now(), {headers:ghHeaders(), cache:'no-store'});
    if (r.status === 404) return {enc:null, sha:null};
    if (!r.ok) throw new Error(`GitHub ${r.status}`);
    const j = await r.json();
    return {enc: JSON.parse(dec.decode(unb64(j.content))), sha: j.sha};
  }
  const r = await fetch('data/private.enc.json', {cache:'no-cache'});
  if (!r.ok) return {enc:null, sha:null};
  return {enc: await r.json(), sha:null};
}
async function savePriv(mutate, message){
  const latest = await fetchPriv();
  let st = latest.enc ? await decryptObj(latest.enc, password) : {cats:[...DEFAULT_CATS], spots:[]};
  mutate(st);
  const e = await encryptObj(st, password);
  const body = {message: message + ' (зашифровано)', content: b64(enc.encode(JSON.stringify(e))), branch:'main'};
  if (latest.sha) body.sha = latest.sha;
  const r = await fetch(API, {method:'PUT', headers:{...ghHeaders(), 'Content-Type':'application/json'}, body:JSON.stringify(body)});
  if (!r.ok) { const t = await r.json().catch(() => ({})); throw new Error(`GitHub ${r.status}${t.message ? ': '+t.message : ''}`); }
  const j = await r.json();
  PRIV = st; privEnc = e; privSha = j.content.sha; privExists = true;
}

/* ---------- password ---------- */
let passResolve = null;
function askPassword(create){
  return new Promise(res => {
    passResolve = res;
    $('fPass').value = ''; $('fPass2').value = ''; $('unlockMsg').innerHTML = '';
    $('pass2Wrap').hidden = !create;
    $('unlockText').textContent = create
      ? 'Створіть пароль для особистих місць. Вони зберігатимуться зашифрованими. Запишіть пароль: без нього місця відновити неможливо.'
      : 'Введіть пароль, щоб побачити і редагувати особисті місця.';
    $('bUnlock').textContent = create ? 'Створити' : 'Відкрити';
    $('bUnlock').dataset.create = create ? '1' : '';
    openSheet('sUnlock'); setTimeout(() => $('fPass').focus(), 50);
  });
}
$('bUnlock').onclick = async () => {
  const p = $('fPass').value, create = !!$('bUnlock').dataset.create, msg = $('unlockMsg');
  if (p.length < 6) { msg.innerHTML = '<div class="err">Мінімум 6 символів.</div>'; return; }
  if (create){
    if (p !== $('fPass2').value) { msg.innerHTML = '<div class="err">Паролі не збігаються.</div>'; return; }
    password = p; PRIV = {cats:[...DEFAULT_CATS], spots:[]};
  } else {
    try { PRIV = await decryptObj(privEnc, p); password = p; }
    catch { msg.innerHTML = '<div class="err">Неправильний пароль.</div>'; return; }
  }
  if ($('fRemember').checked) store.set('hm_pass', password);
  closeSheets(); drawSpots(); updateSettings();
  if (passResolve) { passResolve(true); passResolve = null; }
};
document.querySelectorAll('#sUnlock [data-close]').forEach(b => b.addEventListener('click', () => { if (passResolve) { passResolve(false); passResolve = null; } }));

/* ---------- settings ---------- */
function updateSettings(){
  $('fToken').value = token ? '••••••••' + token.slice(-4) : '';
  $('privState').textContent = !privExists && !PRIV ? 'Особистих місць ще немає. Пароль задасте під час першого збереження.'
    : PRIV ? `Розблоковано: ${PRIV.spots.length} місць, ${PRIV.cats.length} категорій.` : 'Заблоковано.';
}
$('bSet').onclick = () => { updateSettings(); $('tokMsg').innerHTML = ''; openSheet('sSet'); };
$('bToken').onclick = async () => {
  const v = $('fToken').value.trim(), msg = $('tokMsg');
  if (v && !v.startsWith('••')) token = v;
  if (!token) { msg.innerHTML = '<div class="err">Вставте токен.</div>'; return; }
  msg.innerHTML = '<div class="ok">Перевіряю…</div>';
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}`, {headers:ghHeaders()});
    const j = await r.json();
    if (!r.ok) throw new Error(j.message || r.status);
    if (!j.permissions || !j.permissions.push) throw new Error('токен без права запису (Contents: Read and write)');
    store.set('hm_token', token); updateSettings();
    msg.innerHTML = '<div class="ok">✓ Токен працює. Можна додавати місця.</div>';
    await loadPriv();
  } catch (e) { msg.innerHTML = `<div class="err">Помилка: ${esc(e.message)}</div>`; }
};
$('bTokenDel').onclick = () => { token = null; store.set('hm_token', null); updateSettings(); $('tokMsg').innerHTML = '<div class="ok">Токен видалено з цього пристрою.</div>'; };
$('bLock').onclick = () => { password = null; store.set('hm_pass', null); if (privExists) PRIV = null; drawSpots(); updateSettings(); };
$('bExport').onclick = () => {
  if (!PRIV) { alert('Спершу розблокуйте особисті місця.'); return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(PRIV, null, 1)], {type:'application/json'}));
  a.download = 'hribni-mista-backup-' + new Date().toISOString().slice(0,10) + '.json';
  document.body.appendChild(a); a.click(); a.remove();
};

/* ---------- my location ---------- */
$('bLoc').onclick = () => {
  if (!navigator.geolocation) return alert('Геолокація недоступна');
  navigator.geolocation.getCurrentPosition(p => {
    const ll = [p.coords.latitude, p.coords.longitude];
    if (meMarker) meMarker.remove();
    meMarker = L.circleMarker(ll, {radius:7, color:'#fff', weight:3, fillColor:'#2a7de1', fillOpacity:1}).addTo(map)
      .bindPopup(`<b>Ви тут</b><br><a href="#" onclick="addAt(${ll[0]},${ll[1]});return false">＋ Додати місце тут</a>`);
    map.setView(ll, 12);
  }, () => alert('Не вдалося визначити позицію'), {enableHighAccuracy:true});
};

/* ---------- load ---------- */
async function loadPriv(){
  try {
    const f = await fetchPriv();
    privExists = !!f.enc; privEnc = f.enc; privSha = f.sha;
    if (!privExists) { PRIV = null; }
    else if (password) {
      try { PRIV = await decryptObj(privEnc, password); } catch { PRIV = null; password = null; store.set('hm_pass', null); }
    }
  } catch (e) { console.warn('private spots', e); }
  drawSpots();
}
Promise.all([
  fetch('data/grid.json', {cache:'no-cache'}).then(r => r.json()).catch(() => null),
  fetch('data/spots.json', {cache:'no-cache'}).then(r => r.json()).catch(() => []),
  fetch('data/cz.geojson').then(r => r.json()).catch(() => null)
]).then(([g, s, cz]) => {
  G = g; PUB = s;
  if (G) for (const c of G.cells) idx[Math.round((c[0]-48.55)/G.dlat)+','+Math.round((c[1]-12.09)/G.dlon)] = c;
  if (cz) L.geoJSON(cz, {style:{color:'#333', weight:1.5, fill:false}, interactive:false}).addTo(map);
  if (G) {
    const dt = new Date(G.date + 'T12:00:00');
    $('stamp').textContent = 'Дані на ' + (isNaN(dt) ? G.date : dt.toLocaleDateString('uk-UA', {day:'numeric', month:'long'})) + ' · оновлюється щодня';
    $('warn').hidden = !G.fake;
  } else $('stamp').textContent = 'Дані про погоду недоступні';
  redraw();
  loadPriv();
});
