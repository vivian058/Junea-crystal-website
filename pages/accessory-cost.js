// =============================================
// 配件成本表
// =============================================

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('navbar-root').innerHTML = renderNav('配件成本');
  document.getElementById('a-date').value = new Date().toISOString().split('T')[0];
  await loadFilterOptions();
  await loadRecords();
});

async function loadFilterOptions() {
  try {
    const opts = await getAccessoryFilterOptions();
    fillSelect(document.getElementById('f-vendor'), opts.vendors);
  } catch(e) { console.warn(e); }
}

async function loadRecords(filters = {}) {
  const container = document.getElementById('table-container');
  container.innerHTML = loadingState();
  try {
    const records = await getAccessoryCosts(filters);
    renderTable(records);
    renderSummary(records, filters);
  } catch(e) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div><div>${e.message}</div></div>`;
  }
}

function renderTable(records) {
  const container = document.getElementById('table-container');
  if (!records.length) {
    container.innerHTML = emptyState('📿', '尚無配件進貨紀錄，點右上角「新增進貨」開始記錄');
    return;
  }
  const rows = records.map(r => `
    <tr>
      <td>${fmtDate(r.date)}</td>
      <td><span class="badge badge-purple">${r.itemCode || '-'}</span></td>
      <td>${r.vendor || '-'}</td>
      <td>${r.productName || '-'}</td>
      <td>${r.color || '-'}</td>
      <td>${r.spec || '-'}</td>
      <td class="td-link">${r.shopLink ? `<a href="${r.shopLink}" target="_blank">連結 ↗</a>` : '-'}</td>
      <td>${fmtYuan(r.pricePerPieceYuan)}</td>
      <td>${r.exchangeRate || '-'}</td>
      <td><strong style="color:var(--primary-dark)">${fmtCurrency(r.costPerPiece)}</strong></td>
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
            <th>貨號</th>
            <th>廠家</th>
            <th>商品名稱</th>
            <th>顏色</th>
            <th>規格</th>
            <th>賣場</th>
            <th>單顆¥</th>
            <th>匯率</th>
            <th>單顆成本$</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function renderSummary(records, filters) {
  const summaryEl = document.getElementById('result-summary');
  const hasFilter = Object.values(filters).some(v => v);
  if (!hasFilter || !records.length) { summaryEl.style.display = 'none'; return; }
  const costs = records.map(r => Number(r.costPerPiece)).filter(v => !isNaN(v) && v > 0);
  summaryEl.style.display = 'flex';
  document.getElementById('r-count').textContent = records.length;
  document.getElementById('r-latest').textContent = costs.length ? fmtCurrency(costs[0]) : '-';
  document.getElementById('r-min').textContent = costs.length ? fmtCurrency(Math.min(...costs)) : '-';
  document.getElementById('r-max').textContent = costs.length ? fmtCurrency(Math.max(...costs)) : '-';
}

function doSearch() {
  const filters = {
    vendor: document.getElementById('f-vendor').value,
    keyword: document.getElementById('f-keyword').value.trim()
  };
  loadRecords(filters);
}

function clearSearch() {
  document.getElementById('f-vendor').value = '';
  document.getElementById('f-keyword').value = '';
  loadRecords();
}

async function submitAdd() {
  const get = id => document.getElementById(id).value.trim();
  const data = {
    date: get('a-date'),
    vendor: get('a-vendor'),
    itemCode: get('a-itemCode'),
    productName: get('a-productName'),
    shopLink: get('a-shopLink'),
    color: get('a-color'),
    spec: get('a-spec'),
    pricePerPieceYuan: parseFloat(get('a-pricePerPieceYuan')) || 0,
    exchangeRate: parseFloat(get('a-exchangeRate')) || 0,
    costPerPiece: parseFloat(get('a-costPerPiece')) || 0
  };

  const alertEl = document.getElementById('add-alert');
  alertEl.innerHTML = '';

  if (!data.date || !data.vendor || !data.itemCode) {
    alertEl.innerHTML = `<div class="inline-alert inline-alert-warning">請填寫必填欄位（日期、廠家、貨號）</div>`;
    return;
  }
  if (!data.exchangeRate) {
    alertEl.innerHTML = `<div class="inline-alert inline-alert-warning">請填寫當次匯率</div>`;
    return;
  }

  if (!data.costPerPiece) {
    data.costPerPiece = calcAccessoryCostPerPiece(data);
  }

  try {
    const btn = document.querySelector('#addModal .btn-primary');
    btn.disabled = true; btn.textContent = '儲存中...';

    await addAccessoryCost(data);
    showToast('配件進貨紀錄儲存成功！', 'success');
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
  ['a-vendor','a-itemCode','a-productName','a-shopLink','a-color','a-spec',
   'a-pricePerPieceYuan','a-exchangeRate','a-costPerPiece'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('a-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('add-alert').innerHTML = '';
}

async function deleteRecord(id) {
  if (!confirmDialog('確定要刪除這筆配件進貨紀錄嗎？')) return;
  try {
    await deleteAccessoryCost(id);
    showToast('已刪除', 'success');
    await loadRecords();
  } catch(e) {
    showToast(`刪除失敗：${e.message}`, 'danger');
  }
}
