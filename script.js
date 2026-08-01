// script.js
// ----- STORAGE HELPERS -----
let storageAvailable = true;
const memoryStore = {};
function storageGet(key, fallback){
  try{ const v = localStorage.getItem(key); return v === null ? fallback : v; }
  catch(e){ storageAvailable = false; return (key in memoryStore) ? memoryStore[key] : fallback; }
}
function storageSet(key, value){
  try{ localStorage.setItem(key, value); return true; }
  catch(e){ storageAvailable = false; memoryStore[key] = value; if (e && e.name === 'QuotaExceededError') return 'quota'; return false; }
}

// ----- STATE -----
let tasks = [];
try { tasks = JSON.parse(storageGet('stl_tasks', '[]')); } catch(e) { tasks = []; }

let profile = {};
try { profile = JSON.parse(storageGet('stl_profile', '{}')); } catch(e) { profile = {}; }

let currentFilter = 'all';
let editingId = null;

function makeId(){ return window.crypto?.randomUUID?.() || 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2,10); }

// ----- INIT THEME / ACCENT / STYLE -----
const savedTheme = storageGet('stl_theme', 'dark');
const savedAccent = storageGet('stl_accent', '#00f0ff');
const savedFontSize = storageGet('stl_fontsize', '16');
const savedBg = storageGet('stl_bg', 'aurora');
const savedFont = storageGet('stl_font', 'poppins');
const savedCardStyle = storageGet('stl_cardstyle', 'capsule');

document.body.setAttribute('data-theme', savedTheme);
document.documentElement.style.setProperty('--accent', savedAccent);
document.documentElement.style.fontSize = savedFontSize + 'px';
document.getElementById('accentPicker').value = savedAccent;
document.getElementById('settingsColorPicker').value = savedAccent;
document.getElementById('themeSelect').value = savedTheme;
const fsInput = document.querySelector(`input[name="fontSize"][value="${savedFontSize}"]`);
if (fsInput) fsInput.checked = true;

const fontFamilies = { poppins:"'Poppins', sans-serif", baloo:"'Baloo 2', sans-serif", merri:"'Merriweather', serif", mono:"'Space Mono', monospace" };
function applyBg(style){ document.body.setAttribute('data-bg', style); storageSet('stl_bg', style); const r = document.querySelector(`input[name="bgStyle"][value="${style}"]`); if(r) r.checked = true; }
function applyFont(style){ document.documentElement.style.setProperty('--font-body', fontFamilies[style] || fontFamilies.poppins); storageSet('stl_font', style); const r = document.querySelector(`input[name="fontStyle"][value="${style}"]`); if(r) r.checked = true; }
function applyCardStyle(style){ 
  document.getElementById('taskList').setAttribute('data-style', style); 
  const weekList = document.getElementById('weekList');
  if (weekList) weekList.setAttribute('data-style', style);
  storageSet('stl_cardstyle', style); 
  const r = document.querySelector(`input[name="cardStyle"][value="${style}"]`); 
  if(r) r.checked = true; 
}
applyBg(savedBg); applyFont(savedFont); applyCardStyle(savedCardStyle);

document.querySelectorAll('input[name="bgStyle"]').forEach(r => r.addEventListener('change', e => { applyBg(e.target.value); showToast('Background updated'); }));
document.querySelectorAll('input[name="fontStyle"]').forEach(r => r.addEventListener('change', e => { applyFont(e.target.value); showToast('Font style updated'); }));
document.querySelectorAll('input[name="cardStyle"]').forEach(r => r.addEventListener('change', e => { applyCardStyle(e.target.value); showToast('Card style updated'); }));

function updateThemeIcon(){ const knob = document.querySelector('.theme-toggle .knob i'); knob.className = document.body.getAttribute('data-theme') === 'dark' ? 'fa-solid fa-moon' : 'fa-solid fa-sun'; }
updateThemeIcon();

function setAccent(hex){ document.documentElement.style.setProperty('--accent', hex); storageSet('stl_accent', hex); document.getElementById('accentPicker').value = hex; document.getElementById('settingsColorPicker').value = hex; }
document.getElementById('accentPicker').addEventListener('input', e => setAccent(e.target.value));
document.getElementById('settingsColorPicker').addEventListener('input', e => setAccent(e.target.value));
document.getElementById('themeToggle').addEventListener('click', () => { const now = document.body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'; document.body.setAttribute('data-theme', now); storageSet('stl_theme', now); document.getElementById('themeSelect').value = now; updateThemeIcon(); });
document.getElementById('themeSelect').addEventListener('change', e => { document.body.setAttribute('data-theme', e.target.value); storageSet('stl_theme', e.target.value); updateThemeIcon(); });
document.querySelectorAll('input[name="fontSize"]').forEach(r => r.addEventListener('change', e => { document.documentElement.style.fontSize = e.target.value + 'px'; storageSet('stl_fontsize', e.target.value); showToast('Font size updated'); }));

// ----- ROUTING HELPERS -----
function switchPage(pageId) {
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const activeNav = document.querySelector(`.nav-btn[data-page="${pageId}"]`);
  if (activeNav) activeNav.classList.add('active');
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + pageId).classList.add('active');
  document.getElementById('navLinks').classList.remove('open');
}

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    switchPage(btn.dataset.page);
    if (btn.dataset.page === 'add' && !editingId) resetForm();
  });
});

document.getElementById('homeAddBtn').addEventListener('click', () => {
  resetForm();
  switchPage('add');
});

document.getElementById('hamburger').addEventListener('click', () => { document.getElementById('navLinks').classList.toggle('open'); });

// ----- TOAST -----
function showToast(msg, icon = 'fa-circle-check'){
  const t = document.getElementById('toast');
  document.getElementById('toastMsg').textContent = msg;
  t.querySelector('i').className = 'fa-solid ' + icon;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}

// ----- SAVE -----
function save(){
  const result = storageSet('stl_tasks', JSON.stringify(tasks));
  if (result === 'quota') showToast('Storage full — export backup', 'fa-triangle-exclamation');
  else if (!storageAvailable) showToast('Session only (storage blocked)', 'fa-triangle-exclamation');
  render();
}

// ----- RENDER HELPERS -----
const statusLabel = { pending: 'Pending', progress: 'In Progress', completed: 'Completed' };
const statusClass = { pending: 'status-pending', progress: 'status-progress', completed: 'status-completed' };
const statusIcon  = { pending: 'fa-hourglass-half', progress: 'fa-spinner', completed: 'fa-circle-check' };
const priorityLabel = { low: 'Low', medium: 'Medium', high: 'High' };
const priorityClass = { low: 'priority-low', medium: 'priority-medium', high: 'priority-high' };

function escapeHTML(str){ const d = document.createElement('div'); d.textContent = str || ''; return d.innerHTML; }

function dueBadge(due){
  if(!due) return '';
  const today = new Date().toISOString().slice(0,10);
  if(due === today) return '<span class="due-badge due-today"><i class="fa-regular fa-clock"></i> Today</span>';
  if(due < today) return '<span class="due-badge due-overdue"><i class="fa-regular fa-circle-exclamation"></i> Overdue</span>';
  return `<span class="due-badge"><i class="fa-regular fa-calendar"></i> ${due}</span>`;
}

function subtaskHTML(subtasks){
  if(!subtasks || !subtasks.length) return '';
  return `<div class="subtask-list">${subtasks.map((s,i) => `<div class="subtask-item ${s.done?'done':''}"><input type="checkbox" ${s.done?'checked':''} data-task-idx="${i}" class="subtask-check"><span>${escapeHTML(s.text)}</span></div>`).join('')}</div>`;
}

function cardHTML(task, index){
  const num = String(index + 1).padStart(2, '0');
  const subtasks = task.subtasks || [];
  return `
    <div class="task-card" data-id="${task.id}">
      <div class="card-number">${num}</div>
      <div class="card-body">
        <div class="card-title ${task.status === 'completed' ? 'done' : ''}">
          ${escapeHTML(task.title)}
          <span class="priority-badge ${priorityClass[task.priority||'low']}">${priorityLabel[task.priority||'low']}</span>
          ${dueBadge(task.due)}
        </div>
        ${task.desc ? `<div class="card-desc">${escapeHTML(task.desc)}</div>` : ''}
        ${subtaskHTML(subtasks)}
        <div class="card-meta">
          <span class="card-category"><i class="fa-solid fa-folder"></i> ${escapeHTML(task.category)}</span>
          <span class="status-badge ${statusClass[task.status]}"><i class="fa-solid ${statusIcon[task.status]}"></i> ${statusLabel[task.status]}</span>
          ${task.recur && task.recur !== 'none' ? `<span class="card-category"><i class="fa-solid fa-rotate"></i> ${task.recur}</span>` : ''}
        </div>
      </div>
      <div class="card-actions">
        <button class="icon-btn success" onclick="cycleStatus('${task.id}')" title="Advance"><i class="fa-solid fa-check"></i></button>
        <button class="icon-btn" onclick="startEdit('${task.id}')" title="Edit"><i class="fa-solid fa-pen"></i></button>
        <button class="icon-btn danger" onclick="deleteTask('${task.id}')" title="Delete"><i class="fa-solid fa-trash"></i></button>
      </div>
    </div>`;
}

// ----- RENDER -----
function render(){
  // stats
  const total = tasks.length, done = tasks.filter(t => t.status === 'completed').length, pending = total - done;
  document.getElementById('statTotal').textContent = total;
  document.getElementById('statDone').textContent = done;
  document.getElementById('statPending').textContent = pending;

  // Home Page View
  const homeSearch = document.getElementById('homeSearchInput')?.value?.toLowerCase() || '';
  const weekList = document.getElementById('weekList');
  if (weekList) {
    let homeTasks = tasks;
    if (homeSearch) {
      homeTasks = homeTasks.filter(t => t.title.toLowerCase().includes(homeSearch) || t.category.toLowerCase().includes(homeSearch));
    }
    weekList.innerHTML = homeTasks.length ? homeTasks.map((t,i) => cardHTML(t,i)).join('') : `<div class="empty-state"><i class="fa-regular fa-calendar"></i>No tasks available</div>`;
  }

  // Tasks Page View
  let filtered = tasks;
  const searchInput = document.getElementById('searchInput');
  const search = searchInput?.value?.toLowerCase() || '';
  if (currentFilter !== 'all') filtered = filtered.filter(t => t.status === currentFilter);
  if (search) filtered = filtered.filter(t => t.title.toLowerCase().includes(search) || t.category.toLowerCase().includes(search));
  
  const sortSelect = document.getElementById('sortSelect');
  const sort = sortSelect?.value || 'default';
  if (sort === 'due') filtered.sort((a,b) => (a.due||'9999').localeCompare(b.due||'9999'));
  else if (sort === 'priority') { const p = {high:0, medium:1, low:2}; filtered.sort((a,b) => (p[a.priority||'low']||2) - (p[b.priority||'low']||2)); }
  
  const taskList = document.getElementById('taskList');
  if (taskList) {
    taskList.innerHTML = filtered.length ? filtered.map((t,i) => cardHTML(t,i)).join('') : `<div class="empty-state"><i class="fa-solid fa-magnifying-glass"></i>No tasks match</div>`;
  }
}

// ----- FILTER / SEARCH / SORT -----
const filterBar = document.getElementById('filterBar');
if(filterBar) {
  filterBar.addEventListener('click', e => {
    const chip = e.target.closest('.chip'); if (!chip) return;
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    currentFilter = chip.dataset.filter;
    render();
  });
}

document.getElementById('searchInput').addEventListener('input', render);
document.getElementById('homeSearchInput').addEventListener('input', render);
document.getElementById('sortSelect').addEventListener('change', render);

// ----- SUBTASK CHECK TOGGLE -----
document.addEventListener('change', (e) => {
  if (e.target.classList.contains('subtask-check')) {
    const card = e.target.closest('.task-card');
    if (!card) return;
    const id = card.dataset.id;
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    const idx = parseInt(e.target.dataset.taskIdx);
    if (!task.subtasks) task.subtasks = [];
    if (task.subtasks[idx]) task.subtasks[idx].done = e.target.checked;
    save();
  }
});

// ----- ADD / UPDATE TASK -----
document.getElementById('submitBtn').addEventListener('click', function() {
  const title = document.getElementById('fTitle').value.trim();
  const desc = document.getElementById('fDesc').value.trim();
  const category = document.getElementById('fCategory').value.trim();
  const due = document.getElementById('fDue').value;
  const priority = document.querySelector('input[name="fPriority"]:checked')?.value || 'low';
  const status = document.querySelector('input[name="fStatus"]:checked')?.value || 'pending';
  const recur = document.getElementById('fRecur').value;
  const rawSubtasks = document.getElementById('fSubtasks').value;
  
  const subtaskText = rawSubtasks ? rawSubtasks.split(',').map(s => s.trim()).filter(Boolean).map(text => ({ text, done: false })) : [];
  
  if (!title || !category){ 
    showToast('Title and category required', 'fa-triangle-exclamation'); 
    return; 
  }

  if (editingId){
    const t = tasks.find(t => t.id === editingId);
    if (t) {
      Object.assign(t, { title, desc, category, due, priority, status, recur, subtasks: subtaskText });
      showToast('✅ Task updated!');
    }
  } else {
    const newTask = { 
      id: makeId(), 
      title, 
      desc, 
      category, 
      due, 
      priority, 
      status, 
      recur, 
      subtasks: subtaskText 
    };
    tasks.push(newTask);
    showToast('✅ Task added!');
  }
  
  save();
  resetForm();
  switchPage('tasks');
});

function resetForm(){
  editingId = null;
  document.getElementById('taskForm').reset();
  document.getElementById('formEyebrow').textContent = 'New Entry';
  document.getElementById('formTitle').textContent = 'Add a Task';
  document.getElementById('submitBtn').innerHTML = '<i class="fa-solid fa-plus"></i> Add Task';
  document.getElementById('cancelEdit').style.display = 'none';
}

document.getElementById('cancelEdit').addEventListener('click', () => { 
  resetForm(); 
  switchPage('tasks'); 
});

// ----- ACTIONS -----
function startEdit(id){
  const t = tasks.find(t => t.id === id); if (!t) return;
  editingId = id;
  document.getElementById('fTitle').value = t.title;
  document.getElementById('fDesc').value = t.desc || '';
  document.getElementById('fCategory').value = t.category;
  document.getElementById('fDue').value = t.due || '';
  
  const prioInput = document.querySelector(`input[name="fPriority"][value="${t.priority||'low'}"]`);
  if (prioInput) prioInput.checked = true;
  
  const statInput = document.querySelector(`input[name="fStatus"][value="${t.status}"]`);
  if (statInput) statInput.checked = true;

  document.getElementById('fRecur').value = t.recur || 'none';
  document.getElementById('fSubtasks').value = (t.subtasks||[]).map(s => s.text).join(', ');
  
  document.getElementById('formEyebrow').textContent = 'Edit Entry';
  document.getElementById('formTitle').textContent = 'Edit Task';
  document.getElementById('submitBtn').innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Changes';
  document.getElementById('cancelEdit').style.display = 'block';
  
  switchPage('add');
}
window.startEdit = startEdit;

function deleteTask(id){
  tasks = tasks.filter(t => t.id !== id);
  save();
  showToast('🗑️ Task deleted', 'fa-trash');
}
window.deleteTask = deleteTask;

function cycleStatus(id){
  const order = ['pending', 'progress', 'completed'];
  const t = tasks.find(t => t.id === id);
  if (!t) return;
  t.status = order[(order.indexOf(t.status) + 1) % order.length];
  save();
  showToast('Status: ' + statusLabel[t.status]);
}
window.cycleStatus = cycleStatus;

// ----- PROFILE -----
document.getElementById('pName').value = profile.name || '';
document.getElementById('pEmail').value = profile.email || '';

function renderIdentity(){
  const card = document.getElementById('identityCard');
  const greeting = document.getElementById('homeGreeting');
  if (profile.name || profile.email){
    card.style.display = 'flex';
    document.getElementById('identityAvatar').textContent = (profile.name || profile.email || '?').trim().charAt(0).toUpperCase();
    document.getElementById('identityName').textContent = profile.name || 'No name';
    document.getElementById('identityEmail').textContent = profile.email || 'No email';
    greeting.textContent = profile.name ? `Welcome back, ${profile.name} 👋` : 'Welcome back 👋';
  } else { card.style.display = 'none'; greeting.textContent = 'Welcome back 👋'; }
}
renderIdentity();

document.getElementById('saveProfile').addEventListener('click', () => {
  const name = document.getElementById('pName').value.trim();
  const email = document.getElementById('pEmail').value.trim();
  if (!name && !email){ showToast('Add a name or email', 'fa-triangle-exclamation'); return; }
  profile = { name, email };
  storageSet('stl_profile', JSON.stringify(profile));
  renderIdentity();
  showToast('✅ Profile saved');
});

// ----- DATA EXPORT/IMPORT -----
document.getElementById('exportBtn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ tasks, profile }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); 
  a.href = url; 
  a.download = 'student-tasks.json'; 
  a.click();
  URL.revokeObjectURL(url);
  showToast('✅ Exported JSON', 'fa-file-export');
});

document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importFile').click());
document.getElementById('importFile').addEventListener('change', e => {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try{
      const data = JSON.parse(reader.result);
      if (Array.isArray(data.tasks)) tasks = data.tasks;
      if (data.profile) { 
        profile = data.profile; 
        storageSet('stl_profile', JSON.stringify(profile)); 
        document.getElementById('pName').value = profile.name || ''; 
        document.getElementById('pEmail').value = profile.email || ''; 
        renderIdentity(); 
      }
      save();
      showToast('✅ Imported', 'fa-file-import');
    } catch(err){ showToast('Invalid JSON', 'fa-triangle-exclamation'); }
  };
  reader.readAsText(file);
  e.target.value = '';
});

document.getElementById('deleteAllBtn').addEventListener('click', () => {
  if (!tasks.length) { showToast('Nothing to delete'); return; }
  if (confirm('Delete all tasks?')){ tasks = []; save(); showToast('✅ All tasks deleted', 'fa-trash'); }
});

// ----- INITIAL RENDER -----
render();