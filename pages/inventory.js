// =============================================
// 庫存表
// =============================================

let allInventory = [];
let initialSettingKeys = new Set(); // 有初始庫存設定的 specKey（正規化後）

// 正規化 patternKey，讓 4*6 / 4×6 / 4x6 / 5~6 / 5-6 都能互相匹配
function normalizePatternKey(key) {
  return String(key || '')
    .replace(/[×✕*xX]/g, 'X')
    .replace(/[~－—–-]/g, '~')
    .toLowerCase();
}
let editingSpecKey = '';
let crystalColFilter = { name: [], size: [], typeB: [], typeA: [] };
let _activeFilterCol = null;

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('navbar-root').innerHTML = renderNav('庫存表');
  await loadInventory();
});

// ─── 載入庫存 ─────────────────────────────

async function loadInventory() {
  const crystalContainer = document.getElementById('crystal-table');
  crystalContainer.innerHTML = loadingState();

  try {
    const [inventory, settings] = await Promise.all([
      getInventory(),
      getInitialStockSettings()
    ]);
    allInventory = inventory;
    // 只保留通用規格鍵（SIZE_ 開頭），正規化後存入 Set
    initialSettingKeys = new Set(settings.filter(s => s.specKey && s.specKey.startsWith('SIZE_')).map(s => normalizePatternKey(s.specKey)));
    renderLowStockAlerts(allInventory);
    filterInventory();
  } catch(e) {
    document.getElementById('crystal-table').innerHTML =
      `<div class="empty-state"><div class="empty-state-text">${e.message}</div></div>`;
  }
}

// ─── 搜尋過濾 ─────────────────────────────

function filterInventory() {
  const kw = (document.getElementById('f-keyword').value || '').toLowerCase();
  const { name, size, typeB, typeA } = crystalColFilter;

  let filtered = kw
    ? allInventory.filter(i => (i.displayName || '').toLowerCase().includes(kw) || (i.specKey || '').toLowerCase().includes(kw))
    : allInventory;

  const crystals = filtered
    .filter(i => i.type === 'crystal' || !i.type)
    .filter(i => {
      const parts = (i.displayName || '').split(' ');
      const cn = (i.crystalName || parts[0] || '');
      const sz = String(i.size || parts[1] || '').replace(/mm$/i, '').trim();
      const tb = (i.typeB || parts[2] || '');
      const ta = (i.typeA || parts[3] || '');
      return (!name.length || name.includes(cn))
        && (!size.length || size.includes(sz))
        && (!typeB.length || typeB.includes(tb))
        && (!typeA.length || typeA.includes(ta));
    });
  const accessories = filtered.filter(i => i.type === 'accessory');

  renderCrystalTable(crystals);
  renderAccessoryTable(accessories);
}

// ─── 欄位下拉篩選 ─────────────────────────

function _getColValues(field) {
  const vals = new Set();
  allInventory.filter(i => i.type === 'crystal' || !i.type).forEach(i => {
    const parts = (i.displayName || '').split(' ');
    if (field === 'name') vals.add(i.crystalName || parts[0] || '');
    else if (field === 'size') vals.add(String(i.size || parts[1] || '').replace(/mm$/i,'').trim());
    else if (field === 'typeB') vals.add(i.typeB || parts[2] || '');
    else if (field === 'typeA') vals.add(i.typeA || parts[3] || '');
  });
  return [...vals].filter(Boolean).sort();
}

function openColFilter(event, field) {
  event.stopPropagation();
  const btn = event.currentTarget;
  const rect = btn.getBoundingClientRect();
  const dd = document.getElementById('col-filter-dd');
  _activeFilterCol = field;

  const vals = _getColValues(field);
  const selected = new Set(crystalColFilter[field]);
  const allChecked = selected.size === 0;

  document.getElementById('cfd-all').checked = allChecked;
  document.getElementById('cfd-options').innerHTML = vals.map(v =>
    `<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;padding:3px 4px;border-radius:4px" onmouseover="this.style.background='#f5f0ff'" onmouseout="this.style.background=''">
      <input type="checkbox" value="${v.replace(/"/g,'&quot;')}" ${allChecked || selected.has(v) ? 'checked' : ''}> ${v}
    </label>`
  ).join('');

  document.getElementById('cfd-all').onchange = function() {
    document.querySelectorAll('#cfd-options input[type=checkbox]').forEach(c => c.checked = this.checked);
  };
  document.querySelectorAll('#cfd-options input[type=checkbox]').forEach(c => {
    c.onchange = () => {
      const all = document.querySelectorAll('#cfd-options input[type=checkbox]');
      const allCk = [...all].every(x => x.checked);
      document.getElementById('cfd-all').checked = allCk;
    };
  });

  dd.style.display = 'block';
  const ddW = 180;
  let left = rect.left + window.scrollX;
  if (left + ddW > window.innerWidth) left = window.innerWidth - ddW - 8;
  dd.style.left = left + 'px';
  dd.style.top = (rect.bottom + window.scrollY + 4) + 'px';
}

function applyColFilter() {
  if (!_activeFilterCol) return;
  const boxes = document.querySelectorAll('#cfd-options input[type=checkbox]');
  const allChecked = document.getElementById('cfd-all').checked;
  if (allChecked || [...boxes].every(b => b.checked)) {
    crystalColFilter[_activeFilterCol] = [];
  } else {
    crystalColFilter[_activeFilterCol] = [...boxes].filter(b => b.checked).map(b => b.value);
  }
  closeColFilter();
  filterInventory();
}

function clearColFilter() {
  if (!_activeFilterCol) return;
  crystalColFilter[_activeFilterCol] = [];
  document.getElementById('cfd-all').checked = true;
  document.querySelectorAll('#cfd-options input[type=checkbox]').forEach(c => c.checked = true);
}

function closeColFilter() {
  document.getElementById('col-filter-dd').style.display = 'none';
  _activeFilterCol = null;
}

document.addEventListener('click', (e) => {
  const dd = document.getElementById('col-filter-dd');
  if (dd && !dd.contains(e.target)) closeColFilter();
});


// ─── 行內編輯 ────────────────────────────

function startInlineEdit(event, specKey, field, currentVal, optionsStr) {
  event.stopPropagation();
  const td = event.currentTarget;
  if (td.querySelector('input')) return; // 已在編輯中
  const original = td.innerHTML;
  td.innerHTML = '';

  const dlId = 'ie-dl-' + field;
  if (optionsStr) {
    const dl = document.createElement('datalist');
    dl.id = dlId;
    optionsStr.split(',').forEach(o => { const opt = document.createElement('option'); opt.value = o.trim(); dl.appendChild(opt); });
    td.appendChild(dl);
  }

  const input = document.createElement('input');
  input.value = currentVal;
  if (optionsStr) input.setAttribute('list', dlId);
  input.style.cssText = 'width:90%;font-size:13px;border:1px solid var(--primary);border-radius:4px;padding:2px 6px;outline:none';
  input.onblur = async () => {
    const val = input.value.trim();
    if (!val || val === currentVal) { td.innerHTML = original; return; }
    try {
      await updateInventoryField(specKey, field, val);
      await loadInventory();
    } catch(e) {
      showToast('儲存失敗：' + e.message, 'danger');
      td.innerHTML = original;
    }
  };
  input.onkeydown = (e) => {
    if (e.key === 'Enter') input.blur();
    if (e.key === 'Escape') { td.innerHTML = original; }
  };
  td.appendChild(input);
  input.focus();
  input.select();
}

// ─── 低庫存警示 ───────────────────────────

function renderLowStockAlerts(items) {
  // 排除「待設定」項目（數量 0 且無初始設定）
  const lowItems = items.filter(i => {
    const qty = i.quantity || 0;
    if (qty >= 20) return false;
    if (i.type === 'crystal') {
      const pk = makeCrystalPatternKey(i.size || '', i.typeA || '', i.typeB || '');
      if (qty === 0 && !initialSettingKeys.has(normalizePatternKey(pk))) return false;
    } else {
      if (qty === 0 && !initialSettingKeys.has(normalizePatternKey(i.specKey || i.id))) return false;
    }
    return true;
  });
  const alertsEl = document.getElementById('low-stock-alerts');
  if (!lowItems.length) { alertsEl.innerHTML = ''; return; }
  alertsEl.innerHTML = `
    <div class="inline-alert inline-alert-danger mb-20">
      <strong>低庫存警示</strong>：以下品項庫存低於 20，請注意補貨！<br>
      ${lowItems.map(i => `&nbsp;&nbsp;・${i.displayName}：剩 <strong>${i.quantity}</strong> 顆`).join('<br>')}
    </div>`;
}

// ─── 渲染表格（水晶）─────────────────────

function buildLogEntries(item) {
  const damageLogs = Object.entries(item.damageLog || {})
    .map(([key, v]) => ({ ts: Number(key), kind: 'damage', key, ...v }));
  const restockLogs = Object.entries(item.restockLog || {})
    .map(([key, v]) => ({ ts: Number(String(key).split('_')[0]), kind: 'restock', key, ...v }));
  return [...damageLogs, ...restockLogs].sort((a, b) => b.ts - a.ts);
}

function buildCrystalInventoryRows(items) {
  if (!items.length) return '<div class="empty-state"><div class="empty-state-text">\u7121\u7b26\u5408\u9805\u76ee</div></div>';

  const rows = items.flatMap(item => {
    const qty = item.quantity || 0;
    const specKey = item.specKey || item.id;
    const displayName = item.displayName || item.specKey || '';
    const parts = displayName.split(' ');
    const crystalName = item.crystalName || parts[0] || '-';
    const size = String(item.size || parts[1] || '').replace(/mm$/i, '').trim();
    const typeB = item.typeB || parts[2] || '-';
    const typeA = item.typeA || parts[3] || '-';
    const patternKey = makeCrystalPatternKey(size, typeA, typeB);
    const needsSetup = qty === 0 && !initialSettingKeys.has(normalizePatternKey(patternKey));
    const isLow = !needsSetup && qty < 20;
    const qtyClass = needsSetup ? 'qty-warn' : qty >= 50 ? 'qty-ok' : qty >= 20 ? 'qty-warn' : 'qty-danger';
    const logs = buildLogEntries(item);
    const logCount = logs.length;
    const safeId = item.id.replace(/[^a-zA-Z0-9_-]/g, '_');
    const dn = displayName.replace(/'/g, "\\'");
    const logRows = logs.map(l => {
      const color = l.kind === 'restock' ? 'var(--success)' : 'var(--danger)';
      const sign = l.kind === 'restock' ? '＋' : '－';
      const ek = l.key.replace(/'/g, "\\'");
      const en = (l.note || '').replace(/'/g, "\\'");
      const ei = item.id.replace(/'/g, "\\'");
      return '<tr class="log-row-' + safeId + '" style="display:none;background:#faf6ff">' +
        '<td></td>' +
        '<td style="font-size:12px;color:var(--text-muted);padding:5px 12px">' + (l.date || '-') + '</td>' +
        '<td colspan="3"></td>' +
        '<td style="font-size:12px;font-weight:700;padding:5px 12px;color:' + color + '">' + sign + l.amount + '</td>' +
        '<td style="font-size:12px;color:var(--text-muted);padding:5px 12px">' + (l.note || '-') + '</td>' +
        '<td style="padding:5px 12px">' +
        '<button style="background:none;border:none;cursor:pointer;font-size:12px;font-weight:700;color:var(--text-muted);padding:2px 6px" onclick="deleteLogEntryUI(\'' + ei + '\',\'' + l.kind + '\',\'' + ek + '\')">刪</button>' +
        '</td>' +
        '</tr>';
    }).join('');

    return [
      `<tr>
        <td style="text-align:center;padding:8px 6px">
          <input type="checkbox" class="inv-check-crystal" value="${item.id}" onchange="updateInvBulkBar('crystal')">
        </td>
        <td ondblclick="startInlineEdit(event,'${item.id}','crystalName','${crystalName.replace(/'/g,"&apos;")}')" title="雙擊可編輯" style="cursor:text"><strong>${crystalName}</strong></td>
        <td ondblclick="startInlineEdit(event,'${item.id}','size','${size}')" title="雙擊可編輯" style="cursor:text">${size}</td>
        <td ondblclick="startInlineEdit(event,'${item.id}','typeB','${typeB}','圓珠,扁刻面,算盤珠,心形,水滴,橢圓,方形,近圓,螺紋米珠')" title="雙擊可編輯" style="cursor:text">${typeB}</td>
        <td ondblclick="startInlineEdit(event,'${item.id}','typeA','${typeA}','條珠,成品串,條珠三圈')" title="雙擊可編輯" style="cursor:text"><span class="badge badge-purple">${typeA}</span></td>
        <td>
          <span class="qty-big ${qtyClass}">${qty}</span>
          <span style="font-size:12px;color:var(--text-muted)"> 顆</span>
          ${needsSetup ? '<span class="badge badge-warning" style="margin-left:6px">初始資料待設定</span>' : ''}
          ${isLow ? '<span class="badge badge-danger" style="margin-left:6px">補貨</span>' : ''}
        </td>
        <td class="td-muted">${item.lastUpdated ? (item.lastUpdated.toDate ? item.lastUpdated.toDate().toLocaleDateString('zh-TW') : '') : '-'}</td>
        <td>
          <div class="action-btns">
            <button class="btn btn-secondary btn-sm" onclick="openAdjustModal('${item.id}','${dn}',${qty})">調整</button>
            <button class="btn btn-danger btn-sm" onclick="deleteInv('${item.id}','${dn}')">刪除</button>
            <button class="log-toggle" onclick="toggleLog('${safeId}')">
              調整紀錄${logCount ? ` (${logCount})` : ''} ▾
            </button>
          </div>
        </td>
      </tr>`,
      logRows
    ];
  }).join('');

  return `
    <div id="inv-bulk-bar-crystal" style="display:none;padding:10px 16px;background:var(--primary-light);border-radius:6px;margin-bottom:8px;align-items:center;gap:12px">
      <span id="inv-bulk-count-crystal" style="font-size:13px;color:var(--primary-dark);font-weight:600"></span>
      <button class="btn btn-danger btn-sm" onclick="deleteInvSelected('crystal')">刪除已選</button>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th style="width:40px;text-align:center">
              <input type="checkbox" id="inv-check-all-crystal" onchange="toggleInvSelectAll(this,'crystal')" title="全選">
            </th>
            ${['name','size','typeB','typeA'].map((f, i) => {
              const labels = ['水晶名稱','尺寸','形狀','規格'];
              const widths = ['min-width:100px','min-width:70px','min-width:80px','min-width:80px'];
              const active = crystalColFilter[f].length > 0;
              return `<th style="${widths[i]}"><span style="display:flex;align-items:center;gap:4px">${labels[i]}<button onclick="openColFilter(event,'${f}')" style="background:none;border:none;cursor:pointer;font-size:14px;padding:0;line-height:1;color:${active ? 'var(--primary)' : 'var(--text-muted)'}" title="篩選">▾</button></span></th>`;
            }).join('')}
            <th style="min-width:130px">庫存數量</th>
            <th style="min-width:100px">最後更新</th>
            <th style="min-width:360px">操作</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

// ─── 渲染表格（配件）─────────────

function buildAccessoryInventoryRows(items) {
  if (!items.length) return '<div class="empty-state"><div class="empty-state-text">\u7121\u7b26\u5408\u9805\u76ee</div></div>';

  const rows = items.flatMap(item => {
    const qty = item.quantity || 0;
    const specKey = item.specKey || item.id;
    const needsSetup = qty === 0 && !initialSettingKeys.has(normalizePatternKey(specKey));
    const isLow = !needsSetup && qty < 20;
    const qtyClass = needsSetup ? 'qty-warn' : qty >= 50 ? 'qty-ok' : qty >= 20 ? 'qty-warn' : 'qty-danger';
    const logs = buildLogEntries(item);
    const logCount = logs.length;
    const safeId = item.id.replace(/[^a-zA-Z0-9_-]/g, '_');
    const displayName = item.displayName || item.specKey || '';
    const dn = displayName.replace(/'/g, "\\'");
    const logRows = logs.map(l => {
      const color = l.kind === 'restock' ? 'var(--success)' : 'var(--danger)';
      const sign = l.kind === 'restock' ? '＋' : '－';
      const ek = l.key.replace(/'/g, "\\'");
      const en = (l.note || '').replace(/'/g, "\\'");
      const ei = item.id.replace(/'/g, "\\'");
      return '<tr class="log-row-' + safeId + '" style="display:none;background:#faf6ff">' +
        '<td></td>' +
        '<td style="font-size:12px;color:var(--text-muted);padding:5px 12px">' + (l.date || '-') + '</td>' +
        '<td colspan="2"></td>' +
        '<td style="font-size:12px;font-weight:700;padding:5px 12px;color:' + color + '">' + sign + l.amount + '</td>' +
        '<td style="font-size:12px;color:var(--text-muted);padding:5px 12px">' + (l.note || '-') + '</td>' +
        '<td style="padding:5px 12px">' +
        '<button style="background:none;border:none;cursor:pointer;font-size:12px;font-weight:700;color:var(--text-muted);padding:2px 6px" onclick="deleteLogEntryUI(\'' + ei + '\',\'' + l.kind + '\',\'' + ek + '\')">刪</button>' +
        '</td>' +
        '</tr>';
    }).join('');

    return [
      `<tr>
        <td style="text-align:center;padding:8px 6px">
          <input type="checkbox" class="inv-check-accessory" value="${item.id}" onchange="updateInvBulkBar('accessory')">
        </td>
        <td ondblclick="startInlineEdit(event,'${item.id}','productName','${(item.productName||displayName).replace(/'/g,"&apos;")}')" title="雙擊可編輯" style="cursor:text"><strong>${item.productName || displayName}</strong></td>
        <td ondblclick="startInlineEdit(event,'${item.id}','itemCode','${(item.itemCode||'').replace(/'/g,"&apos;")}')" title="雙擊可編輯" style="cursor:text">${item.itemCode ? `<span class="badge badge-purple">${item.itemCode}</span>` : '-'}</td>
        <td ondblclick="startInlineEdit(event,'${item.id}','spec','${(item.spec||'').replace(/'/g,"&apos;")}')" title="雙擊可編輯" style="cursor:text">${fmtSpec(item.spec)}</td>
        <td>
          <span class="qty-big ${qtyClass}">${qty}</span>
          <span style="font-size:12px;color:var(--text-muted)"> 個</span>
          ${needsSetup ? '<span class="badge badge-warning" style="margin-left:6px">初始資料待設定</span>' : ''}
          ${isLow ? '<span class="badge badge-danger" style="margin-left:6px">補貨</span>' : ''}
        </td>
        <td class="td-muted">${item.lastUpdated ? (item.lastUpdated.toDate ? item.lastUpdated.toDate().toLocaleDateString('zh-TW') : '') : '-'}</td>
        <td>
          <div class="action-btns">
            <button class="btn btn-secondary btn-sm" onclick="openAdjustModal('${item.id}','${dn}',${qty})">調整</button>
            <button class="btn btn-danger btn-sm" onclick="deleteInv('${item.id}','${dn}')">刪除</button>
            <button class="log-toggle" onclick="toggleLog('${safeId}')">
              調整紀錄${logCount ? ` (${logCount})` : ''} ▾
            </button>
          </div>
        </td>
      </tr>`,
      logRows
    ];
  }).join('');

  return `
    <div id="inv-bulk-bar-accessory" style="display:none;padding:10px 16px;background:var(--primary-light);border-radius:6px;margin-bottom:8px;align-items:center;gap:12px">
      <span id="inv-bulk-count-accessory" style="font-size:13px;color:var(--primary-dark);font-weight:600"></span>
      <button class="btn btn-danger btn-sm" onclick="deleteInvSelected('accessory')">刪除已選</button>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th style="width:40px;text-align:center">
              <input type="checkbox" id="inv-check-all-accessory" onchange="toggleInvSelectAll(this,'accessory')" title="全選">
            </th>
            <th style="min-width:150px">商品名稱</th>
            <th style="min-width:100px">貨號</th>
            <th style="min-width:80px">規格</th>
            <th style="min-width:130px">庫存數量</th>
            <th style="min-width:100px">最後更新</th>
            <th style="min-width:360px">操作</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function renderCrystalTable(items) {
  document.getElementById('crystal-table').innerHTML = buildCrystalInventoryRows(items);
}

function renderAccessoryTable(items) {
  document.getElementById('accessory-table').innerHTML =
    items.length ? buildAccessoryInventoryRows(items)
      : '<div style="text-align:center;padding:24px;color:var(--text-muted);font-size:13px">尚無配件庫存紀錄</div>';
}

// ─── 區塊收縮 ─────────────────────────────

const _sectionOpen = { crystal: true, accessory: true };

function toggleSection(name) {
  _sectionOpen[name] = !_sectionOpen[name];
  const section = document.getElementById(name + '-section');
  const icon = document.getElementById(name + '-toggle-icon');
  if (section) section.style.display = _sectionOpen[name] ? '' : 'none';
  if (icon) icon.textContent = _sectionOpen[name] ? '▾' : '▸';
}

// ─── 全選 / 批次刪除（庫存）──────────────

function toggleInvSelectAll(el, prefix) {
  document.querySelectorAll(`.inv-check-${prefix}`).forEach(c => c.checked = el.checked);
  updateInvBulkBar(prefix);
}

function updateInvBulkBar(prefix) {
  const checked = document.querySelectorAll(`.inv-check-${prefix}:checked`);
  const bar = document.getElementById(`inv-bulk-bar-${prefix}`);
  const checkAll = document.getElementById(`inv-check-all-${prefix}`);
  if (!bar) return;
  if (checked.length > 0) {
    bar.style.display = 'flex';
    document.getElementById(`inv-bulk-count-${prefix}`).textContent = `已選 ${checked.length} 筆`;
    const total = document.querySelectorAll(`.inv-check-${prefix}`).length;
    if (checkAll) {
      checkAll.checked = checked.length === total;
      checkAll.indeterminate = checked.length > 0 && checked.length < total;
    }
  } else {
    bar.style.display = 'none';
    if (checkAll) { checkAll.checked = false; checkAll.indeterminate = false; }
  }
}

async function deleteInvSelected(prefix) {
  const ids = [...document.querySelectorAll(`.inv-check-${prefix}:checked`)].map(c => c.value);
  if (!ids.length) return;
  if (!confirmDialog(`確定要刪除選取的 ${ids.length} 筆庫存紀錄嗎？此操作無法復原。`)) return;
  try {
    await Promise.all(ids.map(id => deleteInventoryItem(id)));
    showToast(`已刪除 ${ids.length} 筆`, 'success');
    await loadInventory();
  } catch(e) {
    showToast(`刪除失敗：${e.message}`, 'danger');
  }
}

// ─── 展開 / 收合耗損紀錄 ──────────────────

function toggleLog(safeId) {
  const rows = document.querySelectorAll(`.log-row-${safeId}`);
  if (!rows.length) return;
  const isHidden = rows[0].style.display === 'none';
  rows.forEach(r => r.style.display = isHidden ? '' : 'none');
}

// ─── 調整庫存 ─────────────────────────────

function openAdjustModal(specKey, displayName, qty) {
  editingSpecKey = specKey;
  document.getElementById('adj-spec').value = displayName;
  document.getElementById('adj-current').textContent = `目前：${qty} 顆`;
  document.getElementById('adj-amount').value = '';
  document.getElementById('adj-note').value = '';
  document.querySelector('input[name="adj-type"][value="damage"]').checked = true;
  onAdjTypeChange();
  openModal('adjustModal');
}

function onAdjTypeChange() {
  const type = document.querySelector('input[name="adj-type"]:checked')?.value;
  const label = document.getElementById('adj-amount-label');
  if (type === 'damage') label.textContent = '扣除顆數';
  else if (type === 'restock') label.textContent = '補入顆數';
  else label.textContent = '設定總量';
}

async function submitAdjust() {
  const type = document.querySelector('input[name="adj-type"]:checked')?.value;
  const amount = parseInt(document.getElementById('adj-amount').value);
  const note = document.getElementById('adj-note').value.trim();
  if (!type) { showToast('請選擇調整方式', 'warning'); return; }
  if (isNaN(amount) || amount < 0) { showToast('請填寫有效數量', 'warning'); return; }

  try {
    const btn = document.querySelector('#adjustModal .btn-primary');
    btn.disabled = true; btn.textContent = '處理中...';
    const newQty = await logManualAdjust(editingSpecKey, type, amount, note);
    const typeLabel = type === 'damage' ? '耗損' : type === 'restock' ? '補入' : '設定';
    showToast(`調整完成（${typeLabel}）→ 庫存現為 ${newQty} 顆`, 'success');
    if (newQty < 20 && type !== 'set') showToast(`庫存剩 ${newQty} 顆，低於 20，請注意補貨！`, 'danger', 6000);
    closeModal('adjustModal');
    await loadInventory();
  } catch(e) {
    showToast(`調整失敗：${e.message}`, 'danger');
  } finally {
    const btn = document.querySelector('#adjustModal .btn-primary');
    if (btn) { btn.disabled = false; btn.textContent = '確認'; }
  }
}


// ─── 調整紀錄 改/刪 ──────────────────────

let editingLogInfo = null;

async function deleteLogEntryUI(specKey, logType, logKey) {
  if (!confirmDialog('確定要刪除這筆紀錄嗎？')) return;
  try {
    await deleteLogEntry(specKey, logType, logKey);
    showToast('已刪除', 'success');
    await loadInventory();
  } catch(e) {
    showToast(`刪除失敗：${e.message}`, 'danger');
  }
}

function openEditLogModal(specKey, logType, logKey, amount, note) {
  editingLogInfo = { specKey, logType, logKey };
  document.getElementById('elog-amount').value = amount;
  document.getElementById('elog-note').value = note;
  openModal('editLogModal');
}

async function submitEditLog() {
  const amount = parseInt(document.getElementById('elog-amount').value);
  const note = document.getElementById('elog-note').value.trim();
  if (isNaN(amount) || amount < 0) { showToast('請填寫有效數量', 'warning'); return; }
  try {
    const btn = document.querySelector('#editLogModal .btn-primary');
    btn.disabled = true; btn.textContent = '儲存中...';
    await updateLogEntry(editingLogInfo.specKey, editingLogInfo.logType, editingLogInfo.logKey, amount, note);
    showToast('已更新', 'success');
    closeModal('editLogModal');
    await loadInventory();
  } catch(e) {
    showToast(`更新失敗：${e.message}`, 'danger');
  } finally {
    const btn = document.querySelector('#editLogModal .btn-primary');
    if (btn) { btn.disabled = false; btn.textContent = '儲存'; }
  }
}

// ─── 刪除庫存項目 ─────────────────────────

async function deleteInv(specKey, displayName) {
  if (!confirmDialog(`確定要刪除「${displayName}」的庫存紀錄嗎？此操作無法復原。`)) return;
  try {
    await deleteInventoryItem(specKey);
    showToast('已刪除', 'success');
    await loadInventory();
  } catch(e) {
    showToast(`刪除失敗：${e.message}`, 'danger');
  }
}

// ─── 手動新增水晶庫存 ─────────────────────

function openAddCrystalModal() {
  ['ac-name','ac-size','ac-typeB','ac-typeA'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('ac-qty').value = '0';
  document.getElementById('ac-error').style.display = 'none';
  openModal('addCrystalModal');
}

async function submitAddCrystal() {
  const get = id => document.getElementById(id).value.trim();
  const crystalName = get('ac-name');
  const size = get('ac-size');
  const typeB = get('ac-typeB');
  const typeA = get('ac-typeA');
  const qty = parseInt(document.getElementById('ac-qty').value) || 0;
  const errEl = document.getElementById('ac-error');
  errEl.style.display = 'none';
  if (!crystalName || !size || !typeB || !typeA) {
    errEl.textContent = '請填寫所有必填欄位';
    errEl.style.display = 'block';
    return;
  }
  const btn = document.querySelector('#addCrystalModal .btn-primary');
  btn.disabled = true; btn.textContent = '新增中...';
  try {
    await addCrystalInventoryManual({ crystalName, size, typeB, typeA, quantity: qty });
    showToast('已新增庫存項目', 'success');
    closeModal('addCrystalModal');
    await loadInventory();
  } catch(e) {
    errEl.textContent = `新增失敗：${e.message}`;
    errEl.style.display = 'block';
  } finally {
    btn.disabled = false; btn.textContent = '新增';
  }
}

// ─── 水晶 / 配件進貨更新 ──────────────────

function runSyncCrystal() {
  // 預設今天
  const today = new Date().toISOString().slice(0, 10);
  document.getElementById('sync-date').value = today;
  openModal('syncDateModal');
}

async function confirmSyncCrystal() {
  const dateStr = document.getElementById('sync-date').value;
  if (!dateStr) { showToast('請選擇進貨日期', 'warning'); return; }
  const btn = document.querySelector('#syncDateModal .btn-primary');
  btn.disabled = true; btn.textContent = '更新中...';
  try {
    const result = await syncCrystalInventoryByDate(dateStr);
    closeModal('syncDateModal');
    if (!result.updated.length && !result.noSetting.length) {
      showToast(`${dateStr} 無進貨紀錄`, 'info');
    } else {
      if (result.updated.length) {
        showToast(`已更新 ${result.updated.length} 項水晶庫存（${dateStr}）`, 'success', 6000);
      }
      if (result.noSetting.length) {
        showToast(`以下規格尚未設定初始庫存：${result.noSetting.join('、')}`, 'warning', 10000);
      }
      await loadInventory();
    }
  } catch(e) {
    showToast(`更新失敗：${e.message}`, 'danger');
  } finally {
    btn.disabled = false; btn.textContent = '確認更新';
  }
}

function runSyncAccessory() {
  const today = new Date().toISOString().slice(0, 10);
  document.getElementById('sync-acc-date').value = today;
  openModal('syncAccDateModal');
}

async function confirmSyncAccessory() {
  const dateStr = document.getElementById('sync-acc-date').value;
  if (!dateStr) { showToast('請選擇進貨日期', 'warning'); return; }
  const btn = document.querySelector('#syncAccDateModal .btn-primary');
  btn.disabled = true; btn.textContent = '更新中...';
  try {
    const result = await syncAccessoryInventoryByDate(dateStr);
    closeModal('syncAccDateModal');
    if (!result.updated.length) {
      showToast(`${dateStr} 無配件進貨紀錄`, 'info');
    } else {
      showToast(`已更新 ${result.updated.length} 項配件庫存（${dateStr}）`, 'success', 6000);
      await loadInventory();
    }
  } catch(e) {
    showToast(`更新失敗：${e.message}`, 'danger');
  } finally {
    btn.disabled = false; btn.textContent = '確認更新';
  }
}

// ─── 退貨回庫 ─────────────────────────────

async function submitReturn() {
  const braceletName = document.getElementById('return-name').value.trim();
  const qty = parseInt(document.getElementById('return-qty').value) || 1;
  const resultEl = document.getElementById('return-result');
  resultEl.innerHTML = '';
  if (!braceletName) { showToast('請填寫手鍊名稱', 'warning'); return; }

  try {
    const btn = document.querySelector('#returnModal .btn-primary');
    btn.disabled = true; btn.textContent = '處理中...';
    const results = await processReturn(braceletName, qty);
    const hasWarning = results.some(r => r.missing);
    resultEl.innerHTML = `
      <div class="inline-alert" style="background:#d4edda;color:#155724;border:1px solid #c3e6cb">
        退貨回庫完成！已恢復以下庫存：<br>
        ${results.map(r => r.missing
          ? `&nbsp;&nbsp;・${r.name}：找不到庫存項目，已略過`
          : `&nbsp;&nbsp;・${r.name}：＋${r.restored} 顆`
        ).join('<br>')}
      </div>`;
    if (!hasWarning) showToast(`「${braceletName}」× ${qty} 條退貨回庫完成！`, 'success');
    await loadInventory();
  } catch(e) {
    resultEl.innerHTML = `<div class="inline-alert inline-alert-danger">${e.message}</div>`;
    showToast(`退貨回庫失敗：${e.message}`, 'danger');
  } finally {
    const btn = document.querySelector('#returnModal .btn-primary');
    if (btn) { btn.disabled = false; btn.textContent = '確認退貨回庫'; }
  }
}

// ─── 售價設定 ─────────────────────────────

let allBraceletDesigns = [];

async function openPriceModal() {
  const contentEl = document.getElementById('price-content');
  contentEl.innerHTML = loadingState();
  openModal('priceModal');

  try {
    allBraceletDesigns = await getBraceletDesigns();
    renderPriceList();
  } catch(e) {
    contentEl.innerHTML = `<div class="inline-alert inline-alert-danger">${e.message}</div>`;
  }
}

function renderPriceList() {
  const contentEl = document.getElementById('price-content');
  if (!allBraceletDesigns.length) {
    contentEl.innerHTML = `<div style="text-align:center;padding:24px;color:var(--text-muted);font-size:13px">尚無設計款手鍊，請先至「設計款手鍊」頁面新增。</div>`;
    return;
  }

  contentEl.innerHTML = `
    <p style="font-size:13px;color:var(--text-muted);margin-bottom:12px">設定每款手鍊的對外售價，儲存後立即生效。</p>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th style="min-width:160px">手鍊名稱</th>
            <th style="min-width:90px">成本價</th>
            <th style="min-width:130px">售價 ($)</th>
            <th style="min-width:70px">操作</th>
          </tr>
        </thead>
        <tbody>
          ${allBraceletDesigns.map(d => `
            <tr>
              <td><strong>${d.name || '-'}</strong></td>
              <td style="color:var(--text-muted)">${fmtCurrency(d.baseCost)}</td>
              <td>
                <input class="form-control" id="price-${d.id}" type="number" min="0" step="1"
                  value="${d.sellingPrice || ''}" placeholder="輸入售價"
                  style="padding:4px 8px;font-size:13px;width:110px">
              </td>
              <td>
                <button class="btn btn-primary btn-sm" onclick="saveBraceletPrice('${d.id}')">儲存</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

async function saveBraceletPrice(id) {
  const input = document.getElementById(`price-${id}`);
  if (!input) return;
  const price = parseFloat(input.value) || 0;
  try {
    await updateBraceletSellingPrice(id, price);
    showToast('售價已儲存', 'success');
    const d = allBraceletDesigns.find(x => x.id === id);
    if (d) d.sellingPrice = price;
  } catch(e) {
    showToast(`儲存失敗：${e.message}`, 'danger');
  }
}

// ─── 出貨扣庫存 ───────────────────────────

async function submitShipment() {
  const braceletName = document.getElementById('ship-name').value.trim();
  const qty = parseInt(document.getElementById('ship-qty').value) || 1;
  const resultEl = document.getElementById('ship-result');
  resultEl.innerHTML = '';
  if (!braceletName) { showToast('請填寫手鍊名稱', 'warning'); return; }

  try {
    const btn = document.querySelector('#shipModal .btn-gold');
    btn.disabled = true; btn.textContent = '處理中...';
    const alerts = await processShipment(braceletName, qty);
    resultEl.innerHTML = alerts.length
      ? alerts.map(a => `<div class="inline-alert inline-alert-${a.type === 'danger' ? 'danger' : 'warning'}">${a.msg}</div>`).join('')
      : `<div class="inline-alert" style="background:#d4edda;color:#155724;border:1px solid #c3e6cb">出貨完成，庫存已更新</div>`;
    if (!alerts.some(a => a.type === 'danger')) showToast(`「${braceletName}」× ${qty} 條出貨完成！`, 'success');
    await loadInventory();
  } catch(e) {
    resultEl.innerHTML = `<div class="inline-alert inline-alert-danger">${e.message}</div>`;
    showToast(`出貨失敗：${e.message}`, 'danger');
  } finally {
    const btn = document.querySelector('#shipModal .btn-gold');
    if (btn) { btn.disabled = false; btn.textContent = '確認出貨'; }
  }
}
