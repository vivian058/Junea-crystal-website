// =============================================
// 共用工具函式
// =============================================

// ─── Toast 通知 ───────────────────────────

function showToast(message, type = 'info', duration = 4000) {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ─── 格式化 ───────────────────────────────

function fmtCurrency(num) {
  if (num == null || isNaN(num)) return '-';
  return `$${Number(num).toLocaleString('zh-TW', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}`;
}

function fmtYuan(num) {
  if (num == null || isNaN(num)) return '-';
  return `¥${Number(num).toLocaleString('zh-TW', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function fmtDate(dateStr) {
  if (!dateStr) return '-';
  return dateStr;
}

// 將 Excel 日期（Date 物件 / 數字 / 字串）統一轉成 YYYY-MM-DD
function toDateStr(val) {
  if (!val && val !== 0) return '';
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  // 純數字（Excel serial）→ 交給 SheetJS 轉
  if (typeof val === 'number') {
    const d = new Date(Math.round((val - 25569) * 86400 * 1000));
    const y = d.getUTCFullYear();
    const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dy = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${mo}-${dy}`;
  }
  return String(val).trim();
}

// ─── 漲跌徽章 ─────────────────────────────

// 規格顯示：純數字或 N*N 格式自動補 mm，其他原樣輸出
function fmtSpec(val) {
  if (!val) return '-';
  const s = String(val).trim();
  if (!s) return '-';
  if (s.toLowerCase().endsWith('mm')) return s;
  if (/^\d+(\.\d+)?(\*\d+(\.\d+)?)?$/.test(s)) return s + 'mm';
  return s;
}

function makePriceChangeBadge(current, previous, threshold = 50) {
  if (!previous || isNaN(current) || isNaN(previous)) return '';
  const diff = Number(current) - Number(previous);
  if (Math.abs(diff) < threshold) return '';
  if (diff > 0) {
    return `<span class="price-change-badge up">▲ $${diff.toFixed(1)}</span>`;
  } else {
    return `<span class="price-change-badge down">▼ $${Math.abs(diff).toFixed(1)}</span>`;
  }
}

// ─── 導覽列 ───────────────────────────────

const NAV_PAGES = [
  { href: '../pages/crystal-cost.html', label: '水晶成本' },
  { href: '../pages/accessory-cost.html', label: '配件成本' },
  { href: '../pages/bracelet-design.html', label: '設計款手鍊' },
  { href: '../pages/inventory.html', label: '庫存表' },
  { href: '../pages/initial-stock.html', label: '初始庫存設定' },
  { href: '../pages/crystal-effects.html', label: '水晶功效' }
];

function renderNav(activePage) {
  const links = NAV_PAGES.map(p =>
    `<a href="${p.href}" class="${p.label === activePage ? 'active' : ''}">${p.label}</a>`
  ).join('');
  return `
    <nav class="navbar">
      <a href="../index.html" class="nav-brand">玖釀 <span>Crystal</span></a>
      <div class="nav-links">${links}</div>
    </nav>`;
}

// ─── 確認對話框 ───────────────────────────

function confirmDialog(message) {
  return confirm(message);
}

// ─── Modal 控制 ───────────────────────────

function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('active');
}

document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('active');
  }
});

// ─── 空狀態 ───────────────────────────────

function emptyState(icon, text) {
  return `<div class="empty-state">
    <div class="empty-state-text">${text}</div>
  </div>`;
}

function loadingState() {
  return `<div class="loading"><div class="spinner"></div><div>載入中</div></div>`;
}

// ─── 下拉選單填充 ─────────────────────────

function fillSelect(selectEl, options, placeholder = '全部') {
  const currentVal = selectEl.value;
  selectEl.innerHTML = `<option value="">${placeholder}</option>`;
  options.forEach(opt => {
    const o = document.createElement('option');
    o.value = opt;
    o.textContent = opt;
    if (opt === currentVal) o.selected = true;
    selectEl.appendChild(o);
  });
}

function fillDatalist(datalistEl, options) {
  datalistEl.innerHTML = '';
  options.forEach(opt => {
    const o = document.createElement('option');
    o.value = opt;
    datalistEl.appendChild(o);
  });
}

// ─── 成本計算 ─────────────────────────────

async function calcCrystalCostPerBead(data) {
  if (data.costPerBead && !isNaN(data.costPerBead) && Number(data.costPerBead) > 0) {
    return Number(data.costPerBead);
  }
  const pricePerStrand = Number(data.pricePerStrand);
  const exchangeRate = Number(data.exchangeRate);
  const specKey = makeCrystalKey(data.crystalName, data.size, data.typeA, data.typeB);
  let qty = 0;
  try {
    const doc = await db.collection(COLLECTIONS.INITIAL_STOCK).doc(specKey).get();
    if (doc.exists) qty = doc.data().defaultQuantity || 0;
  } catch(e) {}
  if (pricePerStrand > 0 && exchangeRate > 0 && qty > 0) {
    return Math.round((pricePerStrand * exchangeRate / qty) * 100) / 100;
  }
  const pricePerGram = Number(data.pricePerGram);
  const weight = Number(data.weightPerStrand);
  if (pricePerGram > 0 && weight > 0 && exchangeRate > 0 && qty > 0) {
    return Math.round((pricePerGram * weight * exchangeRate / qty) * 100) / 100;
  }
  return 0;
}

function calcAccessoryCostPerPiece(data) {
  if (data.costPerPiece && !isNaN(data.costPerPiece) && Number(data.costPerPiece) > 0) {
    return Number(data.costPerPiece);
  }
  const yuan = Number(data.pricePerPieceYuan);
  const rate = Number(data.exchangeRate);
  if (yuan > 0 && rate > 0) {
    return Math.round(yuan * rate * 100) / 100;
  }
  return 0;
}
