// =============================================
// 設計款手鍊
// =============================================

let editingId = null;
let currentMaterials = [];
let currentChains = [];
let currentPackaging = [];
let currentLogistics = [];
let _lastTotalCost = 0;
let crystalOptions = [];
let accessoryOptions = [];
let chainOptions = [];

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('navbar-root').innerHTML = renderNav('設計款手鍊');
  await loadDesigns();
  await preloadOptions();
});

// ─── 預載選項 ─────────────────────────────

async function preloadOptions() {
  try {
    [crystalOptions, accessoryOptions, chainOptions] = await Promise.all([
      getLatestCrystalCosts(),
      getLatestAccessoryCosts(),
      getChainCosts()
    ]);
  } catch(e) { console.warn(e); }
}

// ─── 載入設計款列表 ───────────────────────

async function loadDesigns() {
  const container = document.getElementById('designs-container');
  container.innerHTML = loadingState();
  try {
    const designs = await getBraceletDesigns();
    if (!designs.length) {
      container.innerHTML = emptyState('', '尚無設計款，點右上角「新增設計款」建立第一款手鍊');
      return;
    }
    const cards = await Promise.all(designs.map(d => renderDesignCard(d)));
    container.innerHTML = `<div class="design-cards">${cards.join('')}</div>`;
  } catch(e) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-text">${e.message}</div></div>`;
  }
}

async function renderDesignCard(design) {
  const materialCost = await calcBraceletCurrentCost(design.materials || []);
  const chainTotal = (design.chainItems || []).reduce((s, i) => s + Number(i.totalCost || 0), 0);
  const packagingTotal = (design.packagingItems || []).reduce((s, i) => s + Number(i.cost || 0), 0);
  const logisticsTotal = (design.logisticsItems || []).reduce((s, i) => s + Number(i.cost || 0), 0);
  const currentCost = materialCost + chainTotal + packagingTotal + logisticsTotal;
  const baseCost = design.baseCost || 0;
  const diff = currentCost - baseCost;
  const hasAlert = Math.abs(diff) >= 50;

  let alertHtml = '';
  if (hasAlert) {
    const dir = diff > 0 ? '上漲' : '下跌';
    alertHtml = `<div class="inline-alert inline-alert-${diff > 0 ? 'danger' : 'warning'} design-card-alert">
      原料成本${dir} $${Math.abs(diff).toFixed(0)}，請確認售價
    </div>`;
  }

  const imgHtml = design.imageUrl
    ? `<img src="${design.imageUrl}" alt="${design.name}" style="width:100%;border-radius:6px;margin-bottom:12px;object-fit:cover;max-height:160px" onerror="this.style.display='none'">`
    : '';

  const materialRows = (design.materials || []).map(m => {
    const total = (m.unitCost || 0) * (m.quantity || 0);
    return `<div class="material-row"><span>${m.displayName} × ${m.quantity} 顆</span><span style="color:var(--primary)">${m.unitCost ? fmtCurrency(total) : ''}</span></div>`;
  }).join('');

  let chainRows = '';
  if ((design.chainItems || []).length) {
    chainRows = `<div style="font-size:12px;font-weight:600;color:var(--text-muted);margin-top:8px;padding-top:6px;border-top:1px dashed var(--border)">鍊條線材</div>` +
      (design.chainItems || []).map(i => `<div class="material-row"><span>${i.displayName} × ${i.lengthCm}cm</span><span style="color:var(--primary)">${fmtCurrency(Number(i.totalCost))}</span></div>`).join('');
  }

  let packagingRows = '';
  if ((design.packagingItems || []).length) {
    packagingRows = `<div style="font-size:12px;font-weight:600;color:var(--text-muted);margin-top:8px;padding-top:6px;border-top:1px dashed var(--border)">包裝</div>` +
      (design.packagingItems || []).map(i => `<div class="material-row"><span>${i.name}</span><span>${fmtCurrency(Number(i.cost))}</span></div>`).join('');
  }

  let logisticsRows = '';
  if ((design.logisticsItems || []).length) {
    logisticsRows = `<div style="font-size:12px;font-weight:600;color:var(--text-muted);margin-top:8px;padding-top:6px;border-top:1px dashed var(--border)">物流平台</div>` +
      (design.logisticsItems || []).map(i => `<div class="material-row"><span>${i.name}</span><span>${fmtCurrency(Number(i.cost))}</span></div>`).join('');
  }

  let profitHtml = '';
  if (design.sellingPrice) {
    const sp = Number(design.sellingPrice);
    const profit = sp - currentCost;
    const margin = sp > 0 ? (profit / sp * 100) : 0;
    const color = profit >= 0 ? 'var(--success,#2ea44f)' : 'var(--danger,#cf222e)';
    profitHtml = `<div style="background:var(--bg);border-radius:6px;padding:8px 12px;margin-top:8px;font-size:13px">
      <div class="material-row"><span>售價</span><span style="font-weight:700">${fmtCurrency(sp)}</span></div>
      <div class="material-row"><span>毛利</span><span style="font-weight:700;color:${color}">${fmtCurrency(profit)}</span></div>
      <div class="material-row"><span>毛利率</span><span style="font-weight:700;color:${color}">${margin.toFixed(1)}%</span></div>
    </div>`;
  }

  const createdDate = design.createdAt
    ? (design.createdAt.toDate ? design.createdAt.toDate().toLocaleDateString('zh-TW') : '')
    : '';

  return `
    <div class="design-card">
      ${imgHtml}
      <div class="design-card-header">
        <div>
          <div class="design-card-name">${design.name}</div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:2px">建立：${createdDate}</div>
        </div>
        <div style="text-align:right">
          <div class="design-card-cost">${fmtCurrency(currentCost)}</div>
          <div style="font-size:12px;color:var(--text-muted)">總成本</div>
        </div>
      </div>
      ${alertHtml}
      <div class="material-summary">
        ${materialRows}${chainRows}${packagingRows}${logisticsRows}
      </div>
      ${profitHtml}
      <div class="btn-group mt-16">
        <button class="btn btn-secondary btn-sm" onclick="openEditModal('${design.id}')">編輯</button>
        <button class="btn btn-danger btn-sm" onclick="deleteDesign('${design.id}', '${design.name}')">刪除</button>
      </div>
    </div>`;
}

// ─── Modal 控制 ───────────────────────────

async function openAddModal() {
  editingId = null;
  currentMaterials = [];
  currentChains = [];
  currentPackaging = [];
  currentLogistics = [];
  _lastTotalCost = 0;

  document.getElementById('d-name').value = '';
  document.getElementById('d-imageUrl').value = '';
  document.getElementById('d-sellingPrice').value = '';
  document.getElementById('d-targetMargin').value = '';
  document.getElementById('m-search').value = '';
  document.getElementById('m-qty').value = '';
  document.getElementById('ch-search').value = '';
  document.getElementById('ch-cm').value = '';
  document.getElementById('modal-title').textContent = '新增設計款手鍊';
  document.getElementById('save-btn').textContent = '儲存設計款';
  document.getElementById('profit-section').style.display = 'none';
  document.getElementById('suggested-section').style.display = 'none';

  updateMaterialOptions();
  updateChainOptions();
  renderMaterialList();
  renderChainList();
  renderPackagingList();
  renderLogisticsList();
  updateCostPreviews();
  openModal('designModal');
}

async function openEditModal(id) {
  editingId = id;
  const design = await getBraceletDesign(id);
  if (!design) { showToast('找不到此設計款', 'danger'); return; }

  currentMaterials = design.materials ? [...design.materials] : [];
  currentChains = design.chainItems ? [...design.chainItems] : [];
  currentPackaging = design.packagingItems ? [...design.packagingItems] : [];
  currentLogistics = design.logisticsItems ? [...design.logisticsItems] : [];

  document.getElementById('d-name').value = design.name || '';
  document.getElementById('d-imageUrl').value = design.imageUrl || '';
  document.getElementById('d-sellingPrice').value = design.sellingPrice || '';
  document.getElementById('d-targetMargin').value = '';
  document.getElementById('m-search').value = '';
  document.getElementById('m-qty').value = '';
  document.getElementById('ch-search').value = '';
  document.getElementById('ch-cm').value = '';
  document.getElementById('modal-title').textContent = '編輯設計款手鍊';
  document.getElementById('save-btn').textContent = '儲存修改';
  document.getElementById('suggested-section').style.display = 'none';

  updateMaterialOptions();
  updateChainOptions();
  renderMaterialList();
  renderChainList();
  renderPackagingList();
  renderLogisticsList();
  await updateCostPreviews();
  updateProfitCalc();
  openModal('designModal');
}

// ─── 材料（水晶 / 配件）─────────────────

function updateMaterialOptions() {
  const search = (document.getElementById('m-search').value || '').trim().toLowerCase();
  const select = document.getElementById('m-item');
  select.innerHTML = '<option value="">-- 選擇品項 --</option>';

  // 水晶選項
  crystalOptions.forEach(item => {
    const name = `${item.crystalName} ${item.size}mm ${item.typeB} ${item.typeA}`;
    const code = item.specKey || '';
    if (search && !name.toLowerCase().includes(search) && !code.toLowerCase().includes(search)) return;
    const o = document.createElement('option');
    o.value = item.specKey;
    o.textContent = `[水晶] ${name}｜${fmtCurrency(item.costPerBead)}/顆`;
    o.dataset.displayName = name;
    o.dataset.cost = item.costPerBead || 0;
    o.dataset.type = 'crystal';
    select.appendChild(o);
  });

  // 配件選項
  accessoryOptions.forEach(item => {
    const name = `${item.productName || ''}${item.color ? ' · ' + item.color : ''}`;
    const code = item.itemCode || '';
    const searchText = `${code} ${name}`.toLowerCase();
    if (search && !searchText.includes(search)) return;
    const o = document.createElement('option');
    o.value = item.specKey;
    o.textContent = `[配件][${code}] ${name}｜${fmtCurrency(item.costPerPiece)}/顆`;
    o.dataset.displayName = `[${code}] ${name}`;
    o.dataset.cost = item.costPerPiece || 0;
    o.dataset.type = 'accessory';
    select.appendChild(o);
  });
}

function addMaterialRow() {
  const select = document.getElementById('m-item');
  const qty = parseInt(document.getElementById('m-qty').value);
  const specKey = select.value;
  const opt = select.selectedOptions[0];

  if (!specKey) { showToast('請選擇品項', 'warning'); return; }
  if (!qty || qty < 1) { showToast('請填寫使用顆數', 'warning'); return; }

  const unitCost = parseFloat(opt.dataset.cost || 0);
  const existing = currentMaterials.findIndex(m => m.specKey === specKey);
  if (existing >= 0) {
    currentMaterials[existing].quantity = qty;
    currentMaterials[existing].unitCost = unitCost;
  } else {
    currentMaterials.push({
      type: opt.dataset.type,
      specKey,
      displayName: opt.dataset.displayName,
      quantity: qty,
      unitCost
    });
  }
  document.getElementById('m-qty').value = '';
  renderMaterialList();
  updateCostPreviews();
}

function removeMaterial(specKey) {
  currentMaterials = currentMaterials.filter(m => m.specKey !== specKey);
  renderMaterialList();
  updateCostPreviews();
}

function renderMaterialList() {
  const container = document.getElementById('material-list');
  if (!currentMaterials.length) {
    container.innerHTML = `<div style="text-align:center;padding:12px;color:var(--text-muted);font-size:13px">尚未加入任何材料</div>`;
    document.getElementById('material-cost-preview').textContent = '$0';
    return;
  }
  container.innerHTML = currentMaterials.map(m => {
    const rowTotal = (m.unitCost || 0) * (m.quantity || 0);
    return `<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border)">
      <span class="badge badge-${m.type === 'crystal' ? 'purple' : 'gold'}">${m.type === 'crystal' ? '水晶' : '配件'}</span>
      <span style="flex:1;font-size:13px">${m.displayName}</span>
      <span style="font-size:13px;color:var(--text-muted)">× ${m.quantity} 顆</span>
      ${m.unitCost ? `<span style="font-size:13px;color:var(--secondary);font-weight:600;min-width:56px;text-align:right">${fmtCurrency(rowTotal)}</span>` : ''}
      <span onclick="removeMaterial('${m.specKey}')" style="cursor:pointer;color:var(--text-muted);padding:0 4px">✕</span>
    </div>`;
  }).join('');

  const total = currentMaterials.reduce((s, m) => s + (m.unitCost || 0) * (m.quantity || 0), 0);
  document.getElementById('material-cost-preview').textContent = fmtCurrency(total);
}

// ─── 鍊條線材 ────────────────────────────

function updateChainOptions() {
  const search = (document.getElementById('ch-search').value || '').trim().toLowerCase();
  const select = document.getElementById('ch-item');
  select.innerHTML = '<option value="">-- 選擇品項 --</option>';

  chainOptions.forEach(item => {
    const code = item.itemCode || '';
    const name = `${item.productName || ''}${item.color ? ' · ' + item.color : ''}${item.spec ? ' ' + item.spec : ''}`;
    const searchText = `${code} ${name}`.toLowerCase();
    if (search && !searchText.includes(search)) return;
    const o = document.createElement('option');
    o.value = item.id;
    o.textContent = `[${code}] ${name}｜$${Number(item.costPerCm || 0).toFixed(4)}/cm`;
    o.dataset.displayName = `[${code}] ${name}`;
    o.dataset.costPerCm = item.costPerCm || 0;
    select.appendChild(o);
  });
}

function addChainRow() {
  const select = document.getElementById('ch-item');
  const cm = parseFloat(document.getElementById('ch-cm').value);
  const itemId = select.value;
  const opt = select.selectedOptions[0];

  if (!itemId) { showToast('請選擇鍊條線材', 'warning'); return; }
  if (!cm || cm <= 0) { showToast('請填寫使用長度 (cm)', 'warning'); return; }

  const costPerCm = parseFloat(opt.dataset.costPerCm || 0);
  const totalCost = Math.round(costPerCm * cm * 10000) / 10000;

  const existing = currentChains.findIndex(c => c.itemId === itemId);
  if (existing >= 0) {
    currentChains[existing].lengthCm = cm;
    currentChains[existing].costPerCm = costPerCm;
    currentChains[existing].totalCost = totalCost;
  } else {
    currentChains.push({
      itemId,
      displayName: opt.dataset.displayName,
      lengthCm: cm,
      costPerCm,
      totalCost
    });
  }
  document.getElementById('ch-cm').value = '';
  renderChainList();
  updateCostPreviews();
}

function removeChain(itemId) {
  currentChains = currentChains.filter(c => c.itemId !== itemId);
  renderChainList();
  updateCostPreviews();
}

function renderChainList() {
  const container = document.getElementById('chain-list');
  if (!currentChains.length) {
    container.innerHTML = `<div style="text-align:center;padding:12px;color:var(--text-muted);font-size:13px">尚未加入任何鍊條線材</div>`;
    document.getElementById('chain-cost-preview').textContent = '$0';
    return;
  }
  container.innerHTML = currentChains.map(c => `
    <div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border)">
      <span class="badge" style="background:#e8f4e8;color:#2d6a2d">線材</span>
      <span style="flex:1;font-size:13px">${c.displayName}</span>
      <span style="font-size:13px;color:var(--text-muted)">× ${c.lengthCm}cm</span>
      <span style="font-size:13px;color:var(--secondary);font-weight:600;min-width:56px;text-align:right">${fmtCurrency(c.totalCost)}</span>
      <span onclick="removeChain('${c.itemId}')" style="cursor:pointer;color:var(--text-muted);padding:0 4px">✕</span>
    </div>`).join('');

  const total = currentChains.reduce((s, c) => s + Number(c.totalCost || 0), 0);
  document.getElementById('chain-cost-preview').textContent = fmtCurrency(total);
}

// ─── 包裝成本 ─────────────────────────────

function addPackagingItem() {
  const name = document.getElementById('pkg-name').value.trim();
  const cost = parseFloat(document.getElementById('pkg-cost').value) || 0;
  if (!name) { showToast('請填寫包裝項目名稱', 'warning'); return; }
  currentPackaging.push({ name, cost });
  document.getElementById('pkg-name').value = '';
  document.getElementById('pkg-cost').value = '';
  renderPackagingList();
  updateCostPreviews();
}

function removePackagingItem(idx) {
  currentPackaging.splice(idx, 1);
  renderPackagingList();
  updateCostPreviews();
}

function renderPackagingList() {
  const container = document.getElementById('packaging-list');
  if (!currentPackaging.length) {
    container.innerHTML = '';
    document.getElementById('packaging-cost-preview').textContent = '$0';
    return;
  }
  container.innerHTML = currentPackaging.map((item, idx) => `
    <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)">
      <span style="flex:1;font-size:13px">${item.name}</span>
      <span style="font-size:13px;color:var(--secondary);font-weight:600">${fmtCurrency(Number(item.cost))}</span>
      <span onclick="removePackagingItem(${idx})" style="cursor:pointer;color:var(--text-muted);padding:0 4px">✕</span>
    </div>`).join('');

  const total = currentPackaging.reduce((s, i) => s + Number(i.cost || 0), 0);
  document.getElementById('packaging-cost-preview').textContent = fmtCurrency(total);
}

// ─── 物流平台成本 ──────────────────────────

function addLogisticsItem() {
  const name = document.getElementById('log-name').value.trim();
  const cost = parseFloat(document.getElementById('log-cost').value) || 0;
  if (!name) { showToast('請填寫物流/平台項目名稱', 'warning'); return; }
  currentLogistics.push({ name, cost });
  document.getElementById('log-name').value = '';
  document.getElementById('log-cost').value = '';
  renderLogisticsList();
  updateCostPreviews();
}

function removeLogisticsItem(idx) {
  currentLogistics.splice(idx, 1);
  renderLogisticsList();
  updateCostPreviews();
}

function renderLogisticsList() {
  const container = document.getElementById('logistics-list');
  if (!currentLogistics.length) {
    container.innerHTML = '';
    document.getElementById('logistics-cost-preview').textContent = '$0';
    return;
  }
  container.innerHTML = currentLogistics.map((item, idx) => `
    <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)">
      <span style="flex:1;font-size:13px">${item.name}</span>
      <span style="font-size:13px;color:var(--secondary);font-weight:600">${fmtCurrency(Number(item.cost))}</span>
      <span onclick="removeLogisticsItem(${idx})" style="cursor:pointer;color:var(--text-muted);padding:0 4px">✕</span>
    </div>`).join('');

  const total = currentLogistics.reduce((s, i) => s + Number(i.cost || 0), 0);
  document.getElementById('logistics-cost-preview').textContent = fmtCurrency(total);
}

// ─── 成本加總 ─────────────────────────────

async function updateCostPreviews() {
  const materialCost = await calcBraceletCurrentCost(currentMaterials);
  const chainTotal = currentChains.reduce((s, c) => s + Number(c.totalCost || 0), 0);
  const packagingTotal = currentPackaging.reduce((s, i) => s + Number(i.cost || 0), 0);
  const logisticsTotal = currentLogistics.reduce((s, i) => s + Number(i.cost || 0), 0);
  const grand = materialCost + chainTotal + packagingTotal + logisticsTotal;
  _lastTotalCost = grand;

  document.getElementById('material-cost-preview').textContent = fmtCurrency(materialCost);
  document.getElementById('chain-cost-preview').textContent = fmtCurrency(chainTotal);
  document.getElementById('packaging-cost-preview').textContent = fmtCurrency(packagingTotal);
  document.getElementById('logistics-cost-preview').textContent = fmtCurrency(logisticsTotal);
  document.getElementById('total-cost-preview').textContent = fmtCurrency(grand);

  updateProfitCalc();
  calcPriceFromMargin();
}

// ─── 毛利計算 ─────────────────────────────

function updateProfitCalc() {
  const sp = parseFloat(document.getElementById('d-sellingPrice').value) || 0;
  const profitSection = document.getElementById('profit-section');
  if (!sp) {
    profitSection.style.display = 'none';
    return;
  }
  profitSection.style.display = 'block';
  const profit = sp - _lastTotalCost;
  const margin = sp > 0 ? (profit / sp * 100) : 0;
  const color = profit >= 0 ? 'var(--success,#2ea44f)' : 'var(--danger,#cf222e)';
  document.getElementById('profit-preview').textContent = fmtCurrency(profit);
  document.getElementById('profit-preview').style.color = color;
  document.getElementById('margin-preview').textContent = `${margin.toFixed(1)}%`;
  document.getElementById('margin-preview').style.color = color;
}

function calcPriceFromMargin() {
  const targetMargin = parseFloat(document.getElementById('d-targetMargin').value);
  const suggestedSection = document.getElementById('suggested-section');
  if (!targetMargin || targetMargin <= 0 || targetMargin >= 100 || !_lastTotalCost) {
    suggestedSection.style.display = 'none';
    return;
  }
  // 售價 = 成本 / (1 - 毛利率)
  const suggested = _lastTotalCost / (1 - targetMargin / 100);
  suggestedSection.style.display = 'block';
  document.getElementById('suggested-price-preview').textContent = `$${Math.ceil(suggested)}`;
}

// ─── 儲存 ─────────────────────────────────

async function submitDesign() {
  const name = document.getElementById('d-name').value.trim();
  if (!name) { showToast('請填寫手鍊名稱', 'warning'); return; }
  if (!currentMaterials.length && !currentChains.length) {
    showToast('請至少加入一種材料或鍊條線材', 'warning'); return;
  }

  const btn = document.getElementById('save-btn');
  btn.disabled = true; btn.textContent = '儲存中...';

  try {
    const sp = parseFloat(document.getElementById('d-sellingPrice').value) || 0;
    const data = {
      name,
      imageUrl: document.getElementById('d-imageUrl').value.trim(),
      materials: currentMaterials,
      chainItems: currentChains,
      packagingItems: currentPackaging,
      logisticsItems: currentLogistics,
      sellingPrice: sp || null
    };
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
