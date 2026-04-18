// =============================================
// 配件成本表
// =============================================

let importRows = []; // 待匯入資料

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('navbar-root').innerHTML = renderNav('配件成本');
  document.getElementById('a-date').value = new Date().toISOString().split('T')[0];
  await loadFilterOptions();
  await loadRecords();
});

async function loadFilterOptions() {
  try {
    const opts = await getAccessoryFilterOptions();
    fillDatalist(document.getElementById('list-vendor'), opts.vendors);
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
    container.innerHTML = `<div class="empty-state"><div class="empty-state-text">${e.message}</div></div>`;
  }
}

function renderTable(records) {
  const container = document.getElementById('table-container');
  if (!records.length) {
    container.innerHTML = emptyState('', '尚無配件進貨紀錄，點右上角「新增進貨」開始記錄');
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
      <td style="max-width:160px;color:var(--text-muted);font-size:12px">${r.note || '-'}</td>
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
            <th>備註</th>
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
  ['f-vendor','f-keyword'].forEach(id => document.getElementById(id).value = '');
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
    costPerPiece: parseFloat(get('a-costPerPiece')) || 0,
    note: get('a-note')
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
   'a-pricePerPieceYuan','a-exchangeRate','a-costPerPiece','a-note'].forEach(id => {
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

// ─── Excel 匯入 ───────────────────────────

function closeUploadModal() {
  clearUpload();
  closeModal('uploadModal');
}

function clearUpload() {
  importRows = [];
  document.getElementById('excel-file-input').value = '';
  document.getElementById('preview-area').style.display = 'none';
  document.getElementById('preview-tbody').innerHTML = '';
  document.getElementById('preview-count').textContent = '';
  document.getElementById('btn-import').disabled = true;
  document.getElementById('upload-alert').innerHTML = '';
}

function handleExcelDrop(event) {
  event.preventDefault();
  const file = event.dataTransfer.files[0];
  if (file) handleExcelUpload(file);
}

function handleExcelUpload(file) {
  if (!file) return;
  const alertEl = document.getElementById('upload-alert');
  alertEl.innerHTML = '';

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const workbook = XLSX.read(e.target.result, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

      const dataRows = rows.slice(1).filter(r => r.some(c => c !== ''));
      if (!dataRows.length) {
        alertEl.innerHTML = `<div class="inline-alert inline-alert-warning">檔案中沒有資料列</div>`;
        return;
      }

      importRows = dataRows.map(r => ({
        date: String(r[0] || '').trim(),
        vendor: String(r[1] || '').trim(),
        itemCode: String(r[2] || '').trim(),
        productName: String(r[3] || '').trim(),
        shopLink: String(r[4] || '').trim(),
        color: String(r[5] || '').trim(),
        spec: String(r[6] || '').trim(),
        pricePerPieceYuan: parseFloat(r[7]) || 0,
        exchangeRate: parseFloat(r[8]) || 0,
        costPerPiece: parseFloat(r[9]) || 0,
        note: String(r[10] || '').trim()
      }));

      const invalid = importRows.filter(r => !r.date || !r.vendor || !r.itemCode || !r.exchangeRate);
      if (invalid.length) {
        alertEl.innerHTML = `<div class="inline-alert inline-alert-warning">有 ${invalid.length} 列缺少必填欄位（日期/廠家/貨號/匯率），請修正後重新上傳</div>`;
        importRows = [];
        return;
      }

      const tbody = document.getElementById('preview-tbody');
      tbody.innerHTML = importRows.map(r => `
        <tr>
          <td>${r.date}</td>
          <td>${r.vendor}</td>
          <td>${r.itemCode}</td>
          <td>${r.productName || '-'}</td>
          <td>${r.color || '-'}</td>
          <td>${r.spec || '-'}</td>
          <td>${r.pricePerPieceYuan || '-'}</td>
          <td>${r.exchangeRate}</td>
          <td>${r.costPerPiece || '自動'}</td>
        </tr>`).join('');

      document.getElementById('preview-count').textContent = `共 ${importRows.length} 筆，確認後點「確認匯入」`;
      document.getElementById('preview-area').style.display = 'block';
      document.getElementById('btn-import').disabled = false;
    } catch(err) {
      alertEl.innerHTML = `<div class="inline-alert inline-alert-warning">解析失敗：${err.message}</div>`;
    }
  };
  reader.readAsArrayBuffer(file);
}

async function submitImport() {
  if (!importRows.length) return;
  const btn = document.getElementById('btn-import');
  btn.disabled = true;
  btn.textContent = '匯入中...';
  const alertEl = document.getElementById('upload-alert');
  alertEl.innerHTML = '';

  let success = 0, failed = 0;
  for (const row of importRows) {
    try {
      if (!row.costPerPiece) {
        row.costPerPiece = calcAccessoryCostPerPiece(row);
      }
      await addAccessoryCost(row);
      success++;
    } catch(e) {
      failed++;
      console.error('匯入失敗', row, e);
    }
  }

  btn.textContent = '確認匯入';
  if (failed === 0) {
    showToast(`成功匯入 ${success} 筆配件進貨紀錄`, 'success');
    closeUploadModal();
    await loadFilterOptions();
    await loadRecords();
  } else {
    alertEl.innerHTML = `<div class="inline-alert inline-alert-warning">成功 ${success} 筆，失敗 ${failed} 筆，請查看 Console 了解詳情</div>`;
    btn.disabled = false;
  }
}

function downloadAccessoryTemplate() {
  const header = [['進貨日期(YYYY-MM-DD)','廠家','貨號','商品名稱','賣場連結','顏色','規格','單顆進價¥','匯率','單顆成本$(留空自動計算)','備註']];
  const ws = XLSX.utils.aoa_to_sheet(header);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '配件進貨');
  XLSX.writeFile(wb, '配件進貨範本.xlsx');
}
