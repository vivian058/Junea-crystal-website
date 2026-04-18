// =============================================
// 水晶成本表
// =============================================

let allRecords = [];
let importRows = [];
let editingRecordId = null; // null = 新增；有值 = 編輯

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('navbar-root').innerHTML = renderNav('水晶成本');
  document.getElementById('a-date').value = new Date().toISOString().split('T')[0];
  await loadFilterOptions();
  await loadRecords();
});

// ─── 載入篩選選項 ─────────────────────────

async function loadFilterOptions() {
  try {
    const opts = await getCrystalFilterOptions();
    fillDatalist(document.getElementById('list-crystalName'), opts.crystalNames);
    fillDatalist(document.getElementById('list-size'), opts.sizes);
    fillDatalist(document.getElementById('list-typeA'), opts.typeAs);
    fillDatalist(document.getElementById('list-typeB'), opts.typeBs);
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
    container.innerHTML = `<div class="empty-state"><div class="empty-state-text">載入失敗：${e.message}</div></div>`;
  }
}

// ─── 渲染表格 ─────────────────────────────

function renderTable(records) {
  const container = document.getElementById('table-container');
  if (!records.length) {
    container.innerHTML = emptyState('', '尚無進貨紀錄，點右上角「新增進貨」開始記錄');
    return;
  }

  const rows = records.map(r => `
    <tr>
      <td style="text-align:center;padding:8px 6px">
        <input type="checkbox" class="row-check" value="${r.id}" onchange="updateBulkBar()">
      </td>
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
      <td>${r.exchangeRate || '-'}</td>
      <td><strong style="color:var(--primary-dark)">${fmtCurrency(r.costPerBead)}</strong></td>
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
      <table style="min-width:1400px">
        <thead>
          <tr>
            <th style="width:40px;text-align:center">
              <input type="checkbox" id="check-all" onchange="toggleSelectAll(this)" title="全選">
            </th>
            <th style="min-width:90px">日期</th>
            <th style="min-width:90px">水晶</th>
            <th style="min-width:60px">尺寸</th>
            <th style="min-width:90px">形狀</th>
            <th style="min-width:70px">規格</th>
            <th style="min-width:90px">廠家</th>
            <th style="min-width:60px">賣場</th>
            <th style="min-width:80px">克價¥</th>
            <th style="min-width:70px">重量</th>
            <th style="min-width:80px">單條¥</th>
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
    await Promise.all(ids.map(id => deleteCrystalCost(id)));
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
  ['f-crystalName','f-size','f-typeA','f-typeB','f-keyword'].forEach(id => document.getElementById(id).value = '');
  loadRecords();
}

// ─── 新增 / 編輯 Modal ────────────────────

function openAddModal() {
  editingRecordId = null;
  resetAddForm();
  document.querySelector('#addModal .modal-title').textContent = '新增水晶進貨';
  document.querySelector('#addModal .btn-primary').textContent = '儲存進貨紀錄';
  openModal('addModal');
}

function openEditRecord(id) {
  const record = allRecords.find(r => r.id === id);
  if (!record) return;
  editingRecordId = id;
  document.getElementById('a-crystalName').value = record.crystalName || '';
  document.getElementById('a-date').value = record.date || '';
  document.getElementById('a-size').value = record.size || '';
  document.getElementById('a-typeA').value = record.typeA || '';
  document.getElementById('a-typeB').value = record.typeB || '';
  document.getElementById('a-vendor').value = record.vendor || '';
  document.getElementById('a-productName').value = record.productName || '';
  document.getElementById('a-shopLink').value = record.shopLink || '';
  document.getElementById('a-pricePerGram').value = record.pricePerGram || '';
  document.getElementById('a-weightPerStrand').value = record.weightPerStrand || '';
  document.getElementById('a-pricePerStrand').value = record.pricePerStrand || '';
  document.getElementById('a-exchangeRate').value = record.exchangeRate || '';
  document.getElementById('a-costPerBead').value = record.costPerBead || '';
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
    costPerBead: parseFloat(get('a-costPerBead')) || 0,
    note: get('a-note')
  };

  const alertEl = document.getElementById('add-alert');
  alertEl.innerHTML = '';

  if (!data.crystalName || !data.date || !data.size || !data.typeA || !data.typeB) {
    alertEl.innerHTML = `<div class="inline-alert inline-alert-warning">請填寫必填欄位（水晶名稱、日期、尺寸、規格A、形狀）</div>`;
    return;
  }
  if (!data.exchangeRate) {
    alertEl.innerHTML = `<div class="inline-alert inline-alert-warning">請填寫當次匯率</div>`;
    return;
  }

  if (!data.costPerBead) {
    data.costPerBead = await calcCrystalCostPerBead(data);
  }

  const btn = document.querySelector('#addModal .btn-primary');
  try {
    btn.disabled = true;
    btn.textContent = '儲存中...';

    if (editingRecordId) {
      // ── 編輯模式：直接更新，不觸發庫存或漲跌邏輯 ──
      await updateCrystalCost(editingRecordId, data);
      showToast('進貨紀錄已更新', 'success');
    } else {
      // ── 新增模式 ──
      const specKey = makeCrystalKey(data.crystalName, data.size, data.typeA, data.typeB);
      const prev = await getPreviousCrystalCost(specKey);
      await addCrystalCost(data);

      // 漲跌提醒
      if (prev && data.costPerBead > 0) {
        const diff = data.costPerBead - Number(prev.costPerBead);
        if (Math.abs(diff) >= 50) {
          const dir = diff > 0 ? '上漲' : '下跌';
          showToast(`「${data.crystalName} ${data.size}mm ${data.typeB}」成本${dir} $${Math.abs(diff).toFixed(1)}，請確認設計款售價！`, 'warning', 8000);
        }
      }

      // 庫存提示
      const settingDoc = await db.collection(COLLECTIONS.INITIAL_STOCK).doc(specKey).get();
      if (!settingDoc.exists) {
        showToast(`提醒：「${data.crystalName} ${data.size}mm ${data.typeB} ${data.typeA}」尚未設定初始庫存，庫存不會自動更新，請至「初始庫存設定」頁面補充。`, 'info', 8000);
      } else {
        showToast(`進貨紀錄儲存成功！庫存已自動增加 ${settingDoc.data().defaultQuantity} 顆`, 'success');
      }
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
  ['a-crystalName','a-vendor','a-productName','a-shopLink','a-size','a-typeB',
   'a-pricePerGram','a-weightPerStrand','a-pricePerStrand','a-exchangeRate','a-costPerBead','a-note'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('a-typeA').value = '';
  document.getElementById('a-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('add-alert').innerHTML = '';
  editingRecordId = null;
}

// ─── 刪除（單筆）─────────────────────────

async function deleteRecord(id) {
  if (!confirmDialog('確定要刪除這筆進貨紀錄嗎？此操作無法復原。')) return;
  try {
    await deleteCrystalCost(id);
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
        crystalName: String(r[0] || '').trim(),
        date: String(r[1] || '').trim(),
        size: String(r[2] || '').trim(),
        typeA: String(r[3] || '').trim(),
        typeB: String(r[4] || '').trim(),
        vendor: String(r[5] || '').trim(),
        productName: String(r[6] || '').trim(),
        shopLink: String(r[7] || '').trim(),
        pricePerGram: parseFloat(r[8]) || 0,
        weightPerStrand: parseFloat(r[9]) || 0,
        pricePerStrand: parseFloat(r[10]) || 0,
        exchangeRate: parseFloat(r[11]) || 0,
        costPerBead: parseFloat(r[12]) || 0,
        note: String(r[13] || '').trim()
      }));

      const invalid = importRows.filter(r => !r.crystalName || !r.date || !r.size || !r.typeA || !r.typeB || !r.exchangeRate);
      if (invalid.length) {
        alertEl.innerHTML = `<div class="inline-alert inline-alert-warning">有 ${invalid.length} 列缺少必填欄位（水晶名稱/日期/尺寸/規格A/形狀B/匯率），請修正後重新上傳</div>`;
        importRows = [];
        return;
      }

      const tbody = document.getElementById('preview-tbody');
      tbody.innerHTML = importRows.map(r => `
        <tr>
          <td>${r.crystalName}</td>
          <td>${r.date}</td>
          <td>${r.size}mm</td>
          <td>${r.typeA}</td>
          <td>${r.typeB}</td>
          <td>${r.vendor || '-'}</td>
          <td>${r.productName || '-'}</td>
          <td>${r.pricePerGram || '-'}</td>
          <td>${r.weightPerStrand || '-'}</td>
          <td>${r.pricePerStrand || '-'}</td>
          <td>${r.exchangeRate}</td>
          <td>${r.costPerBead || '自動'}</td>
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
      if (!row.costPerBead) {
        row.costPerBead = await calcCrystalCostPerBead(row);
      }
      await addCrystalCost(row);
      success++;
    } catch(e) {
      failed++;
      console.error('匯入失敗', row, e);
    }
  }

  btn.textContent = '確認匯入';
  if (failed === 0) {
    showToast(`成功匯入 ${success} 筆進貨紀錄`, 'success');
    closeUploadModal();
    await loadFilterOptions();
    await loadRecords();
  } else {
    alertEl.innerHTML = `<div class="inline-alert inline-alert-warning">成功 ${success} 筆，失敗 ${failed} 筆，請查看 Console 了解詳情</div>`;
    btn.disabled = false;
  }
}

function downloadCrystalTemplate() {
  const header = [['水晶名稱','進貨日期(YYYY-MM-DD)','尺寸mm','規格A(條珠/成品串)','形狀規格B','廠家','商品名稱','賣場連結','克價¥','重量g','單條進價¥','匯率','單顆成本$(留空自動計算)','備註']];
  const ws = XLSX.utils.aoa_to_sheet(header);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '水晶進貨');
  XLSX.writeFile(wb, '水晶進貨範本.xlsx');
}
