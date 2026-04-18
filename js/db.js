// =============================================
// 資料庫操作層 - 所有 Firestore 操作集中於此
// （所有排序改為客戶端處理，避免需要建立索引）
// =============================================

// ─── 工具函式 ───────────────────────────────

function makeCrystalKey(crystalName, size, typeA, typeB) {
  return `${crystalName}_${size}mm_${typeA}_${typeB}`.replace(/\s+/g, '_');
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
    // 確認是否有初始庫存設定
    const settingDoc = await db.collection(COLLECTIONS.INITIAL_STOCK).doc(r.specKey).get();
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
  const docRef = db.collection(COLLECTIONS.INVENTORY).doc(specKey);
  const doc = await docRef.get();
  if (!doc.exists) throw new Error('找不到此規格庫存');
  const current = doc.data().quantity || 0;
  const newQty = Math.max(0, current - Number(amount));
  await docRef.update({
    quantity: newQty,
    lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
    [`damageLog.${Date.now()}`]: { amount: Number(amount), note: note || '', date: new Date().toISOString().split('T')[0] }
  });
  return newQty;
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
  const settingDoc = await db.collection(COLLECTIONS.INITIAL_STOCK).doc(specKey).get();
  const hasInitialSetting = settingDoc.exists;

  // 沒有初始庫存設定 → 不建立庫存，只回傳提醒旗標
  if (!hasInitialSetting) return { hasInitialSetting: false, defaultQty: 0 };

  const defaultQty = settingDoc.data().defaultQuantity || 0;
  const invRef = db.collection(COLLECTIONS.INVENTORY).doc(specKey);
  const invDoc = await invRef.get();
  const baseData = {
    specKey, type: 'crystal',
    displayName: `${data.crystalName} ${data.size}mm ${data.typeB} ${data.typeA}`,
    crystalName: data.crystalName,
    size: data.size,
    typeA: data.typeA,
    typeB: data.typeB,
    lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
  };

  if (invDoc.exists) {
    await invRef.update({ ...baseData, quantity: firebase.firestore.FieldValue.increment(defaultQty) });
  } else {
    await invRef.set({ ...baseData, quantity: defaultQty });
  }
  return { hasInitialSetting: true, defaultQty };
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

async function setInitialStockSetting(data) {
  const specKey = makeCrystalKey(data.crystalName, data.size, data.typeA, data.typeB);
  const displayName = `${data.crystalName} ${data.size}mm ${data.typeB} ${data.typeA}`;
  await db.collection(COLLECTIONS.INITIAL_STOCK).doc(specKey).set({
    specKey, crystalName: data.crystalName, size: data.size, typeA: data.typeA, typeB: data.typeB,
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
      specKey, type: 'crystal', displayName,
      crystalName: data.crystalName, size: data.size, typeA: data.typeA, typeB: data.typeB,
      quantity: 0,
      lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
    });
    isNewInventory = true;
  }
  return { specKey, isNewInventory };
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
