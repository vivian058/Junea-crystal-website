// =============================================
// 靈感收藏
// =============================================

let allInventory = [];
let allInspirations = [];    // 全部靈感（客戶端篩選用）
let selectedFilters = new Set(); // 已選色系篩選
let selectedCrystals = [];
let selectedAccessories = [];
let editingId = null;

const ALL_COLORS = ['紅色系','橙色系','黃色系','綠色系','藍色系','紫色系','粉色系','白色系','黑色系','棕色系','灰色系','透明系','多色系','珍珠','米珠','深色系','淺色系'];

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('navbar-root').innerHTML = renderNav('靈感收藏');
  // 點外部關閉色系下拉
  document.addEventListener('click', e => {
    if (!e.target.closest('.color-picker-wrap')) closeColorPicker();
  });
  await loadAll();
});

// ─── 色系多選下拉 ────────────────────────────

function toggleColorPicker() {
  const dd = document.getElementById('color-dropdown');
  dd.classList.toggle('open');
  document.getElementById('color-trigger').classList.toggle('open', dd.classList.contains('open'));
}

function closeColorPicker() {
  document.getElementById('color-dropdown').classList.remove('open');
  document.getElementById('color-trigger').classList.remove('open');
}

function getSelectedColors() {
  return [...document.querySelectorAll('#color-dropdown input[type=checkbox]:checked')].map(c => c.value);
}

function setSelectedColors(tags) {
  document.querySelectorAll('#color-dropdown input[type=checkbox]').forEach(cb => {
    cb.checked = tags.includes(cb.value);
  });
  updateColorTrigger();
}

function updateColorTrigger() {
  const selected = getSelectedColors();
  const trigger = document.getElementById('color-trigger');
  const placeholder = document.getElementById('color-trigger-placeholder');
  if (selected.length) {
    placeholder.style.display = 'none';
    // 移除舊 tag span，重新插入
    trigger.querySelectorAll('.color-selected-tag').forEach(el => el.remove());
    selected.forEach(s => {
      const span = document.createElement('span');
      span.className = 'color-selected-tag';
      span.textContent = s;
      trigger.appendChild(span);
    });
  } else {
    placeholder.style.display = '';
    trigger.querySelectorAll('.color-selected-tag').forEach(el => el.remove());
  }
}

// 勾選時即時更新 trigger 顯示
document.addEventListener('change', e => {
  if (e.target.closest('#color-dropdown')) updateColorTrigger();
});

async function loadAll() {
  document.getElementById('insp-container').innerHTML = loadingState();
  try {
    const [inspirations, inventory] = await Promise.all([
      getInspirations(),
      getInventory()
    ]);
    allInventory = inventory;
    allInspirations = inspirations;
    fillCrystalDatalist();
    fillAccessoryDatalist();
    renderFilterBar();
    applyFilter();
  } catch(e) {
    document.getElementById('insp-container').innerHTML =
      `<div class="empty-state"><div class="empty-state-text">${e.message}</div></div>`;
  }
}

function renderFilterBar() {
  const bar = document.getElementById('filter-bar');
  const tags = ALL_COLORS.map(c => `
    <span class="filter-tag ${selectedFilters.has(c) ? 'active' : ''}" onclick="toggleFilter('${c}')">${c}</span>
  `).join('');
  const clearBtn = selectedFilters.size
    ? `<button class="filter-clear" onclick="clearFilter()">清除篩選</button>` : '';
  bar.innerHTML = tags + clearBtn;
}

function toggleFilter(color) {
  if (selectedFilters.has(color)) selectedFilters.delete(color);
  else selectedFilters.add(color);
  renderFilterBar();
  applyFilter();
}

function clearFilter() {
  selectedFilters.clear();
  renderFilterBar();
  applyFilter();
}

function applyFilter() {
  if (!selectedFilters.size) {
    renderCards(allInspirations);
    return;
  }
  const filtered = allInspirations.filter(item =>
    (item.tags || []).some(t => selectedFilters.has(t))
  );
  renderCards(filtered);
}

function fillCrystalDatalist() {
  const crystalInv = allInventory.filter(i => i.type === 'crystal');
  const names  = [...new Set(crystalInv.map(i => i.crystalName).filter(Boolean))].sort();
  const sizes  = [...new Set(crystalInv.map(i => i.size ? i.size + 'mm' : '').filter(Boolean))].sort();
  const shapes = [...new Set(crystalInv.map(i => i.typeB).filter(Boolean))].sort();
  fillDatalist(document.getElementById('dl-crystal-name'),  names);
  fillDatalist(document.getElementById('dl-crystal-size'),  sizes);
  fillDatalist(document.getElementById('dl-crystal-shape'), shapes);
}

function fillAccessoryDatalist() {
  const accInv = allInventory.filter(i => i.type === 'accessory');
  const names = [...new Set(accInv.map(i => i.productName).filter(Boolean))].sort();
  const sizes = [...new Set(accInv.map(i => i.spec).filter(Boolean))].sort();
  fillDatalist(document.getElementById('dl-acc-name'), names);
  fillDatalist(document.getElementById('dl-acc-size'), sizes);
}

// ─── 渲染卡片 ────────────────────────────────

function renderCards(list) {
  const container = document.getElementById('insp-container');
  if (!list.length) {
    container.innerHTML = emptyState('', '尚無收藏。點右上角「新增收藏」開始建立靈感庫');
    return;
  }
  const cards = list.map(item => {
    const tags = (item.tags || []).length
      ? `<div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:6px">${(item.tags).join('・')}</div>`
      : '';
    const cCount = (item.crystalMaterials || []).length;
    const aCount = (item.accessoryMaterials || []).length;
    const matText = [cCount ? `水晶 ${cCount} 項` : '', aCount ? `配件 ${aCount} 項` : ''].filter(Boolean).join('、');
    const imgHtml = item.imageUrl
      ? `<img class="insp-card-img" src="${item.imageUrl}" alt="靈感圖" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
      : '';
    const placeholderDisplay = item.imageUrl ? 'none' : 'flex';
    return `
      <div class="insp-card" onclick="openDetail('${item.id}')">
        ${imgHtml}
        <div class="insp-card-img-placeholder" style="display:${placeholderDisplay}">無圖片</div>
        <div class="insp-card-body">
          <div class="insp-card-tags">${tags}</div>
          ${item.notes ? `<div class="insp-card-notes">${item.notes}</div>` : ''}
          ${matText ? `<div class="insp-card-mat-count">${matText}</div>` : ''}
          <div class="insp-card-actions" onclick="event.stopPropagation()">
            <button class="btn btn-secondary btn-sm" onclick="openEditById('${item.id}')">編輯</button>
            <button class="btn btn-danger btn-sm" onclick="doDelete('${item.id}')">刪除</button>
          </div>
        </div>
      </div>`;
  }).join('');
  container.innerHTML = `<div class="insp-grid">${cards}</div>`;
}

// ─── 詳情 Modal ──────────────────────────────

async function openDetail(id) {
  const snapshot = await db.collection(COLLECTIONS.INSPIRATIONS).doc(id).get();
  if (!snapshot.exists) return;
  const item = { id: snapshot.id, ...snapshot.data() };

  // 左欄：圖片
  const imgCol = document.getElementById('detail-img-col');
  imgCol.innerHTML = item.imageUrl
    ? `<img src="${item.imageUrl}" alt="靈感圖">`
    : `<div class="detail-img-col-empty">無圖片</div>`;

  // 右欄：資訊
  const sourceHtml = item.sourceUrl
    ? `<div style="margin-bottom:10px;font-size:13px"><a href="${item.sourceUrl}" target="_blank" rel="noopener" style="color:var(--primary)">查看來源</a></div>`
    : '';
  const notesHtml = item.notes
    ? `<div style="font-size:14px;color:var(--text);margin-bottom:10px;white-space:pre-wrap">${item.notes}</div>`
    : '';
  const tagsHtml = (item.tags || []).length
    ? `<div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:10px">${item.tags.join('・')}</div>`
    : '';

  const crystalHtml = buildMatCompare(item.crystalMaterials || [], 'crystal');
  const accHtml = buildMatCompare(item.accessoryMaterials || [], 'accessory');
  const matSection = (crystalHtml || accHtml) ? `
    ${crystalHtml ? `<div class="mat-section-title">水晶材料</div><div class="mat-list">${crystalHtml}</div>` : ''}
    ${accHtml ? `<div class="mat-section-title" style="margin-top:14px">配件材料</div><div class="mat-list">${accHtml}</div>` : ''}
  ` : '<div style="color:var(--text-muted);font-size:13px">未記錄材料</div>';

  document.getElementById('detail-body').innerHTML = sourceHtml + tagsHtml + notesHtml + matSection;
  document.getElementById('detail-edit-btn').onclick = () => { closeModal('detailModal'); openEditById(id); };
  document.getElementById('detail-delete-btn').onclick = () => doDelete(id);
  openModal('detailModal');
}

function buildMatCompare(materials, type) {
  if (!materials.length) return '';
  return materials.map(m => {
    const badge = getInventoryBadge(m, type);
    return `
      <div class="mat-item">
        <div class="mat-item-name">${m.displayName}</div>
        ${badge}
      </div>`;
  }).join('');
}

function getInventoryBadge(mat, type) {
  const inv = allInventory.filter(i => i.type === type);

  if (!mat.isManual && mat.specKey) {
    // 從庫存選出的：直接比對 specKey
    const exact = inv.find(i => i.specKey === mat.specKey);
    if (exact) {
      if (exact.quantity > 0) return `<span class="mat-badge mat-badge-same">庫存有同款（${exact.quantity}${type === 'crystal' ? '顆' : '個'}）</span>`;
      return `<span class="mat-badge mat-badge-zero">同款庫存為 0</span>`;
    }
    // specKey 不在庫存，但同名水晶/配件有其他規格
    if (type === 'crystal' && mat.crystalName) {
      const similar = inv.filter(i => i.crystalName === mat.crystalName);
      if (similar.length) {
        const names = similar.map(i => i.displayName).join('、');
        return `<span class="mat-badge mat-badge-similar">類似款：${names}</span>`;
      }
    }
    if (type === 'accessory' && mat.productName) {
      const similar = inv.filter(i => i.productName === mat.productName);
      if (similar.length) {
        const names = similar.map(i => i.displayName).join('、');
        return `<span class="mat-badge mat-badge-similar">類似款：${names}</span>`;
      }
    }
    return `<span class="mat-badge mat-badge-none">庫存沒有</span>`;
  }

  // 手動輸入：關鍵字比對
  const kw = (mat.displayName || '').toLowerCase();
  let match = null;
  if (type === 'crystal') {
    match = inv.find(i => (i.crystalName || '').toLowerCase().includes(kw) || (i.displayName || '').toLowerCase().includes(kw));
  } else {
    match = inv.find(i => (i.productName || '').toLowerCase().includes(kw) || (i.displayName || '').toLowerCase().includes(kw));
  }
  if (match) {
    if (match.quantity > 0) return `<span class="mat-badge mat-badge-similar">可能類似款：${match.displayName}（${match.quantity}${type === 'crystal' ? '顆' : '個'}）</span>`;
    return `<span class="mat-badge mat-badge-zero">可能類似款（庫存為 0）：${match.displayName}</span>`;
  }
  return `<span class="mat-badge mat-badge-none">庫存沒有</span>`;
}


// ─── 新增/編輯 Modal ─────────────────────────

function openAddModal() {
  editingId = null;
  selectedCrystals = [];
  selectedAccessories = [];
  document.getElementById('edit-modal-title').textContent = '＋ 新增收藏';
  document.getElementById('edit-save-btn').textContent = '儲存';
  ['f-imageUrl','f-sourceUrl','f-notes'].forEach(id => document.getElementById(id).value = '');
  resetModalInputs();
  openModal('editModal');
}

async function openEditById(id) {
  const snapshot = await db.collection(COLLECTIONS.INSPIRATIONS).doc(id).get();
  if (!snapshot.exists) return;
  const item = snapshot.data();
  editingId = id;
  selectedCrystals = item.crystalMaterials || [];
  selectedAccessories = item.accessoryMaterials || [];
  document.getElementById('edit-modal-title').textContent = '編輯收藏';
  document.getElementById('edit-save-btn').textContent = '儲存修改';
  document.getElementById('f-imageUrl').value = item.imageUrl || '';
  document.getElementById('f-sourceUrl').value = item.sourceUrl || '';
  setSelectedColors(item.tags || []);
  document.getElementById('f-notes').value = item.notes || '';
  resetModalInputs(false);
  openModal('editModal');
}

function resetModalInputs(clearForm = true) {
  if (clearForm) {
    ['f-imageUrl','f-sourceUrl','f-notes'].forEach(id => document.getElementById(id).value = '');
    setSelectedColors([]);
  }
  ['crystal-search','crystal-manual-name','crystal-manual-size','crystal-manual-shape',
   'acc-search','acc-manual-name','acc-manual-size','acc-manual-color'].forEach(id => document.getElementById(id).value = '');
  renderSelectedCrystals();
  renderSelectedAccessories();
  document.getElementById('crystal-results').innerHTML = '';
  document.getElementById('acc-results').innerHTML = '';
}

async function submitInspiration() {
  const get = id => document.getElementById(id).value.trim();
  const data = {
    imageUrl: get('f-imageUrl'),
    sourceUrl: get('f-sourceUrl'),
    tags: getSelectedColors(),
    notes: get('f-notes'),
    crystalMaterials: selectedCrystals,
    accessoryMaterials: selectedAccessories
  };

  const btn = document.getElementById('edit-save-btn');
  btn.disabled = true; btn.textContent = '儲存中...';
  try {
    if (editingId) {
      await updateInspiration(editingId, data);
      showToast('已更新！', 'success');
    } else {
      await addInspiration(data);
      showToast('新增成功！', 'success');
    }
    closeModal('editModal');
    await loadAll();
  } catch(e) {
    showToast(`儲存失敗：${e.message}`, 'danger');
  } finally {
    btn.disabled = false;
    btn.textContent = editingId ? '儲存修改' : '儲存';
  }
}

// ─── 刪除 ────────────────────────────────────

async function doDelete(id) {
  if (!confirmDialog('確定要刪除這筆收藏嗎？')) return;
  try {
    await deleteInspiration(id);
    showToast('已刪除', 'success');
    closeModal('detailModal');
    await loadAll();
  } catch(e) {
    showToast(`刪除失敗：${e.message}`, 'danger');
  }
}

// ─── 材料選擇：水晶 ──────────────────────────

function searchCrystal(kw) {
  const results = document.getElementById('crystal-results');
  if (!kw.trim()) { results.innerHTML = ''; return; }
  const crystalInv = allInventory.filter(i => i.type === 'crystal');
  const matches = crystalInv.filter(i =>
    (i.crystalName || '').includes(kw) ||
    (i.displayName || '').includes(kw)
  ).slice(0, 10);
  if (!matches.length) {
    results.innerHTML = `<div style="font-size:13px;color:var(--text-muted);padding:6px 10px">找不到，可在下方手動輸入</div>`;
    return;
  }
  results.innerHTML = matches.map(i => `
    <div class="mat-selector-option" onclick="addCrystalFromInv(${JSON.stringify(i).replace(/"/g,'&quot;')})">
      ${i.displayName} <span style="color:var(--text-muted);font-size:12px">（庫存 ${i.quantity ?? 0} 顆）</span>
    </div>`).join('');
}

function addCrystalFromInv(inv) {
  if (selectedCrystals.find(m => m.specKey === inv.specKey)) {
    showToast('已加入', 'warning'); return;
  }
  selectedCrystals.push({
    specKey: inv.specKey,
    displayName: inv.displayName,
    crystalName: inv.crystalName,
    isManual: false
  });
  renderSelectedCrystals();
  document.getElementById('crystal-search').value = '';
  document.getElementById('crystal-results').innerHTML = '';
}

function addManualCrystal() {
  const name  = document.getElementById('crystal-manual-name').value.trim();
  const size  = document.getElementById('crystal-manual-size').value.trim();
  const shape = document.getElementById('crystal-manual-shape').value.trim();
  if (!name) { showToast('請至少填寫水晶名稱', 'warning'); return; }
  const parts = [name, size, shape].filter(Boolean);
  const displayName = parts.join(' ');
  if (selectedCrystals.find(m => m.displayName === displayName)) {
    showToast('已加入', 'warning'); return;
  }
  selectedCrystals.push({ displayName, crystalName: name, isManual: true });
  ['crystal-manual-name','crystal-manual-size','crystal-manual-shape'].forEach(id =>
    document.getElementById(id).value = '');
  renderSelectedCrystals();
}

function removeCrystal(idx) {
  selectedCrystals.splice(idx, 1);
  renderSelectedCrystals();
}

function renderSelectedCrystals() {
  document.getElementById('crystal-selected').innerHTML = selectedCrystals.map((m, i) =>
    `<span class="mat-tag ${m.isManual ? 'mat-tag-manual' : ''}">
      ${m.displayName}
      <span class="mat-tag-remove" onclick="removeCrystal(${i})">×</span>
    </span>`
  ).join('');
}

// ─── 材料選擇：配件 ──────────────────────────

function searchAccessory(kw) {
  const results = document.getElementById('acc-results');
  if (!kw.trim()) { results.innerHTML = ''; return; }
  const accInv = allInventory.filter(i => i.type === 'accessory');
  const matches = accInv.filter(i =>
    (i.productName || '').includes(kw) ||
    (i.itemCode || '').includes(kw) ||
    (i.displayName || '').includes(kw)
  ).slice(0, 10);
  if (!matches.length) {
    results.innerHTML = `<div style="font-size:13px;color:var(--text-muted);padding:6px 10px">找不到，可在下方手動輸入</div>`;
    return;
  }
  results.innerHTML = matches.map(i => `
    <div class="mat-selector-option" onclick="addAccessoryFromInv(${JSON.stringify(i).replace(/"/g,'&quot;')})">
      ${i.displayName || i.productName} <span style="color:var(--text-muted);font-size:12px">（庫存 ${i.quantity ?? 0} 個）</span>
    </div>`).join('');
}

function addAccessoryFromInv(inv) {
  if (selectedAccessories.find(m => m.specKey === inv.specKey)) {
    showToast('已加入', 'warning'); return;
  }
  selectedAccessories.push({
    specKey: inv.specKey,
    displayName: inv.displayName || inv.productName,
    productName: inv.productName,
    isManual: false
  });
  renderSelectedAccessories();
  document.getElementById('acc-search').value = '';
  document.getElementById('acc-results').innerHTML = '';
}

function addManualAccessory() {
  const name  = document.getElementById('acc-manual-name').value.trim();
  const size  = document.getElementById('acc-manual-size').value.trim();
  const color = document.getElementById('acc-manual-color').value.trim();
  if (!name) { showToast('請至少填寫配件名稱', 'warning'); return; }
  const parts = [name, size, color].filter(Boolean);
  const displayName = parts.join(' ');
  if (selectedAccessories.find(m => m.displayName === displayName)) {
    showToast('已加入', 'warning'); return;
  }
  selectedAccessories.push({ displayName, productName: name, isManual: true });
  ['acc-manual-name','acc-manual-size','acc-manual-color'].forEach(id =>
    document.getElementById(id).value = '');
  renderSelectedAccessories();
}

function removeAccessory(idx) {
  selectedAccessories.splice(idx, 1);
  renderSelectedAccessories();
}

function renderSelectedAccessories() {
  document.getElementById('acc-selected').innerHTML = selectedAccessories.map((m, i) =>
    `<span class="mat-tag ${m.isManual ? 'mat-tag-manual' : ''}">
      ${m.displayName}
      <span class="mat-tag-remove" onclick="removeAccessory(${i})">×</span>
    </span>`
  ).join('');
}
