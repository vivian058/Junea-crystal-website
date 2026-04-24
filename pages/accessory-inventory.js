// =============================================
// 配件庫存
// =============================================

let allInventory = [];
let editingSpecKey = '';

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('navbar-root').innerHTML = renderNav('配件庫存');
  await loadInventory();
});

// ─── 載入庫存 ─────────────────────────────

async function loadInventory() {
  document.getElementById('accessory-table').innerHTML = loadingState();
  try {
    allInventory = await getInventory();
    filterAndRender();
  } catch(e) {
    document.getElementById('accessory-table').innerHTML =
      `<div class="empty-state"><div class="empty-state-text">${e.message}</div></div>`;
  }
}

// ─── 搜尋過濾 ─────────────────────────────

function filterAndRender() {
  const kw = (document.getElementById('f-keyword').value || '').toLowerCase();
  const accessories = allInventory
    .filter(i => i.type === 'accessory')
    .filter(i => !kw ||
      (i.productName || '').toLowerCase().includes(kw) ||
      (i.itemCode || '').toLowerCase().includes(kw) ||
      (i.displayName || '').toLowerCase().includes(kw)
    );
  renderAccessoryTable(accessories);
}

// ─── 渲染表格 ─────────────────────────────

function buildLogEntries(item) {
  const damageLogs = Object.entries(item.damageLog || {})
    .map(([key, v]) => ({ ts: Number(key), kind: 'damage', key, ...v }));
  const restockLogs = Object.entries(item.restockLog || {})
    .map(([key, v]) => ({ ts: Number(String(key).split('_')[0]), kind: 'restock', key, ...v }));
  return [...damageLogs, ...restockLogs].sort((a, b) => b.ts - a.ts);
}

function buildAccessoryInventoryRows(items) {
  if (!items.length) return '<div class="empty-state"><div class="empty-state-text">尚無配件庫存紀錄</div></div>';

  const rows = items.flatMap(item => {
    const qty = item.quantity || 0;
    const isLow = qty > 0 && qty < 20;
    const qtyClass = qty >= 50 ? 'qty-ok' : qty >= 20 ? 'qty-warn' : 'qty-danger';
    const logs = buildLogEntries(item);
    const logCount = logs.length;
    const safeId = item.id.replace(/[^a-zA-Z0-9_-]/g, '_');
    const displayName = item.displayName || item.specKey || '';
    const dn = displayName.replace(/'/g, "\\'");

    const logRows = logs.map(l => {
      const color = l.kind === 'restock' ? 'var(--success)' : 'var(--danger)';
      const sign = l.kind === 'restock' ? '＋' : '－';
      const ek = l.key.replace(/'/g, "\\'");
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
          <input type="checkbox" class="inv-check-accessory" value="${item.id}" onchange="updateBulkBar()">
        </td>
        <td ondblclick="startInlineEdit(event,'${item.id}','productName','${(item.productName||displayName).replace(/'/g,"&apos;")}')" title="雙擊可編輯" style="cursor:text"><strong>${item.productName || displayName}</strong></td>
        <td ondblclick="startInlineEdit(event,'${item.id}','itemCode','${(item.itemCode||'').replace(/'/g,"&apos;")}')" title="雙擊可編輯" style="cursor:text">${item.itemCode ? `<span class="badge badge-purple">${item.itemCode}</span>` : '-'}</td>
        <td ondblclick="startInlineEdit(event,'${item.id}','spec','${(item.spec||'').replace(/'/g,"&apos;")}')" title="雙擊可編輯" style="cursor:text">${fmtSpec(item.spec)}</td>
        <td>
          <span class="qty-big ${qtyClass}">${qty}</span>
          <span style="font-size:12px;color:var(--text-muted)"> 個</span>
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
    <div id="bulk-bar" style="display:none;padding:10px 16px;background:var(--primary-light);border-radius:6px;margin-bottom:8px;align-items:center;gap:12px">
      <span id="bulk-count" style="font-size:13px;color:var(--primary-dark);font-weight:600"></span>
      <button class="btn btn-danger btn-sm" onclick="deleteSelected()">刪除已選</button>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th style="width:40px;text-align:center">
              <input type="checkbox" id="check-all" onchange="toggleSelectAll(this)" title="全選">
            </th>
            <th style="min-width:150px">商品名稱</th>
            <th style="min-width:100px">貨號</th>
            <th style="min-width:80px">規格</th>
            <th style="min-width:130px">庫存數量</th>
            <th style="min-width:100px">最後更新</th>
            <th style="min-width:300px">操作</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function renderAccessoryTable(items) {
  document.getElementById('accessory-table').innerHTML = buildAccessoryInventoryRows(items);
}

// ─── 全選 / 批次刪除 ──────────────────────

function toggleSelectAll(el) {
  document.querySelectorAll('.inv-check-accessory').forEach(c => c.checked = el.checked);
  updateBulkBar();
}

function updateBulkBar() {
  const checked = document.querySelectorAll('.inv-check-accessory:checked');
  const bar = document.getElementById('bulk-bar');
  const checkAll = document.getElementById('check-all');
  if (!bar) return;
  if (checked.length > 0) {
    bar.style.display = 'flex';
    document.getElementById('bulk-count').textContent = `已選 ${checked.length} 筆`;
    const total = document.querySelectorAll('.inv-check-accessory').length;
    if (checkAll) {
      checkAll.checked = checked.length === total;
      checkAll.indeterminate = checked.length > 0 && checked.length < total;
    }
  } else {
    bar.style.display = 'none';
    if (checkAll) { checkAll.checked = false; checkAll.indeterminate = false; }
  }
}

async function deleteSelected() {
  const ids = [...document.querySelectorAll('.inv-check-accessory:checked')].map(c => c.value);
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

// ─── 展開 / 收合紀錄 ──────────────────────

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
  document.getElementById('adj-current').textContent = `目前：${qty} 個`;
  document.getElementById('adj-amount').value = '';
  document.getElementById('adj-note').value = '';
  document.querySelector('input[name="adj-type"][value="damage"]').checked = true;
  onAdjTypeChange();
  openModal('adjustModal');
}

function onAdjTypeChange() {
  const type = document.querySelector('input[name="adj-type"]:checked')?.value;
  const label = document.getElementById('adj-amount-label');
  if (type === 'damage') label.textContent = '扣除數量';
  else if (type === 'restock') label.textContent = '補入數量';
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
    showToast(`調整完成 → 庫存現為 ${newQty} 個`, 'success');
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

// ─── 行內編輯 ─────────────────────────────

function startInlineEdit(event, specKey, field, currentVal, optionsStr) {
  event.stopPropagation();
  const td = event.currentTarget;
  if (td.querySelector('input')) return;
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
    if (val === currentVal) { td.innerHTML = original; return; }
    try {
      await updateInventoryField(specKey, field, val);
      await loadInventory();
    } catch(e) {
      showToast('更新失敗：' + e.message, 'danger');
      td.innerHTML = original;
    }
  };
  input.onkeydown = e => {
    if (e.key === 'Enter') input.blur();
    if (e.key === 'Escape') { td.innerHTML = original; }
  };
  td.appendChild(input);
  input.focus();
  input.select();
}

// ─── 配件進貨更新 ─────────────────────────

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
