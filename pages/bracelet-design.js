// =============================================
// 設計款手鍊
// =============================================

const WRIST_SIZES = [13, 13.5, 14, 14.5, 15, 15.5, 16, 16.5, 17, 17.5, 18];

let editingId = null;
let _loadedDesigns = {};   // id → design，供詳細視窗用
let currentMaterials = [];
let currentChains = [];
let currentPackaging = [];
let currentLogistics = [];
let currentWristSizes = [];
let _lastTotalCost = 0;
let crystalOptions = [];
let accessoryOptions = [];
let chainOptions = [];

// Autocomplete 暫存
let _materialMatches = [];
let _selectedMaterial = null; // { type, specKey, displayName, unitCost }
let _chainMatches = [];
let _selectedChain = null;    // { itemId, displayName, costPerCm }

// 備註
let currentNotes = [];

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('navbar-root').innerHTML = renderNav('設計款手鍊');
  await loadDesigns();
  await preloadOptions();

  // 點其他地方關閉 dropdown
  document.addEventListener('click', e => {
    if (!e.target.closest('.ac-wrap')) {
      document.querySelectorAll('.ac-dropdown').forEach(d => d.style.display = 'none');
    }
  });
});

// ─── 預載選項 ─────────────────────────────

async function preloadOptions() {
  try {
    // 讀全部歷史記錄，本地去重並保留任何一筆有的 itemCode / productName
    const allRecords = await getCrystalCosts();          // 不篩選，傳回所有記錄
    allRecords.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const seenSpec = new Map();
    allRecords.forEach(r => {
      // 用 specKey+productName 當去重 key，避免同顏色/尺寸/形狀的不同礦石互相蓋掉
      const dedupKey = `${r.specKey}__${r.productName || ''}`;
      if (!seenSpec.has(dedupKey)) {
        seenSpec.set(dedupKey, { ...r, _allCodes: r.itemCode ? [r.itemCode] : [] });
      } else {
        const ex = seenSpec.get(dedupKey);
        if (r.itemCode && !ex._allCodes.includes(r.itemCode)) ex._allCodes.push(r.itemCode);
      }
    });
    crystalOptions = [...seenSpec.values()];
  } catch(e) { console.warn('[crystal]', e); }
  try { accessoryOptions = await getLatestAccessoryCosts(); } catch(e) { console.warn('[accessory]', e); }
  try { chainOptions = await getChainCosts(); } catch(e) { console.warn('[chain] 載入失敗:', e); }
}

// ─── 載入設計款列表 ───────────────────────

async function loadDesigns() {
  const container = document.getElementById('designs-container');
  container.innerHTML = loadingState();
  try {
    const designs = await getBraceletDesigns();
    _loadedDesigns = {};
    designs.forEach(d => { _loadedDesigns[d.id] = d; });
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
    ? `<img src="${design.imageUrl}" alt="${design.name}" style="width:100%;border-radius:6px;margin-bottom:12px;object-fit:cover;max-height:180px" onerror="this.style.display='none'">`
    : '';

  let profitHtml = '';
  if (design.sellingPrice) {
    const sp = Number(design.sellingPrice);
    const profit = sp - currentCost;
    const margin = sp > 0 ? (profit / sp * 100) : 0;
    const color = profit >= 0 ? 'var(--success,#2ea44f)' : 'var(--danger,#cf222e)';
    profitHtml = `<div style="background:var(--bg);border-radius:6px;padding:8px 12px;margin-top:10px;font-size:13px">
      <div class="material-row"><span>售價</span><span style="font-weight:700">${fmtCurrency(sp)}</span></div>
      <div class="material-row"><span>毛利</span><span style="font-weight:700;color:${color}">${fmtCurrency(profit)}</span></div>
      <div class="material-row"><span>毛利率</span><span style="font-weight:700;color:${color}">${margin.toFixed(1)}%</span></div>
    </div>`;
  }

  const createdDate = design.createdAt
    ? (design.createdAt.toDate ? design.createdAt.toDate().toLocaleDateString('zh-TW') : '')
    : '';

  const matCount = (design.materials||[]).length + (design.chainItems||[]).length;

  const savedSizes = design.wristSizes || [];
  const cardChips = `<div style="display:flex;flex-wrap:wrap;gap:4px;margin:10px 0 4px">` +
    WRIST_SIZES.map(s =>
      `<span class="wrist-chip${savedSizes.includes(s) ? ' active' : ''}" style="min-width:36px;height:24px;font-size:11px;cursor:default">${s}</span>`
    ).join('') + `</div>`;

  return `
    <div class="design-card" onclick="openSizePicker('${design.id}')">
      ${imgHtml}
      <div class="design-card-header">
        <div>
          <div class="design-card-name">${design.name}</div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:2px">建立：${createdDate} ‧ ${matCount} 項材料</div>
        </div>
        <div style="text-align:right">
          <div class="design-card-cost">${fmtCurrency(currentCost)}</div>
          <div style="font-size:12px;color:var(--text-muted)">總成本</div>
        </div>
      </div>
      ${alertHtml}
      ${cardChips}
      ${profitHtml}
      <div class="btn-group mt-16" onclick="event.stopPropagation()">
        <button class="btn btn-secondary btn-sm" onclick="openEditModal('${design.id}')">編輯</button>
        <button class="btn btn-danger btn-sm" onclick="deleteDesign('${design.id}', '${design.name}')">刪除</button>
      </div>
    </div>`;
}

// ─── Modal 控制 ───────────────────────────

// ─── 手圍選擇 Modal ──────────────────────────

function openSizePicker(id) {
  const design = _loadedDesigns[id];
  if (!design) return;
  const savedSizes = design.wristSizes || [];

  const imgHtml = design.imageUrl
    ? `<img src="${design.imageUrl}" alt="${design.name}" style="width:100%;border-radius:8px;margin-bottom:16px;object-fit:cover;max-height:160px" onerror="this.style.display='none'">`
    : '';

  const chips = WRIST_SIZES.map(s => {
    const active = savedSizes.includes(s);
    return `<span class="wrist-chip${active ? ' active' : ' chip-empty'}"
      style="min-width:52px;height:38px;font-size:14px;${active ? 'cursor:pointer' : 'cursor:default'}"
      ${active ? `onclick="openDetailModal('${id}')"` : ''}
    >${s}</span>`;
  }).join('');

  _setText('detail-title', design.name);
  document.getElementById('detail-body').innerHTML = `
    <div style="padding:20px 24px 24px">
      ${imgHtml}
      <div style="font-size:13px;color:var(--text-muted);margin-bottom:16px;text-align:center">
        選擇手圍尺寸查看詳細資料<br><span style="font-size:12px">（紫色 = 已填入資料）</span>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;padding-bottom:8px">${chips}</div>
    </div>`;

  openModal('detailModal');
}

// ─── 詳細瀏覽 Modal ──────────────────────────

async function openDetailModal(id) {
  const design = _loadedDesigns[id] || await getBraceletDesign(id);
  if (!design) return;

  const materialCost = (design.materials||[]).reduce((s,m) => s + (m.unitCost||0)*(m.quantity||0), 0);
  const chainTotal   = (design.chainItems||[]).reduce((s,c) => s + Number(c.totalCost||0), 0);
  const pkgTotal     = (design.packagingItems||[]).reduce((s,i) => s + Number(i.cost||0), 0);
  const logTotal     = (design.logisticsItems||[]).reduce((s,i) => s + Number(i.cost||0), 0);
  const totalCost    = materialCost + chainTotal + pkgTotal + logTotal;

  const row = (label, val, color='') =>
    `<div class="material-row"><span style="color:var(--text-muted)">${label}</span><span style="font-weight:600${color ? ';color:'+color : ''}">${val}</span></div>`;

  const sectionTitle = txt =>
    `<div class="detail-section-title">${txt}</div>`;

  const subtotalRow = val =>
    `<div style="display:flex;justify-content:space-between;align-items:center;background:var(--bg);border-radius:4px;padding:6px 10px;margin:4px 0 10px">
      <span style="font-size:13px;font-weight:700">小計</span>
      <span style="font-size:15px;font-weight:800;color:var(--secondary)">${val}</span>
    </div>`;

  // ── 左側：圖片 / 手圍 / 總成本 / 毛利 ──
  const imgHtml = design.imageUrl
    ? `<img src="${design.imageUrl}" alt="${design.name}" style="width:100%;border-radius:8px;margin-bottom:12px;object-fit:cover;max-height:150px" onerror="this.style.display='none'">`
    : '';

  const savedSizes = design.wristSizes || [];
  const wristHtml = `${sectionTitle('手圍 (cm)')}<div style="display:flex;flex-wrap:wrap;gap:6px;padding:8px 0 4px">` +
    WRIST_SIZES.map(s =>
      `<span class="wrist-chip${savedSizes.includes(s) ? ' active' : ''}" style="cursor:default">${s}</span>`
    ).join('') + `</div>`;

  const totalHtml = `<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-top:2px solid var(--border);margin-top:12px">
    <span style="font-weight:700">總成本</span>
    <span style="font-size:22px;font-weight:800;color:var(--secondary)">${fmtCurrency(totalCost)}</span>
  </div>`;

  let profitHtml = '';
  if (design.sellingPrice) {
    const sp = Number(design.sellingPrice);
    const profit = sp - totalCost;
    const margin = sp > 0 ? (profit/sp*100) : 0;
    const color = profit >= 0 ? 'var(--success,#2ea44f)' : 'var(--danger,#cf222e)';
    profitHtml = `<div style="background:var(--bg);border-radius:8px;padding:10px 12px;margin-top:8px">` +
      row('售價', fmtCurrency(sp)) +
      row('毛利', fmtCurrency(profit), color) +
      row('毛利率', margin.toFixed(1)+'%', color) +
      `</div>`;
  }

  // ── 右側：材料清單（可滾動）──
  let matHtml = '';
  if ((design.materials||[]).length) {
    matHtml = sectionTitle('① 材料清單（水晶 / 配件）') +
      (design.materials||[]).map(m => {
        const total = (m.unitCost||0)*(m.quantity||0);
        const badge = m.type==='crystal' ? '<span class="badge badge-purple">水晶</span>' : '<span class="badge badge-gold">配件</span>';
        return `<div class="material-row" style="gap:6px">${badge}<span style="flex:1;font-size:13px">${m.displayName} × ${m.quantity} 顆</span><span style="color:var(--primary);font-weight:600">${m.unitCost?fmtCurrency(total):''}</span></div>`;
      }).join('') + subtotalRow(fmtCurrency(materialCost));
  }

  let chainHtml = '';
  if ((design.chainItems||[]).length) {
    chainHtml = sectionTitle('② 鍊條線材') +
      (design.chainItems||[]).map(c =>
        `<div class="material-row" style="gap:6px"><span class="badge" style="background:#e8f4e8;color:#2d6a2d;flex-shrink:0">線材</span><span style="flex:1;font-size:13px">${c.displayName} × ${c.lengthCm}cm</span><span style="color:var(--primary);font-weight:600">${fmtChainCost(Number(c.totalCost))}</span></div>`
      ).join('') + subtotalRow(fmtChainCost(chainTotal));
  }

  let pkgHtml = '';
  if ((design.packagingItems||[]).length) {
    pkgHtml = sectionTitle('③ 包裝成本') +
      (design.packagingItems||[]).map(i => row(i.name, fmtCurrency(Number(i.cost)))).join('') +
      subtotalRow(fmtCurrency(pkgTotal));
  }

  let logHtml = '';
  if ((design.logisticsItems||[]).length) {
    logHtml = sectionTitle('④ 物流平台') +
      (design.logisticsItems||[]).map(i => row(i.name, fmtCurrency(Number(i.cost)))).join('') +
      subtotalRow(fmtCurrency(logTotal));
  }

  let notesHtml = '';
  if ((design.notes||[]).length) {
    notesHtml = sectionTitle('製作備註') +
      (design.notes||[]).map(n =>
        `<div class="material-row"><span style="color:var(--text-muted);white-space:nowrap;font-size:12px">${fmtNoteDate(n.date)}</span><span style="flex:1;font-size:13px;padding-left:8px">${n.text}</span></div>`
      ).join('');
  }

  _setText('detail-title', design.name);
  document.getElementById('detail-body').innerHTML = `
    <div style="display:flex;height:calc(96vh - 62px)">
      <div style="width:260px;flex-shrink:0;padding:20px;border-right:1px solid var(--border)">
        ${imgHtml}${wristHtml}${totalHtml}${profitHtml}
        <div class="btn-group" style="margin-top:20px;padding-top:16px;border-top:1px solid var(--border)">
          <button class="btn btn-secondary" onclick="closeModal('detailModal');openEditModal('${design.id}')">編輯</button>
          <button class="btn btn-danger" onclick="closeModal('detailModal');deleteDesign('${design.id}','${design.name.replace(/'/g,"\\'")}')">刪除</button>
        </div>
      </div>
      <div style="flex:1;min-width:0;padding:20px;overflow-y:auto">
        ${matHtml}${chainHtml}${pkgHtml}${logHtml}${notesHtml}
      </div>
    </div>`;
  openModal('detailModal');
}

function _setVal(id, val) { const el = document.getElementById(id); if (el) el.value = val; }
function _setDisplay(id, val) { const el = document.getElementById(id); if (el) el.style.display = val; }
function _setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }

function resetModal() {
  _setVal('d-name', ''); _setVal('d-imageUrl', '');
  _setVal('d-sellingPrice', ''); _setVal('d-targetMargin', '');
  _setVal('m-qty', ''); _setVal('ch-cm', '');
  _setVal('note-input', '');
  _setVal('note-date', new Date().toISOString().split('T')[0]);
  _setDisplay('profit-section', 'none'); _setDisplay('suggested-section', 'none');
  clearMaterialSelection(); clearChainSelection();
  _setVal('pkg-name', ''); _setVal('pkg-cost', '');
  _setVal('log-name', ''); _setVal('log-cost', '');
  renderWristChips();
}

function renderWristChips() {
  const container = document.getElementById('wrist-chips');
  if (!container) return;
  container.innerHTML = WRIST_SIZES.map(s =>
    `<span class="wrist-chip${currentWristSizes.includes(s) ? ' active' : ''}" onclick="toggleWristSize(${s})">${s}</span>`
  ).join('');
}

function toggleWristSize(size) {
  const idx = currentWristSizes.indexOf(size);
  if (idx >= 0) currentWristSizes.splice(idx, 1);
  else currentWristSizes.push(size);
  renderWristChips();
}

async function openAddModal() {
  editingId = null;
  currentMaterials = []; currentChains = []; currentPackaging = []; currentLogistics = []; currentNotes = [];
  currentWristSizes = [];
  _lastTotalCost = 0;
  resetModal();
  _setText('modal-title', '新增設計款手鍊');
  _setText('save-btn', '儲存設計款');
  renderMaterialList(); renderChainList(); renderPackagingList(); renderLogisticsList(); renderNoteList();
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
  currentNotes = design.notes ? [...design.notes] : [];
  currentWristSizes = design.wristSizes ? [...design.wristSizes] : [];
  resetModal();
  _setVal('d-name', design.name || '');
  _setVal('d-imageUrl', design.imageUrl || '');
  _setVal('d-sellingPrice', design.sellingPrice || '');
  _setText('modal-title', '編輯設計款手鍊');
  _setText('save-btn', '儲存修改');
  renderMaterialList(); renderChainList(); renderPackagingList(); renderLogisticsList(); renderNoteList();
  updateCostPreviews();
  updateProfitCalc();
  openModal('designModal');
}

// ─── Autocomplete：材料（水晶 + 配件）────

function showMaterialSuggestions() {
  const search = (document.getElementById('m-input').value || '').trim().toLowerCase();
  const dropdown = document.getElementById('m-dropdown');
  _materialMatches = [];

  crystalOptions.forEach(item => {
    const sizeStr = String(item.size || '');
    const sizeDisplay = sizeStr.includes('mm') ? sizeStr : sizeStr + 'mm';
    const code = item.itemCode || '';
    // productName = 礦石名（白水晶、拉長石）；crystalName = 色系（白色/多彩、黑色/灰色）
    const mineral = item.productName || item.crystalName || '';
    const color   = item.productName ? (item.crystalName || '') : '';
    const baseName = [mineral, color, sizeDisplay, item.typeB, item.typeA].filter(Boolean).join(' ');
    const name = code ? `[${code}] ${baseName}` : baseName;
    const searchable = [baseName, code, ...(item._allCodes||[]), item.specKey, item.productName, item.vendor, item.crystalName, item.typeA, item.typeB]
      .filter(Boolean).join(' ').toLowerCase();
    if (!search || searchable.includes(search)) {
      _materialMatches.push({ type: 'crystal', specKey: item.specKey, displayName: name, unitCost: item.costPerBead || 0 });
    }
  });

  accessoryOptions.forEach(item => {
    const code = item.itemCode || '';
    const name = `${item.productName || ''}${item.color ? ' · ' + item.color : ''}`;
    const searchable = [code, name, item.specKey, item.spec, item.vendor, item.productName, item.color]
      .filter(Boolean).join(' ').toLowerCase();
    if (!search || searchable.includes(search)) {
      // costPerPiece 欄已移除，以 costPerLot（單品進貨成本$）作為單顆成本
      const unitCost = Number(item.costPerPiece || item.costPerLot || 0);
      _materialMatches.push({ type: 'accessory', specKey: item.specKey, displayName: `[${code}] ${name}`, unitCost });
    }
  });

  if (!_materialMatches.length) {
    dropdown.innerHTML = `<div class="ac-item" style="color:var(--text-muted);font-size:12px">無符合項目（水晶 ${crystalOptions.length} 筆 / 配件 ${accessoryOptions.length} 筆）</div>`;
    dropdown.style.display = 'block';
    return;
  }

  const show = _materialMatches.slice(0, 40);
  dropdown.innerHTML = show.map((m, i) => {
    const badge = m.type === 'crystal'
      ? `<span class="badge badge-purple">水晶</span>`
      : `<span class="badge badge-gold">配件</span>`;
    return `<div class="ac-item" onmousedown="selectMaterial(${i})">${badge}<span style="flex:1">${m.displayName}</span><span style="color:var(--secondary);font-weight:600">${fmtCurrency(m.unitCost)}/顆</span></div>`;
  }).join('');
  dropdown.style.display = 'block';
}

function selectMaterial(i) {
  _selectedMaterial = _materialMatches[i];
  if (!_selectedMaterial) return;
  document.getElementById('m-input').value = '';
  document.getElementById('m-dropdown').style.display = 'none';
  document.getElementById('m-selected').style.display = 'flex';
  document.getElementById('m-selected-name').textContent = _selectedMaterial.displayName;
  document.getElementById('m-selected-cost-label').textContent = `${fmtCurrency(_selectedMaterial.unitCost)}/顆`;
  document.getElementById('m-qty').focus();
}

function clearMaterialSelection() {
  _selectedMaterial = null;
  _setVal('m-input', '');
  _setDisplay('m-selected', 'none');
  _setText('m-selected-name', '');
  _setText('m-selected-cost-label', '');
}

function addMaterialRow() {
  if (!_selectedMaterial) { showToast('請先選擇品項', 'warning'); return; }
  const qty = parseInt(document.getElementById('m-qty').value);
  if (!qty || qty < 1) { showToast('請填寫使用顆數', 'warning'); return; }

  const { type, specKey, displayName, unitCost } = _selectedMaterial;
  const existing = currentMaterials.findIndex(m => m.specKey === specKey);
  if (existing >= 0) {
    currentMaterials[existing].quantity = qty;
    currentMaterials[existing].unitCost = unitCost;
  } else {
    currentMaterials.push({ type, specKey, displayName, quantity: qty, unitCost });
  }
  _setVal('m-qty', '');
  clearMaterialSelection();
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
    _setText('material-cost-preview', '$0');
    return;
  }
  container.innerHTML = currentMaterials.map(m => {
    const rowTotal = (m.unitCost || 0) * (m.quantity || 0);
    const unitLabel = m.unitCost ? `<span style="font-size:12px;color:var(--text-muted)">${fmtCurrency(m.unitCost)}/顆</span><span style="font-size:12px;color:var(--text-muted)">×</span>` : '';
    return `<div style="display:flex;align-items:center;gap:6px;padding:8px 0;border-bottom:1px solid var(--border)">
      <span class="badge badge-${m.type === 'crystal' ? 'purple' : 'gold'}">${m.type === 'crystal' ? '水晶' : '配件'}</span>
      <span style="flex:1;font-size:13px">${m.displayName}</span>
      ${unitLabel}
      <span style="font-size:13px;color:var(--text-muted)">${m.quantity} 顆</span>
      ${m.unitCost ? `<span style="font-size:13px;color:var(--secondary);font-weight:700;min-width:52px;text-align:right">${fmtCurrency(rowTotal)}</span>` : ''}
      <span onclick="removeMaterial('${m.specKey}')" style="cursor:pointer;color:var(--text-muted);padding:0 4px">✕</span>
    </div>`;
  }).join('');
  const total = currentMaterials.reduce((s, m) => s + (m.unitCost || 0) * (m.quantity || 0), 0);
  _setText('material-cost-preview', fmtCurrency(total));
}

// ─── Autocomplete：鍊條線材 ───────────────

function showChainSuggestions() {
  const search = (document.getElementById('ch-input').value || '').trim().toLowerCase();
  const dropdown = document.getElementById('ch-dropdown');
  _chainMatches = [];

  chainOptions.forEach(item => {
    const code = item.itemCode || '';
    const name = `${item.productName || ''}${item.color ? ' · ' + item.color : ''}${item.spec ? ' ' + item.spec : ''}`;
    const searchable = [code, name, item.specKey, item.vendor, item.productName, item.color, item.spec]
      .filter(Boolean).join(' ').toLowerCase();
    if (!search || searchable.includes(search)) {
      _chainMatches.push({ itemId: item.id, displayName: `[${code}] ${name}`, costPerCm: item.costPerCm || 0 });
    }
  });

  if (!_chainMatches.length) {
    dropdown.innerHTML = `<div class="ac-item" style="color:var(--text-muted);font-size:12px">無符合項目（已載入 ${chainOptions.length} 筆鍊條資料）</div>`;
    dropdown.style.display = 'block';
    return;
  }

  const show = _chainMatches.slice(0, 40);
  dropdown.innerHTML = show.map((c, i) =>
    `<div class="ac-item" onmousedown="selectChain(${i})">
      <span class="badge" style="background:#e8f4e8;color:#2d6a2d">線材</span>
      <span style="flex:1">${c.displayName}</span>
      <span style="color:var(--secondary);font-weight:600">$${Number(c.costPerCm || 0).toFixed(4)}/cm</span>
    </div>`
  ).join('');
  dropdown.style.display = 'block';
}

function selectChain(i) {
  _selectedChain = _chainMatches[i];
  if (!_selectedChain) return;
  document.getElementById('ch-input').value = '';
  document.getElementById('ch-dropdown').style.display = 'none';
  document.getElementById('ch-selected').style.display = 'flex';
  document.getElementById('ch-selected-name').textContent = _selectedChain.displayName;
  document.getElementById('ch-selected-cost-label').textContent = `$${Number(_selectedChain.costPerCm || 0).toFixed(4)}/cm`;
  document.getElementById('ch-cm').focus();
}

function clearChainSelection() {
  _selectedChain = null;
  _setVal('ch-input', '');
  _setDisplay('ch-selected', 'none');
  _setText('ch-selected-name', '');
  _setText('ch-selected-cost-label', '');
}

function addChainRow() {
  if (!_selectedChain) { showToast('請先選擇鍊條線材', 'warning'); return; }
  const cm = parseFloat(document.getElementById('ch-cm').value);
  if (!cm || cm <= 0) { showToast('請填寫使用長度 (cm)', 'warning'); return; }

  const { itemId, displayName, costPerCm } = _selectedChain;
  const totalCost = Math.round(costPerCm * cm * 10000) / 10000;

  const existing = currentChains.findIndex(c => c.itemId === itemId);
  if (existing >= 0) {
    currentChains[existing].lengthCm = cm;
    currentChains[existing].costPerCm = costPerCm;
    currentChains[existing].totalCost = totalCost;
  } else {
    currentChains.push({ itemId, displayName, lengthCm: cm, costPerCm, totalCost });
  }
  _setVal('ch-cm', '');
  clearChainSelection();
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
    _setText('chain-cost-preview', '$0');
    return;
  }
  container.innerHTML = currentChains.map(c => `
    <div style="display:flex;align-items:center;gap:6px;padding:8px 0;border-bottom:1px solid var(--border)">
      <span class="badge" style="background:#e8f4e8;color:#2d6a2d">線材</span>
      <span style="flex:1;font-size:13px">${c.displayName}</span>
      ${c.costPerCm ? `<span style="font-size:12px;color:var(--text-muted)">$${Number(c.costPerCm).toFixed(4)}/cm</span><span style="font-size:12px;color:var(--text-muted)">×</span>` : ''}
      <span style="font-size:13px;color:var(--text-muted)">${c.lengthCm}cm</span>
      <span style="font-size:13px;color:var(--secondary);font-weight:700;min-width:52px;text-align:right">${fmtChainCost(c.totalCost)}</span>
      <span onclick="removeChain('${c.itemId}')" style="cursor:pointer;color:var(--text-muted);padding:0 4px">✕</span>
    </div>`).join('');

  const total = currentChains.reduce((s, c) => s + Number(c.totalCost || 0), 0);
  _setText('chain-cost-preview', fmtChainCost(total));
}

// ─── 包裝成本 ─────────────────────────────

function addPackagingItem() {
  const name = document.getElementById('pkg-name').value.trim();
  const cost = parseFloat(document.getElementById('pkg-cost').value) || 0;
  if (!name) { showToast('請填寫包裝項目名稱', 'warning'); return; }
  currentPackaging.push({ name, cost });
  _setVal('pkg-name', ''); _setVal('pkg-cost', '');
  renderPackagingList(); updateCostPreviews();
}

function removePackagingItem(idx) {
  currentPackaging.splice(idx, 1);
  renderPackagingList(); updateCostPreviews();
}

function renderPackagingList() {
  const container = document.getElementById('packaging-list');
  if (!currentPackaging.length) { container.innerHTML = ''; _setText('packaging-cost-preview', '$0'); return; }
  container.innerHTML = currentPackaging.map((item, idx) => `
    <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)">
      <span style="flex:1;font-size:13px">${item.name}</span>
      <span style="font-size:13px;color:var(--secondary);font-weight:600">${fmtCurrency(Number(item.cost))}</span>
      <span onclick="removePackagingItem(${idx})" style="cursor:pointer;color:var(--text-muted);padding:0 4px">✕</span>
    </div>`).join('');
  _setText('packaging-cost-preview', fmtCurrency(currentPackaging.reduce((s, i) => s + Number(i.cost || 0), 0)));
}

// ─── 物流平台成本 ──────────────────────────

function addLogisticsItem() {
  const name = document.getElementById('log-name').value.trim();
  const cost = parseFloat(document.getElementById('log-cost').value) || 0;
  if (!name) { showToast('請填寫物流/平台項目名稱', 'warning'); return; }
  currentLogistics.push({ name, cost });
  _setVal('log-name', ''); _setVal('log-cost', '');
  renderLogisticsList(); updateCostPreviews();
}

function removeLogisticsItem(idx) {
  currentLogistics.splice(idx, 1);
  renderLogisticsList(); updateCostPreviews();
}

function renderLogisticsList() {
  const container = document.getElementById('logistics-list');
  if (!currentLogistics.length) { container.innerHTML = ''; _setText('logistics-cost-preview', '$0'); return; }
  container.innerHTML = currentLogistics.map((item, idx) => `
    <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)">
      <span style="flex:1;font-size:13px">${item.name}</span>
      <span style="font-size:13px;color:var(--secondary);font-weight:600">${fmtCurrency(Number(item.cost))}</span>
      <span onclick="removeLogisticsItem(${idx})" style="cursor:pointer;color:var(--text-muted);padding:0 4px">✕</span>
    </div>`).join('');
  _setText('logistics-cost-preview', fmtCurrency(currentLogistics.reduce((s, i) => s + Number(i.cost || 0), 0)));
}

// ─── 成本加總 ─────────────────────────────

function updateCostPreviews() {
  // 直接用 unitCost 計算，不做 Firestore 查詢，避免 costPerPiece 欄遺失造成 $0
  const materialCost = currentMaterials.reduce((s, m) => s + (m.unitCost || 0) * (m.quantity || 0), 0);
  const chainTotal = currentChains.reduce((s, c) => s + Number(c.totalCost || 0), 0);
  const packagingTotal = currentPackaging.reduce((s, i) => s + Number(i.cost || 0), 0);
  const logisticsTotal = currentLogistics.reduce((s, i) => s + Number(i.cost || 0), 0);
  const grand = materialCost + chainTotal + packagingTotal + logisticsTotal;
  _lastTotalCost = grand;

  _setText('material-cost-preview', fmtCurrency(materialCost));
  _setText('chain-cost-preview', fmtChainCost(chainTotal));
  _setText('packaging-cost-preview', fmtCurrency(packagingTotal));
  _setText('logistics-cost-preview', fmtCurrency(logisticsTotal));
  _setText('total-cost-preview', fmtCurrency(grand));

  updateProfitCalc();
  calcPriceFromMargin();
}

// ─── 毛利計算 ─────────────────────────────

function updateProfitCalc() {
  const sp = parseFloat(document.getElementById('d-sellingPrice').value) || 0;
  _setDisplay('profit-section', sp ? 'block' : 'none');
  if (!sp) return;
  const profit = sp - _lastTotalCost;
  const margin = sp > 0 ? (profit / sp * 100) : 0;
  const color = profit >= 0 ? 'var(--success,#2ea44f)' : 'var(--danger,#cf222e)';
  const pEl = document.getElementById('profit-preview');
  const mEl = document.getElementById('margin-preview');
  if (pEl) { pEl.textContent = fmtCurrency(profit); pEl.style.color = color; }
  if (mEl) { mEl.textContent = `${margin.toFixed(1)}%`; mEl.style.color = color; }
}

function calcPriceFromMargin() {
  const targetMargin = parseFloat(document.getElementById('d-targetMargin').value);
  const suggestedSection = document.getElementById('suggested-section');
  if (!suggestedSection) return;
  if (!targetMargin || targetMargin <= 0 || targetMargin >= 100 || !_lastTotalCost) {
    suggestedSection.style.display = 'none'; return;
  }
  const suggested = _lastTotalCost / (1 - targetMargin / 100);
  suggestedSection.style.display = 'block';
  _setText('suggested-price-preview', `$${Math.ceil(suggested)}`);
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
      notes: currentNotes,
      sellingPrice: sp || null,
      wristSizes: currentWristSizes
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

// ─── 鍊條成本 formatter（小數值顯示 4 位）─
function fmtChainCost(num) {
  const n = Number(num);
  if (!n || isNaN(n)) return '$0';
  const digits = n < 0.1 ? 4 : n < 1 ? 2 : 1;
  return `$${n.toLocaleString('zh-TW', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

// ─── 製作備註 ─────────────────────────────

function fmtNoteDate(isoDate) {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-');
  return `${y}/${m}/${d}`;
}

function addNote() {
  const text = (document.getElementById('note-input').value || '').trim();
  const dateVal = document.getElementById('note-date').value || new Date().toISOString().split('T')[0];
  if (!text) { showToast('請輸入備註內容', 'warning'); return; }
  currentNotes.push({ date: dateVal, text });
  _setVal('note-input', '');
  renderNoteList();
}

function removeNote(idx) {
  currentNotes.splice(idx, 1);
  renderNoteList();
}

function startEditNote(idx) {
  const row = document.getElementById(`note-row-${idx}`);
  if (!row) return;
  const note = currentNotes[idx];
  row.innerHTML = `
    <input class="form-control" id="note-edit-date-${idx}" type="date" value="${note.date}" style="max-width:140px;font-size:13px;padding:4px 8px">
    <input class="form-control" id="note-edit-${idx}" value="${note.text.replace(/"/g, '&quot;')}" style="flex:1;font-size:13px;padding:4px 8px">
    <button class="btn btn-primary btn-sm" onclick="saveEditNote(${idx})" style="white-space:nowrap">儲存</button>
    <button class="btn btn-secondary btn-sm" onclick="renderNoteList()" style="white-space:nowrap">取消</button>`;
  document.getElementById(`note-edit-${idx}`).focus();
}

function saveEditNote(idx) {
  const el = document.getElementById(`note-edit-${idx}`);
  const dateEl = document.getElementById(`note-edit-date-${idx}`);
  if (!el) return;
  const text = el.value.trim();
  if (!text) { showToast('備註不能為空', 'warning'); return; }
  currentNotes[idx].text = text;
  if (dateEl && dateEl.value) currentNotes[idx].date = dateEl.value;
  renderNoteList();
}

function renderNoteList() {
  const container = document.getElementById('notes-list');
  if (!container) return;
  if (!currentNotes.length) {
    container.innerHTML = `<div style="text-align:center;padding:10px;color:var(--text-muted);font-size:13px">尚未加入任何備註</div>`;
    return;
  }
  container.innerHTML = currentNotes.map((n, idx) => `
    <div id="note-row-${idx}" style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--border)">
      <span style="font-size:12px;color:var(--text-muted);white-space:nowrap">${fmtNoteDate(n.date)}</span>
      <span style="flex:1;font-size:13px">${n.text}</span>
      <span onclick="startEditNote(${idx})" style="cursor:pointer;color:var(--primary);font-size:13px;padding:0 4px" title="編輯">✎</span>
      <span onclick="removeNote(${idx})" style="cursor:pointer;color:var(--text-muted);padding:0 4px" title="刪除">✕</span>
    </div>`).join('');
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
