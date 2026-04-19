// =============================================
// 資料庫操作層 - 所有 Firestore 操作集中於此
// （所有排序改為客戶端處理，避免需要建立索引）
// =============================================

// ─── 工具函式 ───────────────────────────────

function makeCrystalKey(crystalName, size, typeA, typeB) {
  return `${crystalName}_${size}mm_${typeA}_${typeB}`.replace(/\s+/g, '_');
}

// 通用規格鍵（不含水晶名稱），用於初始庫存設定
// size 無論傳入 "8" 或 "8mm" 都會統一輸出 SIZE_8mm_...
function makeCrystalPatternKey(size, typeA, typeB) {
  const s = String(size || '').replace(/mm$/i, '').trim();
  return `SIZE_${s}mm_${typeA}_${typeB}`.replace(/\s+/g, '_');
}

function makeAccessoryKey(itemCode) {
  return `ACC_${itemCode}`.replace(/\s+/g, '_');
}

// ─── 水晶成本表 ────────────────────────────

async function addCrystalCost(data) {
  const specKey = makeCrystalKey(data.crystalName, data.size, data.typeA, data.typeB);
  const record = { ...data, specKey, createdAt: firebase.firestore.FieldValue.serverTimestamp() };
  const docRef = await db.collection(COLLECTIONS.CRYSTAL_COSTS).add(record);
  let invResult = { hasInitialSetting: false, defaultQty: 0, inventoryError: null };
  try {
    invResult = await _addInventoryFromCrystalPurchase(specKey, data);
  } catch(e) {
    console.error('[庫存寫入失敗]', specKey, e);
    invResult.inventoryError = e.message;
  }
  return { id: docRef.id, ...invResult };
}

async function getCrystalCosts(filters = {}) {
  const snapshot = await db.collection(COLLECTIONS.CRYSTAL_COSTS).get();
  let results = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  // 客戶端排序（日期新→舊）
  results.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  if (filters.crystalName) results = results.filter(r => r.crystalName && r.crystalName.includes(filters.crystalName));
  if (filters.size) results = results.filter(r => r.size && r.size.toString().includes(filters.size));
  if (filters.typeA) results = results.filter(r => r.typeA && r.typeA.includes(filters.typeA));
  if (filters.typeB) results = results.filter(r => r.typeB && r.typeB.includes(filters.typeB));
  if (filters.keyword) {
    const kw = filters.keyword.toLowerCase();
    results = results.filter(r =>
      (r.crystalName && r.crystalName.toLowerCase().includes(kw)) ||
      (r.productName && r.productName.toLowerCase().includes(kw)) ||
      (r.vendor && r.vendor.toLowerCase().includes(kw)) ||
      (r.size && r.size.toString().includes(kw)) ||
      (r.typeA && r.typeA.toLowerCase().includes(kw)) ||
      (r.typeB && r.typeB.toLowerCase().includes(kw))
    );
  }
  return results;
}

async function getCrystalFilterOptions() {
  const snapshot = await db.collection(COLLECTIONS.CRYSTAL_COSTS).get();
  const all = snapshot.docs.map(doc => doc.data());
  return {
    crystalNames: [...new Set(all.map(r => r.crystalName).filter(Boolean))].sort(),
    sizes: [...new Set(all.map(r => r.size).filter(Boolean))].sort((a, b) => parseFloat(a) - parseFloat(b)),
    typeAs: [...new Set(all.map(r => r.typeA).filter(Boolean))].sort(),
    typeBs: [...new Set(all.map(r => r.typeB).filter(Boolean))].sort()
  };
}

async function getCrystalCostSummary(specKey) {
  const snapshot = await db.collection(COLLECTIONS.CRYSTAL_COSTS)
    .where('specKey', '==', specKey).get();
  if (snapshot.empty) return null;
  const records = snapshot.docs.map(doc => doc.data())
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const costs = records.map(r => Number(r.costPerBead)).filter(v => !isNaN(v) && v > 0);
  return {
    latest: costs[0] || 0,
    min: costs.length ? Math.min(...costs) : 0,
    max: costs.length ? Math.max(...costs) : 0,
    count: records.length
  };
}

async function getPreviousCrystalCost(specKey) {
  const snapshot = await db.collection(COLLECTIONS.CRYSTAL_COSTS)
    .where('specKey', '==', specKey).get();
  if (snapshot.empty) return null;
  const records = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return records.length >= 2 ? records[1] : null;
}

async function updateCrystalCost(id, data) {
  await db.collection(COLLECTIONS.CRYSTAL_COSTS).doc(id).update({
    ...data, updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

async function deleteCrystalCost(id) {
  await db.collection(COLLECTIONS.CRYSTAL_COSTS).doc(id).delete();
}

// ─── 配件成本表 ────────────────────────────

async function addAccessoryCost(data) {
  const specKey = makeAccessoryKey(data.itemCode);
  const record = { ...data, specKey, createdAt: firebase.firestore.FieldValue.serverTimestamp() };
  const docRef = await db.collection(COLLECTIONS.ACCESSORY_COSTS).add(record);
  const alreadyExisted = await _ensureAccessoryInventory(specKey, data);
  return { id: docRef.id, isNewInventory: !alreadyExisted };
}

async function getAccessoryCosts(filters = {}) {
  const snapshot = await db.collection(COLLECTIONS.ACCESSORY_COSTS).get();
  let results = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  results.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  if (filters.vendor) results = results.filter(r => r.vendor && r.vendor.includes(filters.vendor));
  if (filters.keyword) {
    const kw = filters.keyword.toLowerCase();
    results = results.filter(r =>
      (r.productName && r.productName.toLowerCase().includes(kw)) ||
      (r.itemCode && r.itemCode.toLowerCase().includes(kw)) ||
      (r.vendor && r.vendor.toLowerCase().includes(kw)) ||
      (r.color && r.color.toLowerCase().includes(kw)) ||
      (r.spec && r.spec.toLowerCase().includes(kw))
    );
  }
  return results;
}

async function getAccessoryFilterOptions() {
  const snapshot = await db.collection(COLLECTIONS.ACCESSORY_COSTS).get();
  const all = snapshot.docs.map(doc => doc.data());
  return {
    vendors: [...new Set(all.map(r => r.vendor).filter(Boolean))].sort()
  };
}

async function getAccessoryCostSummary(specKey) {
  const snapshot = await db.collection(COLLECTIONS.ACCESSORY_COSTS)
    .where('specKey', '==', specKey).get();
  if (snapshot.empty) return null;
  const records = snapshot.docs.map(doc => doc.data())
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const costs = records.map(r => Number(r.costPerPiece)).filter(v => !isNaN(v) && v > 0);
  return {
    latest: costs[0] || 0,
    min: costs.length ? Math.min(...costs) : 0,
    max: costs.length ? Math.max(...costs) : 0,
    count: records.length
  };
}

async function getLatestAccessoryCosts() {
  const snapshot = await db.collection(COLLECTIONS.ACCESSORY_COSTS).get();
  const results = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  results.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const seen = new Set();
  return results.filter(r => {
    if (seen.has(r.specKey)) return false;
    seen.add(r.specKey);
    return true;
  });
}

async function getPreviousAccessoryCost(specKey) {
  const snapshot = await db.collection(COLLECTIONS.ACCESSORY_COSTS)
    .where('specKey', '==', specKey).get();
  if (snapshot.empty) return null;
  const records = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return records.length >= 2 ? records[1] : null;
}

async function updateAccessoryCost(id, data) {
  await db.collection(COLLECTIONS.ACCESSORY_COSTS).doc(id).update({
    ...data, updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

async function deleteAccessoryCost(id) {
  await db.collection(COLLECTIONS.ACCESSORY_COSTS).doc(id).delete();
}

// ─── 設計款手鍊 ────────────────────────────

async function addBraceletDesign(data) {
  const currentCost = await _calcBraceletCost(data.materials);
  const record = { ...data, baseCost: currentCost, createdAt: firebase.firestore.FieldValue.serverTimestamp() };
  const docRef = await db.collection(COLLECTIONS.BRACELET_DESIGNS).add(record);
  return docRef.id;
}

async function getBraceletDesigns() {
  const snapshot = await db.collection(COLLECTIONS.BRACELET_DESIGNS).get();
  const results = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  results.sort((a, b) => {
    const ta = a.createdAt ? (a.createdAt.seconds || 0) : 0;
    const tb = b.createdAt ? (b.createdAt.seconds || 0) : 0;
    return tb - ta;
  });
  return results;
}

async function getBraceletDesign(id) {
  const doc = await db.collection(COLLECTIONS.BRACELET_DESIGNS).doc(id).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() };
}

async function updateBraceletDesign(id, data) {
  const currentCost = await _calcBraceletCost(data.materials);
  await db.collection(COLLECTIONS.BRACELET_DESIGNS).doc(id).update({
    ...data, baseCost: currentCost, updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

async function deleteBraceletDesign(id) {
  await db.collection(COLLECTIONS.BRACELET_DESIGNS).doc(id).delete();
}

async function updateBraceletSellingPrice(id, sellingPrice) {
  await db.collection(COLLECTIONS.BRACELET_DESIGNS).doc(id).update({
    sellingPrice: Number(sellingPrice) || 0,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

async function calcBraceletCurrentCost(materials) {
  return await _calcBraceletCost(materials);
}

async function _calcBraceletCost(materials) {
  let total = 0;
  for (const m of materials) {
    let cost = 0;
    if (m.type === 'crystal') {
      const summary = await getCrystalCostSummary(m.specKey);
      cost = summary ? summary.latest : 0;
    } else {
      const summary = await getAccessoryCostSummary(m.specKey);
      cost = summary ? summary.latest : 0;
    }
    total += cost * Number(m.quantity);
  }
  return Math.round(total * 10) / 10;
}

async function getLatestCrystalCosts() {
  const snapshot = await db.collection(COLLECTIONS.CRYSTAL_COSTS).get();
  const results = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  results.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const seen = new Set();
  return results.filter(r => {
    if (seen.has(r.specKey)) return false;
    seen.add(r.specKey);
    return true;
  });
}

// ─── 庫存表 ────────────────────────────────

async function getInventory() {
  const snapshot = await db.collection(COLLECTIONS.INVENTORY).get();
  const results = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  results.sort((a, b) => (a.displayName || '').localeCompare(b.displayName || '', 'zh-TW'));
  return results;
}

async function updateInventoryItem(specKey, data) {
  await db.collection(COLLECTIONS.INVENTORY).doc(specKey).update({
    ...data, lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
  });
}

async function deleteInventoryItem(specKey) {
  await db.collection(COLLECTIONS.INVENTORY).doc(specKey).delete();
}

// 依指定日期的進貨紀錄累加庫存（並寫入補貨紀錄）
async function syncCrystalInventoryByDate(dateStr) {
  const costsSnap = await db.collection(COLLECTIONS.CRYSTAL_COSTS).get();
  const all = costsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  // 篩選指定日期，取不重複 specKey
  const seen = new Set();
  const forDate = all.filter(r => {
    if (!r.specKey) return false;
    const recDate = r.date ? String(r.date).slice(0, 10) : '';
    if (recDate !== dateStr) return false;
    if (seen.has(r.specKey)) return false;
    seen.add(r.specKey);
    return true;
  });
  if (!forDate.length) return { updated: [], noSetting: [], notFound: [] };

  const settingsSnap = await db.collection(COLLECTIONS.INITIAL_STOCK).get();
  // 正規化 key，讓 4*6 / 4×6 / 5~6 / 5-6 等字符變異都能匹配
  const normalizeKey = k => String(k || '').replace(/[×✕*xX]/g, 'X').replace(/[~－—–-]/g, '~').toLowerCase();
  const settingsMap = {};
  settingsSnap.docs.forEach(d => { settingsMap[normalizeKey(d.id)] = d.data(); });

  const invSnap = await db.collection(COLLECTIONS.INVENTORY).get();
  const invMap = {};
  invSnap.docs.forEach(d => { invMap[d.id] = { ref: d.ref, data: d.data() }; });

  const updated = [], noSetting = [], notFound = [];
  const ts = Date.now();

  for (const r of forDate) {
    const patternKey = makeCrystalPatternKey(r.size, r.typeA, r.typeB);
    const setting = settingsMap[normalizeKey(patternKey)];
    const displayName = r.displayName || `${r.crystalName} ${r.size}mm ${r.typeB} ${r.typeA}`;

    if (!setting) { noSetting.push(displayName); continue; }

    const defaultQty = setting.defaultQuantity || 0;
    const inv = invMap[r.specKey];

    if (!inv) {
      // 庫存項目不存在，先建立
      await db.collection(COLLECTIONS.INVENTORY).doc(r.specKey).set({
        specKey: r.specKey, type: 'crystal', displayName,
        crystalName: r.crystalName, size: r.size, typeA: r.typeA, typeB: r.typeB,
        quantity: defaultQty,
        lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
        [`restockLog.${ts}_${r.specKey.slice(-4)}`]: { amount: defaultQty, date: dateStr, note: '進貨更新' }
      });
    } else {
      await inv.ref.update({
        quantity: firebase.firestore.FieldValue.increment(defaultQty),
        lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
        [`restockLog.${ts}_${r.specKey.slice(-4)}`]: { amount: defaultQty, date: dateStr, note: '進貨更新' }
      });
    }
    updated.push({ displayName, qty: defaultQty });
  }
  return { updated, noSetting, notFound };
}

async function syncCrystalInventory() {
  // 讀取所有水晶成本紀錄，取得不重複的 specKey
  const costsSnap = await db.collection(COLLECTIONS.CRYSTAL_COSTS).get();
  const all = costsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  const seen = new Set();
  const unique = all.filter(r => r.specKey && !seen.has(r.specKey) && seen.add(r.specKey));

  // 讀取現有庫存 specKey
  const invSnap = await db.collection(COLLECTIONS.INVENTORY).get();
  const existingKeys = new Set(invSnap.docs.map(d => d.id));

  const added = [];
  const noInitialSetting = [];

  for (const r of unique) {
    if (existingKeys.has(r.specKey)) continue; // 已存在，跳過
    const displayName = `${r.crystalName} ${r.size}mm ${r.typeB} ${r.typeA}`;
    await db.collection(COLLECTIONS.INVENTORY).doc(r.specKey).set({
      specKey: r.specKey, type: 'crystal', displayName,
      crystalName: r.crystalName, size: r.size, typeA: r.typeA, typeB: r.typeB,
      quantity: 0,
      lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
    });
    added.push(displayName);
    // 確認是否有初始庫存設定（通用規格鍵）
    const patternKey = makeCrystalPatternKey(r.size, r.typeA, r.typeB);
    const settingDoc = await db.collection(COLLECTIONS.INITIAL_STOCK).doc(patternKey).get();
    if (!settingDoc.exists) noInitialSetting.push(displayName);
  }
  return { added, noInitialSetting };
}

async function syncAccessoryInventory() {
  // 讀取所有配件成本紀錄，取得不重複的 specKey
  const costsSnap = await db.collection(COLLECTIONS.ACCESSORY_COSTS).get();
  const all = costsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  const seen = new Set();
  const unique = all.filter(r => r.specKey && !seen.has(r.specKey) && seen.add(r.specKey));

  const invSnap = await db.collection(COLLECTIONS.INVENTORY).get();
  const existingKeys = new Set(invSnap.docs.map(d => d.id));

  const added = [];

  for (const r of unique) {
    if (existingKeys.has(r.specKey)) continue;
    const displayName = r.productName || r.itemCode || r.specKey;
    await db.collection(COLLECTIONS.INVENTORY).doc(r.specKey).set({
      specKey: r.specKey, type: 'accessory', displayName,
      itemCode: r.itemCode || '',
      productName: r.productName || '',
      spec: r.spec || '',
      quantity: 0,
      lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
    });
    added.push(displayName);
  }
  return { added };
}

async function createInventoryEntry(specKey, data) {
  await db.collection(COLLECTIONS.INVENTORY).doc(specKey).set({
    specKey,
    type: data.type || 'crystal',
    displayName: data.displayName,
    quantity: data.quantity || 0,
    lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
  });
}

async function logDamage(specKey, amount, note) {
  return logManualAdjust(specKey, 'damage', amount, note);
}

async function logManualAdjust(specKey, type, amount, note) {
  const docRef = db.collection(COLLECTIONS.INVENTORY).doc(specKey);
  const doc = await docRef.get();
  if (!doc.exists) throw new Error('找不到此規格庫存');
  const current = doc.data().quantity || 0;
  const ts = Date.now();
  const date = new Date().toISOString().split('T')[0];
  const update = { lastUpdated: firebase.firestore.FieldValue.serverTimestamp() };
  let newQty;

  if (type === 'damage') {
    newQty = Math.max(0, current - Number(amount));
    update.quantity = newQty;
    update[`damageLog.${ts}`] = { amount: Number(amount), note: note || '耗損扣除', date };
  } else if (type === 'restock') {
    newQty = current + Number(amount);
    update.quantity = newQty;
    update[`restockLog.${ts}_add`] = { amount: Number(amount), note: note || '手動補入', date };
  } else { // set
    newQty = Number(amount);
    const diff = newQty - current;
    update.quantity = newQty;
    if (diff > 0) update[`restockLog.${ts}_set`] = { amount: diff, note: note || `手動設定（＋${diff}）`, date };
    else if (diff < 0) update[`damageLog.${ts}`] = { amount: Math.abs(diff), note: note || `手動設定（－${Math.abs(diff)}）`, date };
  }
  await docRef.update(update);
  return newQty;
}

async function deleteLogEntry(specKey, logType, logKey) {
  const field = logType === 'damage' ? `damageLog.${logKey}` : `restockLog.${logKey}`;
  await db.collection(COLLECTIONS.INVENTORY).doc(specKey).update({
    [field]: firebase.firestore.FieldValue.delete(),
    lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
  });
}

async function updateLogEntry(specKey, logType, logKey, amount, note) {
  const field = logType === 'damage' ? `damageLog.${logKey}` : `restockLog.${logKey}`;
  const doc = await db.collection(COLLECTIONS.INVENTORY).doc(specKey).get();
  if (!doc.exists) throw new Error('找不到此規格庫存');
  const logMap = logType === 'damage' ? doc.data().damageLog : doc.data().restockLog;
  const existing = (logMap || {})[logKey] || {};
  await db.collection(COLLECTIONS.INVENTORY).doc(specKey).update({
    [field]: { ...existing, amount: Number(amount), note },
    lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
  });
}

async function processShipment(braceletName, quantity = 1) {
  const snapshot = await db.collection(COLLECTIONS.BRACELET_DESIGNS)
    .where('name', '==', braceletName).get();
  if (snapshot.empty) throw new Error(`找不到設計款「${braceletName}」`);
  const design = snapshot.docs[0].data();
  const alerts = [];

  for (const m of design.materials) {
    const needed = Number(m.quantity) * quantity;
    const docRef = db.collection(COLLECTIONS.INVENTORY).doc(m.specKey);
    const doc = await docRef.get();
    if (!doc.exists) {
      alerts.push({ type: 'warning', msg: `庫存中找不到：${m.displayName}` });
      continue;
    }
    const current = doc.data().quantity || 0;
    const newQty = Math.max(0, current - needed);
    await docRef.update({ quantity: newQty, lastUpdated: firebase.firestore.FieldValue.serverTimestamp() });
    if (newQty < 20) {
      alerts.push({ type: 'danger', msg: `「${m.displayName}」庫存剩 ${newQty} 顆，低於 20，請補貨！` });
    }
  }
  return alerts;
}

async function processReturn(braceletName, quantity = 1) {
  const snapshot = await db.collection(COLLECTIONS.BRACELET_DESIGNS)
    .where('name', '==', braceletName).get();
  if (snapshot.empty) throw new Error(`找不到設計款「${braceletName}」`);
  const design = snapshot.docs[0].data();
  const results = [];

  for (const m of design.materials) {
    const restored = Number(m.quantity) * quantity;
    const docRef = db.collection(COLLECTIONS.INVENTORY).doc(m.specKey);
    const doc = await docRef.get();
    if (!doc.exists) {
      results.push({ name: m.displayName, restored, missing: true });
      continue;
    }
    await docRef.update({
      quantity: firebase.firestore.FieldValue.increment(restored),
      lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
    });
    results.push({ name: m.displayName, restored });
  }
  return results;
}

async function _addInventoryFromCrystalPurchase(specKey, data) {
  const patternKey = makeCrystalPatternKey(data.size, data.typeA, data.typeB);
  const settingDoc = await db.collection(COLLECTIONS.INITIAL_STOCK).doc(patternKey).get();
  const hasInitialSetting = settingDoc.exists;
  const defaultQty = hasInitialSetting ? (settingDoc.data().defaultQuantity || 0) : 0;

  const invRef = db.collection(COLLECTIONS.INVENTORY).doc(specKey);
  const invDoc = await invRef.get();
  const sizeStr = String(data.size || '');
  const displayName = `${data.crystalName} ${sizeStr.includes('mm') ? sizeStr : sizeStr + 'mm'} ${data.typeB} ${data.typeA}`;
  const baseData = {
    specKey, type: 'crystal', displayName,
    crystalName: data.crystalName,
    size: data.size,
    typeA: data.typeA,
    typeB: data.typeB,
    lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
  };

  if (!invDoc.exists) {
    // 無論有無初始設定都建立項目（數量 0），實際累加由「水晶進貨更新」負責
    await invRef.set({ ...baseData, quantity: 0 });
  }
  return { hasInitialSetting, defaultQty };
}

async function _ensureAccessoryInventory(specKey, data) {
  const invRef = db.collection(COLLECTIONS.INVENTORY).doc(specKey);
  const invDoc = await invRef.get();
  if (!invDoc.exists) {
    await invRef.set({
      specKey, type: 'accessory',
      displayName: data.productName || data.itemCode || specKey,
      itemCode: data.itemCode || '',
      productName: data.productName || '',
      spec: data.spec || '',
      quantity: 0,
      lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
    });
    return false; // 新建立
  }
  return true; // 已存在
}

// ─── 初始庫存設定 ──────────────────────────

async function getInitialStockSettings() {
  const snapshot = await db.collection(COLLECTIONS.INITIAL_STOCK).get();
  const results = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  results.sort((a, b) => (a.displayName || '').localeCompare(b.displayName || '', 'zh-TW'));
  return results;
}

async function checkInitialStockSettingExists(data) {
  const normalizedSize = String(data.size || '').replace(/mm$/i, '').trim();
  const specKey = makeCrystalPatternKey(normalizedSize, data.typeA, data.typeB);
  const doc = await db.collection(COLLECTIONS.INITIAL_STOCK).doc(specKey).get();
  return doc.exists;
}

async function setInitialStockSetting(data) {
  const normalizedSize = String(data.size || '').replace(/mm$/i, '').trim();
  const specKey = makeCrystalPatternKey(normalizedSize, data.typeA, data.typeB);
  const displayName = `${normalizedSize}mm ${data.typeB} ${data.typeA}`;
  await db.collection(COLLECTIONS.INITIAL_STOCK).doc(specKey).set({
    specKey, size: normalizedSize, typeA: data.typeA, typeB: data.typeB,
    displayName,
    defaultQuantity: Number(data.defaultQuantity),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  // 回填：庫存中符合尺寸+規格+形狀、且數量為 0 的水晶項目 → 更新為 defaultQuantity
  const invSnap = await db.collection(COLLECTIONS.INVENTORY).get();
  const defaultQty = Number(data.defaultQuantity);
  const toUpdate = invSnap.docs.filter(doc => {
    const d = doc.data();
    if (d.type !== 'crystal') return false;
    if ((d.quantity || 0) !== 0) return false;
    const itemSize = String(d.size || '').replace(/mm$/i, '').trim();
    return itemSize === normalizedSize && d.typeA === data.typeA && d.typeB === data.typeB;
  });

  if (toUpdate.length > 0) {
    const batch = db.batch();
    toUpdate.forEach(doc => {
      batch.update(doc.ref, {
        quantity: defaultQty,
        lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
      });
    });
    await batch.commit();
  }

  return { specKey, updatedCount: toUpdate.length };
}

async function deleteInitialStockSetting(specKey) {
  await db.collection(COLLECTIONS.INITIAL_STOCK).doc(specKey).delete();
}

async function setAccessoryInitialSetting(data) {
  const specKey = makeAccessoryKey(data.itemCode);
  const displayName = data.productName || data.itemCode;
  await db.collection(COLLECTIONS.INITIAL_STOCK).doc(specKey).set({
    specKey, type: 'accessory',
    itemCode: data.itemCode,
    productName: data.productName || '',
    spec: data.spec || '',
    displayName,
    defaultQuantity: Number(data.defaultQuantity),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  // 初始設定新增後，自動在庫存建立對應項目（若尚未存在）
  const invRef = db.collection(COLLECTIONS.INVENTORY).doc(specKey);
  const invDoc = await invRef.get();
  let isNewInventory = false;
  if (!invDoc.exists) {
    await invRef.set({
      specKey, type: 'accessory', displayName,
      itemCode: data.itemCode,
      productName: data.productName || '',
      spec: data.spec || '',
      quantity: 0,
      lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
    });
    isNewInventory = true;
  }
  return { specKey, isNewInventory };
}

// ─── 水晶功效 ─────────────────────────────

// ─── 靈感收藏 ──────────────────────────────

async function addInspiration(data) {
  const record = { ...data, createdAt: firebase.firestore.FieldValue.serverTimestamp() };
  const docRef = await db.collection(COLLECTIONS.INSPIRATIONS).add(record);
  return docRef.id;
}

async function getInspirations(keyword = '') {
  const snapshot = await db.collection(COLLECTIONS.INSPIRATIONS).get();
  let results = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  results.sort((a, b) => {
    const ta = a.createdAt ? a.createdAt.toMillis() : 0;
    const tb = b.createdAt ? b.createdAt.toMillis() : 0;
    return tb - ta;
  });
  if (keyword) {
    const kw = keyword.toLowerCase();
    results = results.filter(r =>
      (r.notes && r.notes.toLowerCase().includes(kw)) ||
      (r.tags && r.tags.some(t => t.toLowerCase().includes(kw))) ||
      (r.crystalMaterials && r.crystalMaterials.some(m => (m.displayName || '').toLowerCase().includes(kw))) ||
      (r.accessoryMaterials && r.accessoryMaterials.some(m => (m.displayName || '').toLowerCase().includes(kw)))
    );
  }
  return results;
}

async function updateInspiration(id, data) {
  await db.collection(COLLECTIONS.INSPIRATIONS).doc(id).update({ ...data, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
}

async function deleteInspiration(id) {
  await db.collection(COLLECTIONS.INSPIRATIONS).doc(id).delete();
}

async function addCrystalEffect(data) {
  const record = { ...data, createdAt: firebase.firestore.FieldValue.serverTimestamp() };
  const docRef = await db.collection(COLLECTIONS.CRYSTAL_EFFECTS).add(record);
  return docRef.id;
}

async function getCrystalEffects(keyword = '') {
  const snapshot = await db.collection(COLLECTIONS.CRYSTAL_EFFECTS).get();
  let results = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  results.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'zh-TW'));
  if (keyword) {
    const kw = keyword.toLowerCase();
    results = results.filter(r =>
      (r.name && r.name.toLowerCase().includes(kw)) ||
      (r.effects && r.effects.toLowerCase().includes(kw)) ||
      (r.tags && r.tags.some(t => t.toLowerCase().includes(kw)))
    );
  }
  return results;
}

async function updateCrystalEffect(id, data) {
  await db.collection(COLLECTIONS.CRYSTAL_EFFECTS).doc(id).update({ ...data, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
}

async function deleteCrystalEffect(id) {
  await db.collection(COLLECTIONS.CRYSTAL_EFFECTS).doc(id).delete();
}

async function getEffectTags() {
  const snapshot = await db.collection(COLLECTIONS.CRYSTAL_EFFECTS).get();
  const all = snapshot.docs.flatMap(doc => doc.data().tags || []);
  return [...new Set(all)].sort();
}
