// =============================================
// 水晶功效資料庫
// =============================================

let editingId = null;

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('navbar-root').innerHTML = renderNav('水晶功效');
  await loadEffects();
});

async function loadEffects(keyword = '') {
  const container = document.getElementById('effects-container');
  container.innerHTML = loadingState();
  try {
    const effects = await getCrystalEffects(keyword);
    renderEffects(effects);
  } catch(e) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div><div>${e.message}</div></div>`;
  }
}

function renderEffects(effects) {
  const container = document.getElementById('effects-container');
  if (!effects.length) {
    container.innerHTML = emptyState('📖', '尚無資料。點右上角「新增水晶」開始建立功效資料庫');
    return;
  }

  const cards = effects.map(e => {
    const tags = (e.tags || []).map(t => `<span class="tag">${t}</span>`).join('');
    return `
      <div class="effect-card">
        <div class="effect-card-name">💎 ${e.name}</div>
        <div class="effect-card-tags">${tags || '<span style="color:var(--text-muted);font-size:12px">無標籤</span>'}</div>
        <div class="effect-card-text">${e.effects || ''}</div>
        <div class="effect-card-actions">
          <button class="btn btn-secondary btn-sm" onclick="openEditModal('${e.id}')">✏️ 編輯</button>
          <button class="btn btn-danger btn-sm" onclick="deleteEffect('${e.id}', '${e.name}')">刪除</button>
        </div>
      </div>`;
  }).join('');

  container.innerHTML = `<div class="effect-cards">${cards}</div>`;
}

// ─── 查詢 ─────────────────────────────────

function doSearch() {
  const kw = document.getElementById('f-keyword').value.trim();
  loadEffects(kw);
}

function clearSearch() {
  document.getElementById('f-keyword').value = '';
  loadEffects();
}

// Enter 鍵查詢
document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('f-keyword');
  if (input) input.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
});

// ─── Modal 控制 ───────────────────────────

function openAddModal() {
  editingId = null;
  document.getElementById('modal-title').textContent = '＋ 新增水晶功效';
  document.getElementById('save-btn').textContent = '儲存';
  document.getElementById('e-name').value = '';
  document.getElementById('e-tags').value = '';
  document.getElementById('e-effects').value = '';
  openModal('effectModal');
}

async function openEditModal(id) {
  editingId = id;
  try {
    const snapshot = await db.collection(COLLECTIONS.CRYSTAL_EFFECTS).doc(id).get();
    if (!snapshot.exists) { showToast('找不到此資料', 'danger'); return; }
    const data = snapshot.data();
    document.getElementById('modal-title').textContent = '✏️ 編輯水晶功效';
    document.getElementById('save-btn').textContent = '儲存修改';
    document.getElementById('e-name').value = data.name || '';
    document.getElementById('e-tags').value = (data.tags || []).join(',');
    document.getElementById('e-effects').value = data.effects || '';
    openModal('effectModal');
  } catch(e) {
    showToast(`載入失敗：${e.message}`, 'danger');
  }
}

// ─── 儲存 ─────────────────────────────────

async function submitEffect() {
  const name = document.getElementById('e-name').value.trim();
  const tagsStr = document.getElementById('e-tags').value.trim();
  const effects = document.getElementById('e-effects').value.trim();

  if (!name) { showToast('請填寫水晶名稱', 'warning'); return; }
  if (!effects) { showToast('請填寫功效說明', 'warning'); return; }

  const tags = tagsStr ? tagsStr.split(/[,，]/).map(t => t.trim()).filter(Boolean) : [];
  const data = { name, effects, tags };

  const btn = document.getElementById('save-btn');
  btn.disabled = true; btn.textContent = '儲存中...';

  try {
    if (editingId) {
      await updateCrystalEffect(editingId, data);
      showToast('已更新！', 'success');
    } else {
      await addCrystalEffect(data);
      showToast('新增成功！', 'success');
    }
    closeModal('effectModal');
    const kw = document.getElementById('f-keyword').value.trim();
    await loadEffects(kw);
  } catch(e) {
    showToast(`儲存失敗：${e.message}`, 'danger');
  } finally {
    btn.disabled = false;
    btn.textContent = editingId ? '儲存修改' : '儲存';
  }
}

// ─── 刪除 ─────────────────────────────────

async function deleteEffect(id, name) {
  if (!confirmDialog(`確定要刪除「${name}」的功效資料嗎？`)) return;
  try {
    await deleteCrystalEffect(id);
    showToast('已刪除', 'success');
    const kw = document.getElementById('f-keyword').value.trim();
    await loadEffects(kw);
  } catch(e) {
    showToast(`刪除失敗：${e.message}`, 'danger');
  }
}
