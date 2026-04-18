// =============================================
// 庫存表
// =============================================

let allInventory = [];
let damagingSpecKey = '';
let damagingDisplayName = '';
let editingSpecKey = '';

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('navbar-root').innerHTML = renderNav('庫存表');
  await loadInventory();
});

// ─── 載入庫存 ─────────────────────────────

async function loadInventory() {
  const crystalContainer = document.getElementById('crystal-table');
  crystalContainer.innerHTML = loadingState();

  try {
    allInventory = await getInventory();
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
  const filtered = kw
    ? allInventory.filter(i => (i.displayName || '').toLowerCase().includes(kw) || (i.specKey || '').toLowerCase().includes(kw))
    : allInventory;

  const crystals = filtered.filter(i => i.type === 'crystal' || !i.type);
  const accessories = filtered.filter(i => i.type === 'accessory');

  renderCrystalTable(crystals);
  if (accessories.length) renderAccessoryTable(accessories);
}

// ─── 低庫存警示 ───────────────────────────

function renderLowStockAlerts(items) {
  const lowItems = items.filter(i => (i.quantity || 0) < 20);
  const alertsEl = document.getElementById('low-stock-alerts');
  if (!lowItems.length) { alertsEl.innerHTML = ''; return; }
  alertsEl.innerHTML = `
    <div class="inline-alert inline-alert-danger mb-20">
      <strong>低庫存警示</strong>：以下品項庫存低於 20，請注意補貨！<br>
      ${lowItems.map(i => `&nbsp;&nbsp;・${i.displayName}：剩 <strong>${i.quantity}</strong> 顆`).join('<br>')}
    </div>`;
}

// ─── 渲染表格（共用）─────────────────────

function buildInventoryRows(items) {
  if (!items.length) return '<div class="empty-state"><div class="empty-state-text">無符合項目</div></div>';

  const rows = items.flatMap(item => {
    const qty = item.quantity || 0;
    const qtyClass = qty >= 50 ? 'qty-ok' : qty >= 20 ? 'qty-warn' : 'qty-danger';
    const isLow = qty < 20;

    // 解析耗損紀錄
    const logs = Object.entries(item.damageLog || {})
      .map(([ts, v]) => ({ ts: Number(ts), ...v }))
      .sort((a, b) => b.ts - a.ts);
    const logCount = logs.length;

    const logRowsHtml = logCount
      ? logs.map(l => `
          <tr>
            <td>${l.date || '-'}</td>
            <td style="color:var(--danger)">－${l.amount} 顆</td>
            <td>${l.note || '-'}</td>
          </tr>`).join('')
      : `<tr><td colspan="3" class="log-empty">尚無耗損紀錄</td></tr>`;

    const safeId = item.id.replace(/[^a-zA-Z0-9_-]/g, '_');

    return [
      `<tr>
        <td><strong>${item.displayName || item.specKey}</strong></td>
        <td>
          <span class="qty-big ${qtyClass}">${qty}</span>
          <span style="font-size:12px;color:var(--text-muted)"> 顆</span>
          ${isLow ? '<span class="badge badge-danger" style="margin-left:6px">補貨</span>' : ''}
        </td>
        <td class="td-muted">${item.lastUpdated ? (item.lastUpdated.toDate ? item.lastUpdated.toDate().toLocaleDateString('zh-TW') : '') : '-'}</td>
        <td>
          <div class="action-btns">
            <button class="btn btn-secondary btn-sm" onclick="openDamageModal('${item.id}','${item.displayName.replace(/'/g, "\\'")}')">記錄耗損</button>
            <button class="btn btn-secondary btn-sm" onclick="openEditInv('${item.id}','${item.displayName.replace(/'/g, "\\'")}',${qty})">編輯</button>
            <button class="btn btn-danger btn-sm" onclick="deleteInv('${item.id}','${item.displayName.replace(/'/g, "\\'")}')">刪除</button>
            <button class="log-toggle" onclick="toggleLog('log-${safeId}')">
              耗損紀錄${logCount ? ` (${logCount})` : ''} ▾
            </button>
          </div>
        </td>
      </tr>`,
      `<tr id="log-${safeId}" class="log-sub-row" style="display:none">
        <td colspan="4">
          <div class="log-inner">
            <table>
              <thead><tr><th>日期</th><th>耗損量</th><th>備註</th></tr></thead>
              <tbody>${logRowsHtml}</tbody>
            </table>
          </div>
        </td>
      </tr>`
    ];
  }).join('');

  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th style="min-width:200px">規格</th>
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
  document.getElementById('crystal-table').innerHTML = buildInventoryRows(items);
}

function renderAccessoryTable(items) {
  document.getElementById('accessory-table').innerHTML = buildInventoryRows(items);
}

// ─── 展開 / 收合耗損紀錄 ──────────────────

function toggleLog(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const isHidden = el.style.display === 'none';
  el.style.display = isHidden ? '' : 'none';
}

// ─── 耗損紀錄 ─────────────────────────────

function openDamageModal(specKey, displayName) {
  damagingSpecKey = specKey;
  damagingDisplayName = displayName;
  document.getElementById('dmg-spec').value = displayName;
  document.getElementById('dmg-amount').value = '';
  document.getElementById('dmg-note').value = '';
  openModal('damageModal');
}

async function submitDamage() {
  const amount = parseInt(document.getElementById('dmg-amount').value);
  const note = document.getElementById('dmg-note').value.trim();
  if (!amount || amount < 1) { showToast('請填寫耗損顆數', 'warning'); return; }

  try {
    const btn = document.querySelector('#damageModal .btn-primary');
    btn.disabled = true; btn.textContent = '處理中...';
    const newQty = await logDamage(damagingSpecKey, amount, note);
    showToast(`耗損紀錄完成！${damagingDisplayName} 庫存：${newQty} 顆`, 'success');
    if (newQty < 20) showToast(`「${damagingDisplayName}」庫存剩 ${newQty} 顆，請注意補貨！`, 'danger', 6000);
    closeModal('damageModal');
    await loadInventory();
  } catch(e) {
    showToast(`記錄失敗：${e.message}`, 'danger');
  } finally {
    const btn = document.querySelector('#damageModal .btn-primary');
    if (btn) { btn.disabled = false; btn.textContent = '確認扣除'; }
  }
}

// ─── 編輯庫存項目 ─────────────────────────

function openEditInv(specKey, displayName, quantity) {
  editingSpecKey = specKey;
  document.getElementById('edit-displayName').value = displayName;
  document.getElementById('edit-quantity').value = quantity;
  openModal('editInvModal');
}

async function submitEditInv() {
  const displayName = document.getElementById('edit-displayName').value.trim();
  const quantity = parseInt(document.getElementById('edit-quantity').value);
  if (!displayName) { showToast('請填寫顯示名稱', 'warning'); return; }
  if (isNaN(quantity) || quantity < 0) { showToast('請填寫有效庫存數量', 'warning'); return; }

  try {
    const btn = document.querySelector('#editInvModal .btn-primary');
    btn.disabled = true; btn.textContent = '儲存中...';
    await updateInventoryItem(editingSpecKey, { displayName, quantity });
    showToast('庫存已更新', 'success');
    closeModal('editInvModal');
    await loadInventory();
  } catch(e) {
    showToast(`儲存失敗：${e.message}`, 'danger');
  } finally {
    const btn = document.querySelector('#editInvModal .btn-primary');
    if (btn) { btn.disabled = false; btn.textContent = '儲存修改'; }
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
