// =============================================
// 設計款手鍊
// =============================================

let editingId = null;
let currentMaterials = [];
let crystalOptions = [];
let accessoryOptions = [];

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('navbar-root').innerHTML = renderNav('設計款手鍊');
  await loadDesigns();
  await preloadOptions();
});

// ─── 預載選項 ─────────────────────────────

async function preloadOptions() {
  try {
    crystalOptions = await getLatestCrystalCosts();
    accessoryOptions = await getLatestAccessoryCosts();
  } catch(e) { console.warn(e); }
}

// ─── 載入設計款列表 ───────────────────────

async function loadDesigns() {
  const container = document.getElementById('designs-container');
  container.innerHTML = loadingState();
  try {
    const designs = await getBraceletDesigns();
    if (!designs.length) {
      container.innerHTML = emptyState('✨', '尚無設計款，點右上角「新增設計款」建立第一款手鍊');
      return;
    }

    // 計算每款當前成本
    const cards = await Promise.all(designs.map(d => renderDesignCard(d)));
    container.innerHTML = `<div class="design-cards">${cards.join('')}</div>`;
  } catch(e) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div><div>${e.message}</div></div>`;
  }
}

async function renderDesignCard(design) {
  const currentCost = await calcBraceletCurrentCost(design.materials || []);
  const baseCost = design.baseCost || 0;
  const diff = currentCost - baseCost;
  const hasAlert = Math.abs(diff) >= 50;

  let alertHtml = '';
  if (hasAlert) {
    const dir = diff > 0 ? '上漲' : '下跌';
    alertHtml = `<div class="inline-alert inline-alert-${diff > 0 ? 'danger' : 'warning'} design-card-alert">
      ⚠️ 原料成本${dir} $${Math.abs(diff).toFixed(0)}，請確認售價
    </div>`;
  }

  const materialRows = (design.materials || []).map(m =>
    `<div class="material-row">
      <span>${m.displayName}</span>
      <span style="color:var(--primary)">× ${m.quantity} 顆</span>
    </div>`
  ).join('');

  const createdDate = design.createdAt
    ? (design.createdAt.toDate ? design.createdAt.toDate().toLocaleDateString('zh-TW') : '')
    : '';

  return `
    <div class="design-card">
      <div class="design-card-header">
        <div>
          <div class="design-card-name">${design.name}</div>
          <div class="design-card-base">建立：${createdDate}｜基準成本：${fmtCurrency(baseCost)}</div>
        </div>
        <div style="text-align:right">
          <div class="design-card-cost">${fmtCurrency(currentCost)}</div>
          <div style="font-size:12px;color:var(--text-muted)">當前成本</div>
        </div>
      </div>
      ${alertHtml}
      <div class="material-summary">${materialRows}</div>
      <div class="btn-group mt-16">
        <button class="btn btn-secondary btn-sm" onclick="openEditModal('${design.id}')">✏️ 編輯</button>
        <button class="btn btn-danger btn-sm" onclick="deleteDesign('${design.id}', '${design.name}')">刪除</button>
      </div>
    </div>`;
}

// ─── Modal 控制 ───────────────────────────

async function openAddModal() {
  editingId = null;
  currentMaterials = [];
  document.getElementById('d-name').value = '';
  document.getElementById('modal-title').textContent = '＋ 新增設計款手鍊';
  document.getElementById('save-btn').textContent = '儲存設計款';
  renderMaterialList();
  updateTotalCostPreview();
  await updateMaterialOptions();
  openModal('designModal');
}

async function openEditModal(id) {
  editingId = id;
  const design = await getBraceletDesign(id);
  if (!design) { showToast('找不到此設計款', 'danger'); return; }
  document.getElementById('d-name').value = design.name;
  document.getElementById('modal-title').textContent = '✏️ 編輯設計款手鍊';
  document.getElementById('save-btn').textContent = '儲存修改';
  currentMaterials = design.materials ? [...design.materials] : [];
  renderMaterialList();
  await updateTotalCostPreview();
  await updateMaterialOptions();
  openModal('designModal');
}

// ─── 材料選項 ─────────────────────────────

async function updateMaterialOptions() {
  const type = document.getElementById('m-type').value;
  const select = document.getElementById('m-item');
  select.innerHTML = '<option value="">-- 選擇品項 --</option>';

  const options = type === 'crystal' ? crystalOptions : accessoryOptions;
  options.forEach(item => {
    const o = document.createElement('option');
    if (type === 'crystal') {
      o.value = item.specKey;
      o.textContent = `${item.crystalName} ${item.size}mm ${item.typeB} ${item.typeA}｜${fmtCurrency(item.costPerBead)}/顆`;
      o.dataset.name = `${item.crystalName} ${item.size}mm ${item.typeB} ${item.typeA}`;
    } else {
      o.value = item.specKey;
      o.textContent = `[${item.itemCode}] ${item.productName || ''}${item.color ? ' · ' + item.color : ''}｜${fmtCurrency(item.costPerPiece)}/顆`;
      o.dataset.name = `[${item.itemCode}] ${item.productName || item.color || ''}`;
    }
    select.appendChild(o);
  });
}

function addMaterialRow() {
  const type = document.getElementById('m-type').value;
  const select = document.getElementById('m-item');
  const qty = parseInt(document.getElementById('m-qty').value);
  const specKey = select.value;
  const selectedOpt = select.selectedOptions[0];

  if (!specKey) { showToast('請選擇品項', 'warning'); return; }
  if (!qty || qty < 1) { showToast('請填寫使用顆數', 'warning'); return; }

  // 若已有相同品項，更新顆數
  const existing = currentMaterials.findIndex(m => m.specKey === specKey);
  if (existing >= 0) {
    currentMaterials[existing].quantity = qty;
  } else {
    currentMaterials.push({
      type,
      specKey,
      displayName: selectedOpt.dataset.name,
      quantity: qty
    });
  }

  document.getElementById('m-qty').value = '';
  renderMaterialList();
  updateTotalCostPreview();
}

function removeMaterial(specKey) {
  currentMaterials = currentMaterials.filter(m => m.specKey !== specKey);
  renderMaterialList();
  updateTotalCostPreview();
}

function renderMaterialList() {
  const container = document.getElementById('material-list');
  if (!currentMaterials.length) {
    container.innerHTML = `<div style="text-align:center;padding:16px;color:var(--text-muted);font-size:13px">尚未加入任何材料</div>`;
    return;
  }
  container.innerHTML = currentMaterials.map(m => `
    <div class="material-item">
      <span class="badge badge-${m.type === 'crystal' ? 'purple' : 'gold'}">${m.type === 'crystal' ? '水晶' : '配件'}</span>
      <span class="material-item-name">${m.displayName}</span>
      <span class="material-item-qty">× ${m.quantity} 顆</span>
      <span class="material-item-remove" onclick="removeMaterial('${m.specKey}')">✕</span>
    </div>`).join('');
}

async function updateTotalCostPreview() {
  const cost = await calcBraceletCurrentCost(currentMaterials);
  document.getElementById('total-cost-preview').textContent = fmtCurrency(cost);
}

// ─── 儲存 ─────────────────────────────────

async function submitDesign() {
  const name = document.getElementById('d-name').value.trim();
  if (!name) { showToast('請填寫手鍊名稱', 'warning'); return; }
  if (!currentMaterials.length) { showToast('請至少加入一種材料', 'warning'); return; }

  const btn = document.getElementById('save-btn');
  btn.disabled = true; btn.textContent = '儲存中...';

  try {
    const data = { name, materials: currentMaterials };
    if (editingId) {
      await updateBraceletDesign(editingId, data);
      showToast('設計款已更新！', 'success');
    } else {
      await addBraceletDesign(data);
      showToast('設計款新增成功！', 'success');
    }
    closeModal('designModal');
    await loadDesigns();
  } catch(e) {
    showToast(`儲存失敗：${e.message}`, 'danger');
  } finally {
    btn.disabled = false;
    btn.textContent = editingId ? '儲存修改' : '儲存設計款';
  }
}

// ─── 刪除 ─────────────────────────────────

async function deleteDesign(id, name) {
  if (!confirmDialog(`確定要刪除「${name}」嗎？`)) return;
  try {
    await deleteBraceletDesign(id);
    showToast('已刪除', 'success');
    await loadDesigns();
  } catch(e) {
    showToast(`刪除失敗：${e.message}`, 'danger');
  }
}
