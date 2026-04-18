// =============================================
// 水晶成本表
// =============================================

let allRecords = [];

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('navbar-root').innerHTML = renderNav('水晶成本');
  // 預設今天日期
  document.getElementById('a-date').value = new Date().toISOString().split('T')[0];
  await loadFilterOptions();
  await loadRecords();
});

// ─── 載入篩選選項 ─────────────────────────

async function loadFilterOptions() {
  try {
    const opts = await getCrystalFilterOptions();
    fillSelect(document.getElementById('f-crystalName'), opts.crystalNames);
    fillSelect(document.getElementById('f-size'), opts.sizes);
    fillSelect(document.getElementById('f-typeA'), opts.typeAs);
    fillSelect(document.getElementById('f-typeB'), opts.typeBs);
  } catch(e) {
    console.warn('篩選選項載入失敗', e);
  }
}

// ─── 載入紀錄 ─────────────────────────────

async function loadRecords(filters = {}) {
  const container = document.getElementById('table-container');
  container.innerHTML = loadingState();
  try {
    allRecords = await getCrystalCosts(filters);
    renderTable(allRecords);
    renderSummary(allRecords, filters);
  } catch(e) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-text">載入失敗：${e.message}</div></div>`;
  }
}

// ─── 渲染表格 ─────────────────────────────

function renderTable(records) {
  const container = document.getElementById('table-container');
  if (!records.length) {
    container.innerHTML = emptyState('🔮', '尚無進貨紀錄，點右上角「新增進貨」開始記錄');
    return;
  }

  const rows = records.map(r => `
    <tr>
      <td>${fmtDate(r.date)}</td>
      <td><strong>${r.crystalName || '-'}</strong></td>
      <td>${r.size ? r.size + 'mm' : '-'}</td>
      <td>${r.typeB || '-'}</td>
      <td><span class="badge badge-purple">${r.typeA || '-'}</span></td>
      <td>${r.vendor || '-'}</td>
      <td class="td-link">${r.shopLink ? `<a href="${r.shopLink}" target="_blank">連結 ↗</a>` : '-'}</td>
      <td>${fmtYuan(r.pricePerGram)}</td>
      <td>${r.weightPerStrand ? r.weightPerStrand + 'g' : '-'}</td>
      <td>${fmtYuan(r.pricePerStrand)}</td>
      <td>${r.exchangeRate ? r.exchangeRate : '-'}</td>
      <td><strong style="color:var(--primary-dark)">${fmtCurrency(r.costPerBead)}</strong></td>
      <td>
        <button class="btn btn-danger btn-sm" onclick="deleteRecord('${r.id}')">刪除</button>
      </td>
    </tr>`).join('');

  container.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>日期</th>
            <th>水晶</th>
            <th>尺寸</th>
            <th>形狀</th>
            <th>規格</th>
            <th>廠家</th>
            <th>賣場</th>
            <th>克價¥</th>
            <th>重量</th>
            <th>單條¥</th>
            <th>匯率</th>
            <th>單顆成本$</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

// ─── 查詢結果摘要 ─────────────────────────

function renderSummary(records, filters) {
  const summaryEl = document.getElementById('result-summary');
  const hasFilter = Object.values(filters).some(v => v);

  if (!hasFilter || !records.length) {
    summaryEl.style.display = 'none';
    document.getElementById('r-count').textContent = records.length;
    return;
  }

  const costs = records.map(r => Number(r.costPerBead)).filter(v => !isNaN(v) && v > 0);
  summaryEl.style.display = 'flex';
  document.getElementById('r-count').textContent = records.length;
  document.getElementById('r-latest').textContent = costs.length ? fmtCurrency(costs[0]) : '-';
  document.getElementById('r-min').textContent = costs.length ? fmtCurrency(Math.min(...costs)) : '-';
  document.getElementById('r-max').textContent = costs.length ? fmtCurrency(Math.max(...costs)) : '-';
}

// ─── 查詢 / 清除 ──────────────────────────

function doSearch() {
  const filters = {
    crystalName: document.getElementById('f-crystalName').value,
    size: document.getElementById('f-size').value,
    typeA: document.getElementById('f-typeA').value,
    typeB: document.getElementById('f-typeB').value,
    keyword: document.getElementById('f-keyword').value.trim()
  };
  loadRecords(filters);
}

function clearSearch() {
  ['f-crystalName','f-size','f-typeA','f-typeB'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('f-keyword').value = '';
  loadRecords();
}

// ─── 新增進貨 ─────────────────────────────

async function submitAdd() {
  const get = id => document.getElementById(id).value.trim();
  const data = {
    crystalName: get('a-crystalName'),
    date: get('a-date'),
    size: get('a-size'),
    typeA: get('a-typeA'),
    typeB: get('a-typeB'),
    vendor: get('a-vendor'),
    productName: get('a-productName'),
    shopLink: get('a-shopLink'),
    pricePerGram: parseFloat(get('a-pricePerGram')) || 0,
    weightPerStrand: parseFloat(get('a-weightPerStrand')) || 0,
    pricePerStrand: parseFloat(get('a-pricePerStrand')) || 0,
    exchangeRate: parseFloat(get('a-exchangeRate')) || 0,
    costPerBead: parseFloat(get('a-costPerBead')) || 0
  };

  const alertEl = document.getElementById('add-alert');
  alertEl.innerHTML = '';

  // 驗證必填
  if (!data.crystalName || !data.date || !data.size || !data.typeA || !data.typeB) {
    alertEl.innerHTML = `<div class="inline-alert inline-alert-warning">請填寫必填欄位（水晶名稱、日期、尺寸、規格A、形狀）</div>`;
    return;
  }
  if (!data.exchangeRate) {
    alertEl.innerHTML = `<div class="inline-alert inline-alert-warning">請填寫當次匯率</div>`;
    return;
  }

  // 自動計算單顆成本
  if (!data.costPerBead) {
    data.costPerBead = await calcCrystalCostPerBead(data);
  }

  try {
    const btn = document.querySelector('#addModal .btn-primary');
    btn.disabled = true;
    btn.textContent = '儲存中...';

    // 查詢上一筆，偵測漲跌
    const specKey = makeCrystalKey(data.crystalName, data.size, data.typeA, data.typeB);
    const prev = await getPreviousCrystalCost(specKey);

    await addCrystalCost(data);

    // 漲跌提醒
    if (prev && data.costPerBead > 0) {
      const diff = data.costPerBead - Number(prev.costPerBead);
      if (Math.abs(diff) >= 50) {
        const dir = diff > 0 ? '上漲' : '下跌';
        showToast(`⚠️ 「${data.crystalName} ${data.size}mm ${data.typeB}」成本${dir} $${Math.abs(diff).toFixed(1)}，請確認設計款售價！`, 'warning', 8000);
      }
    }

    // 庫存提示
    const settingDoc = await db.collection(COLLECTIONS.INITIAL_STOCK).doc(specKey).get();
    if (!settingDoc.exists) {
      showToast(`提醒：「${data.crystalName} ${data.size}mm ${data.typeB} ${data.typeA}」尚未設定初始庫存，庫存不會自動更新，請至「初始庫存設定」頁面補充。`, 'info', 8000);
    } else {
      showToast(`進貨紀錄儲存成功！庫存已自動增加 ${settingDoc.data().defaultQuantity} 顆`, 'success');
    }

    closeModal('addModal');
    resetAddForm();
    await loadFilterOptions();
    await loadRecords();
  } catch(e) {
    showToast(`儲存失敗：${e.message}`, 'danger');
  } finally {
    const btn = document.querySelector('#addModal .btn-primary');
    if (btn) { btn.disabled = false; btn.textContent = '儲存進貨紀錄'; }
  }
}

function resetAddForm() {
  ['a-crystalName','a-vendor','a-productName','a-shopLink','a-size','a-typeB',
   'a-pricePerGram','a-weightPerStrand','a-pricePerStrand','a-exchangeRate','a-costPerBead'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('a-typeA').value = '';
  document.getElementById('a-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('add-alert').innerHTML = '';
}

// ─── 刪除 ─────────────────────────────────

async function deleteRecord(id) {
  if (!confirmDialog('確定要刪除這筆進貨紀錄嗎？此操作無法復原。')) return;
  try {
    await deleteCrystalCost(id);
    showToast('已刪除', 'success');
    await loadRecords();
  } catch(e) {
    showToast(`刪除失敗：${e.message}`, 'danger');
  }
}
