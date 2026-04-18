// =============================================
// 配件成本表
// =============================================

let allRecords = [];
let importRows = [];
let editingRecordId = null; // null = 新增；有值 = 編輯

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('navbar-root').innerHTML = renderNav('配件成本');
  document.getElementById('a-date').value = new Date().toISOString().split('T')[0];
  await loadFilterOptions();
  await loadRecords();
});

// ─── 載入篩選選項 ─────────────────────────

async function loadFilterOptions() {
  try {
    const opts = await getAccessoryFilterOptions();
    fillDatalist(document.getElementById('list-vendor'), opts.vendors);
  } catch(e) { console.warn(e); }
}

// ─── 載入紀錄 ─────────────────────────────

async function loadRecords(filters = {}) {
  const container = document.getElementById('table-container');
  container.innerHTML = loadingState();
  try {
    allRecords = await getAccessoryCosts(filters);
    renderTable(allRecords);
    renderSummary(allRecords, filters);
  } catch(e) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-text">${e.message}</div></div>`;
  }
}

// ─── 渲染表格 ─────────────────────────────

function renderTable(records) {
  const container = document.getElementById('table-container');
  if (!records.length) {
    container.innerHTML = emptyState('', '尚無配件進貨紀錄，點右上角「新增進貨」開始記錄');
    return;
  }

  const rows = records.map(r => `
    <tr>
      <td style="text-align:center;padding:8px 6px">
        <input type="checkbox" class="row-check" value="${r.id}" onchange="updateBulkBar()">
      </td>
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
      <td style="min-width:120px;color:var(--text-muted);font-size:12px">${r.note || '-'}</td>
      <td>
        <div style="display:flex;gap:4px;flex-wrap:nowrap">
          <button class="btn btn-secondary btn-sm" onclick="openEditRecord('${r.id}')">編輯</button>
          <button class="btn btn-danger btn-sm" onclick="deleteRecord('${r.id}')">刪除</button>
        </div>
      </td>
    </tr>`).join('');

  container.innerHTML = `
    <div id="bulk-bar" style="display:none;padding:10px 16px;background:var(--primary-light);border-radius:6px;margin-bottom:8px;align-items:center;gap:12px">
      <span id="bulk-count" style="font-size:13px;color:var(--primary-dark);font-weight:600"></span>
      <button class="btn btn-danger btn-sm" onclick="deleteSelected()">刪除已選</button>
    </div>
    <div class="table-wrap">
      <table style="min-width:1100px">
        <thead>
          <tr>
            <th style="width:40px;text-align:center">
              <input type="checkbox" id="check-all" onchange="toggleSelectAll(this)" title="全選">
            </th>
            <th style="min-width:90px">日期</th>
            <th style="min-width:100px">貨號</th>
            <th style="min-width:90px">廠家</th>
            <th style="min-width:120px">商品名稱</th>
            <th style="min-width:70px">顏色</th>
            <th style="min-width:80px">規格</th>
            <th style="min-width:60px">賣場</th>
            <th style="min-width:80px">單顆¥</th>
            <th style="min-width:60px">匯率</th>
            <th style="min-width:100px">單顆成本$</th>
            <th style="min-width:160px">備註</th>
            <th style="min-width:110px">操作</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

// ─── 全選 / 批次刪除 ──────────────────────

function toggleSelectAll(checkbox) {
  document.querySelectorAll('.row-check').forEach(c => c.checked = checkbox.checked);
  updateBulkBar();
}

function updateBulkBar() {
  const checked = document.querySelectorAll('.row-check:checked');
  const bar = document.getElementById('bulk-bar');
  const checkAll = document.getElementById('check-all');
  if (!bar) return;
  if (checked.length > 0) {
    bar.style.display = 'flex';
    document.getElementById('bulk-count').textContent = `已選 ${checked.length} 筆`;
    if (checkAll) {
      const total = document.querySelectorAll('.row-check').length;
      checkAll.checked = checked.length === total;
      checkAll.indeterminate = checked.length > 0 && checked.length < total;
    }
  } else {
    bar.style.display = 'none';
    if (checkAll) { checkAll.checked = false; checkAll.indeterminate = false; }
  }
}

async function deleteSelected() {
  const ids = [...document.querySelectorAll('.row-check:checked')].map(c => c.value);
  if (!ids.length) return;
  if (!confirmDialog(`確定要刪除選取的 ${ids.length} 筆紀錄嗎？此操作無法復原。`)) return;
  try {
    await Promise.all(ids.map(id => deleteAccessoryCost(id)));
    showToast(`已刪除 ${ids.length} 筆`, 'success');
    await loadFilterOptions();
    await loadRecords();
  } catch(e) {
    showToast(`刪除失敗：${e.message}`, 'danger');
  }
}

// ─── 查詢結果摘要 ─────────────────────────

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

// ─── 查詢 / 清除 ──────────────────────────

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

// ─── 新增 / 編輯 Modal ────────────────────

function openAddModal() {
  editingRecordId = null;
  resetAddForm();
  document.querySelector('#addModal .modal-title').textContent = '新增配件進貨';
  document.querySelector('#addModal .btn-primary').textContent = '儲存進貨紀錄';
  openModal('addModal');
}

function openEditRecord(id) {
  const record = allRecords.find(r => r.id === id);
  if (!record) return;
  editingRecordId = id;
  document.getElementById('a-date').value = record.date || '';
  document.getElementById('a-vendor').value = record.vendor || '';
  document.getElementById('a-itemCode').value = record.itemCode || '';
  document.getElementById('a-productName').value = record.productName || '';
  document.getElementById('a-shopLink').value = record.shopLink || '';
  document.getElementById('a-color').value = record.color || '';
  document.getElementById('a-spec').value = record.spec || '';
  document.getElementById('a-pricePerPieceYuan').value = record.pricePerPieceYuan || '';
  document.getElementById('a-exchangeRate').value = record.exchangeRate || '';
  document.getElementById('a-costPerPiece').value = record.costPerPiece || '';
  document.getElementById('a-note').value = record.note || '';
  document.getElementById('add-alert').innerHTML = '';
  document.querySelector('#addModal .modal-title').textContent = '編輯進貨紀錄';
  document.querySelector('#addModal .btn-primary').textContent = '儲存修改';
  openModal('addModal');
}

// ─── 儲存（新增 / 編輯 共用）─────────────

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

  const btn = document.querySelector('#addModal .btn-primary');
  try {
    btn.disabled = true;
    btn.textContent = '儲存中...';

    if (editingRecordId) {
      await updateAccessoryCost(editingRecordId, data);
      showToast('配件進貨紀錄已更新', 'success');
    } else {
      await addAccessoryCost(data);
      showToast('配件進貨紀錄儲存成功！', 'success');
    }

    closeModal('addModal');
    resetAddForm();
    await loadFilterOptions();
    await loadRecords();
  } catch(e) {
    showToast(`儲存失敗：${e.message}`, 'danger');
  } finally {
    btn.disabled = false;
    btn.textContent = editingRecordId ? '儲存修改' : '儲存進貨紀錄';
  }
}

function resetAddForm() {
  ['a-vendor','a-itemCode','a-productName','a-shopLink','a-color','a-spec',
   'a-pricePerPieceYuan','a-exchangeRate','a-costPerPiece','a-note'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('a-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('add-alert').innerHTML = '';
  editingRecordId = null;
}

// ─── 刪除（單筆）─────────────────────────

async function deleteRecord(id) {
  if (!confirmDialog('確定要刪除這筆配件進貨紀錄嗎？')) return;
  try {
    await deleteAccessoryCost(id);
    showToast('已刪除', 'success');
    await loadFilterOptions();
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
