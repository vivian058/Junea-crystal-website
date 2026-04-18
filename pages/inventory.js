// =============================================
// 庫存表
// =============================================

let damagingSpecKey = '';
let damagingDisplayName = '';

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('navbar-root').innerHTML = renderNav('庫存表');
  await loadInventory();
});

// ─── 載入庫存 ─────────────────────────────

async function loadInventory() {
  const crystalContainer = document.getElementById('crystal-table');
  crystalContainer.innerHTML = loadingState();

  try {
    const all = await getInventory();
    const crystals = all.filter(i => i.type === 'crystal' || !i.type);

    renderCrystalTable(crystals);
    renderLowStockAlerts(all);
  } catch(e) {
    document.getElementById('crystal-table').innerHTML =
      `<div class="empty-state"><div class="empty-state-text">${e.message}</div></div>`;
  }
}

// ─── 低庫存警示 ───────────────────────────

function renderLowStockAlerts(items) {
  const lowItems = items.filter(i => i.quantity < 20);
  const alertsEl = document.getElementById('low-stock-alerts');
  if (!lowItems.length) { alertsEl.innerHTML = ''; return; }

  alertsEl.innerHTML = `
    <div class="inline-alert inline-alert-danger mb-20">
      <strong>低庫存警示</strong>：以下品項庫存低於 20，請注意補貨！<br>
      ${lowItems.map(i => `&nbsp;&nbsp;・${i.displayName}：剩 <strong>${i.quantity}</strong> 顆`).join('<br>')}
    </div>`;
}

// ─── 水晶庫存表格 ─────────────────────────

function renderCrystalTable(items) {
  const container = document.getElementById('crystal-table');
  if (!items.length) {
    container.innerHTML = emptyState('', '尚無庫存紀錄。進貨水晶後會自動建立庫存（需先設定初始庫存）');
    return;
  }

  const rows = items.map(item => {
    const qty = item.quantity || 0;
    let qtyClass = qty >= 50 ? 'qty-ok' : qty >= 20 ? 'qty-warn' : 'qty-danger';
    const isLow = qty < 20;

    return `
      <tr class="${isLow ? 'low-stock' : ''}">
        <td><strong>${item.displayName || item.specKey}</strong></td>
        <td class="qty-cell">
          <span class="qty-big ${qtyClass}">${qty}</span>
          <span style="font-size:12px;color:var(--text-muted)"> 顆</span>
          ${isLow ? '<span class="badge badge-danger" style="margin-left:6px">補貨</span>' : ''}
        </td>
        <td class="td-muted">${item.lastUpdated ? (item.lastUpdated.toDate ? item.lastUpdated.toDate().toLocaleDateString('zh-TW') : '') : '-'}</td>
        <td>
          <div class="action-btns">
            <button class="btn btn-secondary btn-sm" onclick="openDamageModal('${item.id}', '${item.displayName}')">記錄耗損</button>
          </div>
        </td>
      </tr>`;
  }).join('');

  container.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>規格</th>
            <th>庫存數量</th>
            <th>最後更新</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
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

    if (newQty < 20) {
      showToast(`「${damagingDisplayName}」庫存剩 ${newQty} 顆，請注意補貨！`, 'danger', 6000);
    }

    closeModal('damageModal');
    await loadInventory();
  } catch(e) {
    showToast(`記錄失敗：${e.message}`, 'danger');
  } finally {
    const btn = document.querySelector('#damageModal .btn-primary');
    if (btn) { btn.disabled = false; btn.textContent = '確認扣除'; }
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

    if (!alerts.some(a => a.type === 'danger')) {
      showToast(`「${braceletName}」× ${qty} 條出貨完成！`, 'success');
    }

    await loadInventory();
  } catch(e) {
    resultEl.innerHTML = `<div class="inline-alert inline-alert-danger">${e.message}</div>`;
    showToast(`出貨失敗：${e.message}`, 'danger');
  } finally {
    const btn = document.querySelector('#shipModal .btn-gold');
    if (btn) { btn.disabled = false; btn.textContent = '確認出貨'; }
  }
}
