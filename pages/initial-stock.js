// =============================================
// 初始庫存設定
// =============================================

// ─── 可編輯選項（localStorage）────────────────

const OPT_DEFAULTS = {
  crystalNames: ['水晶', '珍珠', '米珠'],
  crystalSizes: ['4', '6', '8', '10', '12', '14']
};

function getOpts(key) {
  try {
    const raw = localStorage.getItem('jn_' + key);
    return raw ? JSON.parse(raw) : [...OPT_DEFAULTS[key]];
  } catch { return [...OPT_DEFAULTS[key]]; }
}

function saveOpts(key, arr) {
  localStorage.setItem('jn_' + key, JSON.stringify(arr));
}

function addOpt(key, inputId) {
  const val = document.getElementById(inputId).value.trim();
  if (!val) return;
  const opts = getOpts(key);
  if (opts.includes(val)) { showToast('選項已存在', 'warning'); return; }
  opts.push(val);
  saveOpts(key, opts);
  document.getElementById(inputId).value = '';
  refreshOptUI(key);
}

function removeOpt(key, val) {
  const opts = getOpts(key).filter(o => o !== val);
  saveOpts(key, opts);
  refreshOptUI(key);
}

function refreshOptUI(key) {
  const datalistMap = { crystalNames: 'dl-is-name', crystalSizes: 'dl-is-size' };
  const tagsMap     = { crystalNames: 'name-tags',  crystalSizes: 'size-tags' };
  const opts = getOpts(key);
  // datalist
  const dl = document.getElementById(datalistMap[key]);
  if (dl) fillDatalist(dl, opts);
  // 管理面板 tags
  const tagsEl = document.getElementById(tagsMap[key]);
  if (tagsEl) {
    tagsEl.innerHTML = opts.map(o => `
      <span class="opt-tag">${o}
        <span class="opt-tag-del" onclick="removeOpt('${key}','${o.replace(/'/g,"\\'")}')">×</span>
      </span>`).join('');
  }
}

function toggleOptManager(id) {
  document.getElementById(id).classList.toggle('open');
}

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('navbar-root').innerHTML = renderNav('初始庫存設定');
  refreshOptUI('crystalNames');
  refreshOptUI('crystalSizes');
  await loadSettings();
});

async function loadSettings() {
  document.getElementById('table-container').innerHTML = loadingState();
  document.getElementById('acc-table-container').innerHTML = loadingState();
  try {
    const settings = await getInitialStockSettings();
    const crystals = settings.filter(s => s.type !== 'accessory');
    const accessories = settings.filter(s => s.type === 'accessory');
    renderTable(crystals);
    renderAccessoryTable(accessories);
  } catch(e) {
    const msg = `<div class="empty-state"><div class="empty-state-text">${e.message}</div></div>`;
    document.getElementById('table-container').innerHTML = msg;
    document.getElementById('acc-table-container').innerHTML = msg;
  }
}

function renderTable(settings) {
  const container = document.getElementById('table-container');
  if (!settings.length) {
    container.innerHTML = emptyState('', '尚未設定任何規格，點右上角「新增規格設定」開始');
    return;
  }

  const rows = settings.map(s => `
    <tr>
      <td><strong>${s.crystalName || '-'}</strong></td>
      <td>${s.size ? s.size + 'mm' : '-'}</td>
      <td>${s.typeB || '-'}</td>
      <td><span class="badge badge-purple">${s.typeA || '-'}</span></td>
      <td>
        <span style="font-size:20px;font-weight:800;color:var(--primary)">${s.defaultQuantity}</span>
        <span style="color:var(--text-muted);font-size:13px"> 顆</span>
      </td>
      <td>
        <div class="btn-group">
          <button class="btn btn-secondary btn-sm" onclick="openEditModal('${s.specKey}', '${s.crystalName}', '${s.size}', '${s.typeA}', '${s.typeB}', ${s.defaultQuantity})">編輯</button>
          <button class="btn btn-danger btn-sm" onclick="deleteSetting('${s.specKey}', '${s.displayName}')">刪除</button>
        </div>
      </td>
    </tr>`).join('');

  container.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>水晶名稱</th>
            <th>尺寸</th>
            <th>形狀</th>
            <th>規格</th>
            <th>每次進貨預設顆數</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function openEditModal(specKey, crystalName, size, typeA, typeB, defaultQty) {
  document.getElementById('modal-title').textContent = '編輯規格設定';
  document.getElementById('s-crystalName').value = crystalName;
  document.getElementById('s-size').value = size;
  document.getElementById('s-typeA').value = typeA;
  document.getElementById('s-typeB').value = typeB;
  document.getElementById('s-defaultQty').value = defaultQty;
  openModal('addModal');
}

async function submitSetting() {
  const get = id => document.getElementById(id).value.trim();
  const data = {
    crystalName: get('s-crystalName'),
    size: get('s-size'),
    typeA: get('s-typeA'),
    typeB: get('s-typeB'),
    defaultQuantity: parseInt(get('s-defaultQty')) || 0
  };

  if (!data.crystalName || !data.size || !data.typeA || !data.typeB) {
    showToast('請填寫所有必填欄位', 'warning'); return;
  }
  if (!data.defaultQuantity || data.defaultQuantity < 1) {
    showToast('請填寫有效的預設顆數', 'warning'); return;
  }

  try {
    const btn = document.querySelector('#addModal .btn-primary');
    btn.disabled = true; btn.textContent = '儲存中...';
    const result = await setInitialStockSetting(data);
    if (result.isNewInventory) {
      showToast(`設定已儲存！已自動在庫存表新增「${data.crystalName} ${data.size}mm ${data.typeB} ${data.typeA}」（初始數量 0）`, 'success', 7000);
    } else {
      showToast('設定已儲存！', 'success');
    }
    closeModal('addModal');
    resetForm();
    await loadSettings();
  } catch(e) {
    showToast(`儲存失敗：${e.message}`, 'danger');
  } finally {
    const btn = document.querySelector('#addModal .btn-primary');
    if (btn) { btn.disabled = false; btn.textContent = '儲存設定'; }
  }
}

function resetForm() {
  ['s-crystalName','s-size','s-typeB','s-defaultQty'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('s-typeA').value = '';
  document.getElementById('modal-title').textContent = '＋ 新增規格設定';
}

async function deleteSetting(specKey, displayName) {
  if (!confirmDialog(`確定要刪除「${displayName}」的初始庫存設定嗎？`)) return;
  try {
    await deleteInitialStockSetting(specKey);
    showToast('已刪除', 'success');
    await loadSettings();
  } catch(e) {
    showToast(`刪除失敗：${e.message}`, 'danger');
  }
}

// ─── 配件初始庫存設定 ─────────────────────

let editingAccSpecKey = null;

function renderAccessoryTable(accessories) {
  const container = document.getElementById('acc-table-container');
  if (!accessories.length) {
    container.innerHTML = emptyState('', '尚未設定任何配件，點右上角「新增配件設定」開始');
    return;
  }
  const rows = accessories.map(s => `
    <tr>
      <td><strong>${s.productName || s.itemCode || '-'}</strong></td>
      <td><span class="badge badge-purple">${s.itemCode || '-'}</span></td>
      <td>${fmtSpec(s.spec)}</td>
      <td>
        <span style="font-size:20px;font-weight:800;color:var(--primary)">${s.defaultQuantity}</span>
        <span style="color:var(--text-muted);font-size:13px"> 個</span>
      </td>
      <td>
        <div class="btn-group">
          <button class="btn btn-secondary btn-sm" onclick="openEditAccessoryModal('${s.specKey}','${(s.itemCode||'').replace(/'/g,"\\'")}','${(s.productName||'').replace(/'/g,"\\'")}','${(s.spec||'').replace(/'/g,"\\'")}',${s.defaultQuantity})">編輯</button>
          <button class="btn btn-danger btn-sm" onclick="deleteSetting('${s.specKey}','${(s.displayName||s.itemCode||'').replace(/'/g,"\\'")}')">刪除</button>
        </div>
      </td>
    </tr>`).join('');

  container.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>商品名稱</th><th>貨號</th><th>規格</th><th>每次進貨預設數量</th><th>操作</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function openAddAccessoryModal() {
  editingAccSpecKey = null;
  ['as-itemCode','as-productName','as-spec','as-defaultQty'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('as-itemCode').disabled = false;
  document.getElementById('acc-modal-title').textContent = '＋ 新增配件設定';
  openModal('addAccessoryModal');
}

function openEditAccessoryModal(specKey, itemCode, productName, spec, defaultQty) {
  editingAccSpecKey = specKey;
  document.getElementById('as-itemCode').value = itemCode;
  document.getElementById('as-itemCode').disabled = true; // 貨號不可改（影響 specKey）
  document.getElementById('as-productName').value = productName;
  document.getElementById('as-spec').value = spec;
  document.getElementById('as-defaultQty').value = defaultQty;
  document.getElementById('acc-modal-title').textContent = '編輯配件設定';
  openModal('addAccessoryModal');
}

async function submitAccessorySetting() {
  const get = id => document.getElementById(id).value.trim();
  const data = {
    itemCode: get('as-itemCode'),
    productName: get('as-productName'),
    spec: get('as-spec'),
    defaultQuantity: parseInt(get('as-defaultQty')) || 0
  };
  if (!data.itemCode) { showToast('請填寫貨號', 'warning'); return; }
  if (!data.defaultQuantity || data.defaultQuantity < 1) { showToast('請填寫有效的預設數量', 'warning'); return; }

  try {
    const btn = document.querySelector('#addAccessoryModal .btn-primary');
    btn.disabled = true; btn.textContent = '儲存中...';
    const result = await setAccessoryInitialSetting(data);
    if (result.isNewInventory) {
      showToast(`設定已儲存！已自動在庫存表新增「${data.productName || data.itemCode}」（初始數量 0）`, 'success', 7000);
    } else {
      showToast('設定已儲存！', 'success');
    }
    closeModal('addAccessoryModal');
    await loadSettings();
  } catch(e) {
    showToast(`儲存失敗：${e.message}`, 'danger');
  } finally {
    const btn = document.querySelector('#addAccessoryModal .btn-primary');
    if (btn) { btn.disabled = false; btn.textContent = '儲存設定'; }
  }
}
