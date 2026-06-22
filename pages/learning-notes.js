// ─── 學習筆記頁面 ────────────────────────────

let _allNotes = [];
let _editingId = null;

// ─── 初始化 ──────────────────────────────────

window.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('navbar-root').innerHTML = renderNav('學習筆記');
  document.getElementById('e-date').value = new Date().toISOString().split('T')[0];
  await loadNotes();
});

async function loadNotes() {
  try {
    _allNotes = await getLearningNotes();
    renderNotes(_allNotes);
  } catch (e) {
    document.getElementById('notes-container').innerHTML =
      `<div class="inline-alert inline-alert-danger">載入失敗：${e.message}</div>`;
  }
}

// ─── 渲染 ─────────────────────────────────────

function renderNotes(notes) {
  const container = document.getElementById('notes-container');
  if (!notes.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📝</div>
        <div class="empty-state-text">尚無筆記，點右上角「＋ 新增筆記」開始記錄</div>
      </div>`;
    return;
  }

  const cards = notes.map(n => `
    <div class="note-card">
      <div class="note-card-header">
        <div class="note-card-title">${escHtml(n.title || '（無標題）')}</div>
        <div class="note-card-date">${n.date || ''}</div>
      </div>
      ${n.category ? `<div class="note-card-category">${escHtml(n.category)}</div>` : ''}
      <div class="note-card-content">${escHtml(n.content || '')}</div>
      ${n.source ? `<div class="note-card-source">來源：<a href="${escHtml(n.source)}" target="_blank">${escHtml(n.source)}</a></div>` : ''}
      <div class="note-card-actions">
        <button class="btn btn-secondary btn-sm" onclick="openEditModal('${n.id}')">編輯</button>
        <button class="btn btn-danger btn-sm" onclick="deleteNote('${n.id}')">刪除</button>
      </div>
    </div>`).join('');

  container.innerHTML = `<div class="notes-grid">${cards}</div>`;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── 搜尋 ─────────────────────────────────────

function doSearch() {
  const cat = document.getElementById('f-category').value;
  const kw  = document.getElementById('f-keyword').value.trim().toLowerCase();
  let filtered = _allNotes;
  if (cat) filtered = filtered.filter(n => n.category === cat);
  if (kw)  filtered = filtered.filter(n =>
    (n.title || '').toLowerCase().includes(kw) ||
    (n.content || '').toLowerCase().includes(kw)
  );
  renderNotes(filtered);
}

function clearSearch() {
  document.getElementById('f-category').value = '';
  document.getElementById('f-keyword').value = '';
  renderNotes(_allNotes);
}

// ─── Modal ────────────────────────────────────

function openAddModal() {
  _editingId = null;
  document.getElementById('modal-title').textContent = '新增學習筆記';
  document.getElementById('save-btn').textContent = '儲存';
  document.getElementById('e-title').value = '';
  document.getElementById('e-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('e-category').value = '';
  document.getElementById('e-source').value = '';
  document.getElementById('e-content').value = '';
  openModal('noteModal');
}

function openEditModal(id) {
  const note = _allNotes.find(n => n.id === id);
  if (!note) return;
  _editingId = id;
  document.getElementById('modal-title').textContent = '編輯學習筆記';
  document.getElementById('save-btn').textContent = '更新';
  document.getElementById('e-title').value = note.title || '';
  document.getElementById('e-date').value = note.date || '';
  document.getElementById('e-category').value = note.category || '';
  document.getElementById('e-source').value = note.source || '';
  document.getElementById('e-content').value = note.content || '';
  openModal('noteModal');
}

async function submitNote() {
  const title   = document.getElementById('e-title').value.trim();
  const date    = document.getElementById('e-date').value;
  const content = document.getElementById('e-content').value.trim();
  if (!title || !date || !content) {
    showToast('請填寫標題、日期與筆記內容', 'warning');
    return;
  }
  const data = {
    title,
    date,
    category: document.getElementById('e-category').value,
    source:   document.getElementById('e-source').value.trim(),
    content
  };
  const btn = document.getElementById('save-btn');
  btn.disabled = true;
  btn.textContent = '儲存中…';
  try {
    if (_editingId) {
      await updateLearningNote(_editingId, data);
      showToast('筆記已更新', 'success');
    } else {
      await addLearningNote(data);
      showToast('筆記已新增', 'success');
    }
    closeModal('noteModal');
    await loadNotes();
  } catch (e) {
    showToast('儲存失敗：' + e.message, 'danger');
  } finally {
    btn.disabled = false;
  }
}

async function deleteNote(id) {
  if (!confirmDialog('確定要刪除這則筆記嗎？')) return;
  try {
    await deleteLearningNote(id);
    showToast('筆記已刪除', 'success');
    await loadNotes();
  } catch (e) {
    showToast('刪除失敗：' + e.message, 'danger');
  }
}
