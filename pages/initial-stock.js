// =============================================
// 初始庫存設定
// =============================================

// ─── 可編輯選項（localStorage）────────────────

const OPT_DEFAULTS = {
  crystalNames: ['水晶', '珍珠', '米珠'],
  crystalSizes: ['4', '6', '8', '10', '12', '14'],
  crystalTypeAs: ['條珠', '成品串', '條珠三圈'],
  crystalTypeBs: ['圓珠', '扁刻面', '算盤珠', '心形', '水滴', '橢圓', '方形']
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
  const datalistMap = { crystalNames: 'dl-is-name', crystalSizes: 'dl-is-size', crystalTypeAs: 'dl-is-typeA', crystalTypeBs: 'dl-is-typeB' };
  const tagsMap     = { crystalNames: 'name-tags',  crystalSizes: 'size-tags',  crystalTypeAs: 'typeA-tags',  crystalTypeBs: 'typeB-tags' };
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
  refreshOptUI('crystalSizes');
  refreshOptUI('crystalTypeAs');
  refreshOptUI('crystalTypeBs');
  await loadSettings();
});

async function loadSettings() {
  document.getElementById('table-container').innerHTML = loadingState();
  try {
    const settings = await getInitialStockSettings();
    renderTable(settings.filter(s => s.type !== 'accessory'));
  } catch(e) {
    document.getElementById('table-container').innerHTML =
      `<div class="empty-state"><div class="empty-state-text">${e.message}</div></div>`;
  }
}

function renderTable(settings) {
  const container = document.getElementById('table-container');
  if (!settings.length) {
    container.innerHTML = emptyState('', '尚未設定任何規格，點右上角「新增規格設定」開始');
    return;
  }

  const newSettings = settings.filter(s => s.specKey && s.specKey.startsWith('SIZE_'));
  if (!newSettings.length) {
    container.innerHTML = emptyState('', '尚未設定任何規格，點右上角「新增水晶設定」開始');
    return;
  }
  const rows = newSettings.map(s => `
    <tr>
      <td>${s.size ? s.size + 'mm' : '-'}</td>
      <td>${s.typeB || '-'}</td>
      <td><span class="badge badge-purple">${s.typeA || '-'}</span></td>
      <td>
        <span style="font-size:20px;font-weight:800;color:var(--primary)">${s.defaultQuantity}</span>
        <span style="color:var(--text-muted);font-size:13px"> 顆</span>
      </td>
      <td>
        <div class="btn-group">
          <button class="btn btn-secondary btn-sm" onclick="openEditModal('${s.specKey}','${s.size}','${s.typeA}','${s.typeB}',${s.defaultQuantity})">編輯</button>
          <button class="btn btn-danger btn-sm" onclick="deleteSetting('${s.specKey}','${s.displayName}')">刪除</button>
        </div>
      </td>
    </tr>`).join('');

  container.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
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

let editingSpecKey = null;

function openEditModal(specKey, size, typeA, typeB, defaultQty) {
  editingSpecKey = specKey;
  document.getElementById('modal-title').textContent = '編輯規格設定';
  document.getElementById('s-size').value = size;
  document.getElementById('s-typeA').value = typeA;
  document.getElementById('s-typeB').value = typeB;
  document.getElementById('s-defaultQty').value = defaultQty;
  openModal('addModal');
}

async function submitSetting() {
  const get = id => document.getElementById(id).value.trim();
  const data = {
    size: get('s-size'),
    typeA: get('s-typeA'),
    typeB: get('s-typeB'),
    defaultQuantity: parseInt(get('s-defaultQty')) || 0
  };

  if (!data.size || !data.typeA || !data.typeB) {
    showToast('請填寫所有必填欄位', 'warning'); return;
  }
  if (!data.defaultQuantity || data.defaultQuantity < 1) {
    showToast('請填寫有效的預設顆數', 'warning'); return;
  }

  const errEl = document.getElementById('setting-error');
  errEl.style.display = 'none'; errEl.textContent = '';

  // 新增模式才做重複檢查
  if (!editingSpecKey) {
    const exists = await checkInitialStockSettingExists(data);
    if (exists) {
      errEl.textContent = `「${data.size}mm ${data.typeB} ${data.typeA}」規格已存在，請直接編輯該筆設定`;
      errEl.style.display = 'block';
      return;
    }
  }

  try {
    const btn = document.querySelector('#addModal .btn-primary');
    btn.disabled = true; btn.textContent = '儲存中...';
    const result = await setInitialStockSetting(data);
    const msg = result.updatedCount > 0
      ? `已儲存！同時更新庫存中 ${result.updatedCount} 個符合項目的數量為 ${data.defaultQuantity} 顆`
      : `已儲存：${data.size}mm ${data.typeB} ${data.typeA} → ${data.defaultQuantity} 顆`;
    showToast(msg, 'success', 6000);
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
  ['s-size','s-typeB','s-defaultQty'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('s-typeA').value = '';
  document.getElementById('modal-title').textContent = '＋ 新增規格設定';
  const errEl = document.getElementById('setting-error');
  if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
  editingSpecKey = null;
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

