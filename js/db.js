// =============================================
// 資料庫操作層 - 所有 Firestore 操作集中於此
// =============================================

// ─── 工具函式 ───────────────────────────────

/** 水晶規格唯一 key：水晶名_尺寸mm_規格A_規格B */
function makeCrystalKey(crystalName, size, typeA, typeB) {
  return `${crystalName}_${size}mm_${typeA}_${typeB}`.replace(/\s+/g, '_');
}

/** 配件唯一 key */
function makeAccessoryKey(itemCode) {
  return `ACC_${itemCode}`.replace(/\s+/g, '_');
}

// ─── 水晶成本表 ────────────────────────────

/** 新增水晶進貨紀錄 */
async function addCrystalCost(data) {
  const specKey = makeCrystalKey(data.crystalName, data.size, data.typeA, data.typeB);
  const record = {
    ...data,
    specKey,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  const docRef = await db.collection(COLLECTIONS.CRYSTAL_COSTS).add(record);

  // 自動更新庫存
  await _addInventoryFromCrystalPurchase(specKey, data);

  return docRef.id;
}

/** 取得水晶進貨紀錄（可帶篩選） */
async function getCrystalCosts(filters = {}) {
  let ref = db.collection(COLLECTIONS.CRYSTAL_COSTS);
  const snapshot = await ref.orderBy('date', 'desc').get();
  let results = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

  // 客戶端篩選（資料量小，不建 composite index）
  if (filters.crystalName) results = results.filter(r => r.crystalName && r.crystalName.includes(filters.crystalName));
  if (filters.size) results = results.filter(r => r.size === filters.size);
  if (filters.typeA) results = results.filter(r => r.typeA === filters.typeA);
  if (filters.typeB) results = results.filter(r => r.typeB === filters.typeB);
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

/** 取得所有不重複的水晶篩選選項 */
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

/** 取得某規格的當前成本（最新進貨）與歷史區間 */
async function getCrystalCostSummary(specKey) {
  const snapshot = await db.collection(COLLECTIONS.CRYSTAL_COSTS)
    .where('specKey', '==', specKey)
    .get();
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

/** 取得某規格的前一筆進貨（用於漲跌偵測） */
async function getPreviousCrystalCost(specKey) {
  const snapshot = await db.collection(COLLECTIONS.CRYSTAL_COSTS)
    .where('specKey', '==', specKey)
    .get();
  if (snapshot.empty) return null;
  const records = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return records.length >= 2 ? records[1] : null;
}

/** 刪除水晶進貨紀錄 */
async function deleteCrystalCost(id) {
  await db.collection(COLLECTIONS.CRYSTAL_COSTS).doc(id).delete();
}

// ─── 配件成本表 ────────────────────────────

/** 新增配件進貨紀錄 */
async function addAccessoryCost(data) {
  const specKey = makeAccessoryKey(data.itemCode);
  const record = {
    ...data,
    specKey,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  const docRef = await db.collection(COLLECTIONS.ACCESSORY_COSTS).add(record);
  return docRef.id;
}

/** 取得配件進貨紀錄（可帶篩選） */
async function getAccessoryCosts(filters = {}) {
  const snapshot = await db.collection(COLLECTIONS.ACCESSORY_COSTS).orderBy('date', 'desc').get();
  let results = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

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

/** 取得配件篩選選項 */
async function getAccessoryFilterOptions() {
  const snapshot = await db.collection(COLLECTIONS.ACCESSORY_COSTS).get();
  const all = snapshot.docs.map(doc => doc.data());
  return {
    vendors: [...new Set(all.map(r => r.vendor).filter(Boolean))].sort()
  };
}

/** 取得某配件的當前成本與歷史區間 */
async function getAccessoryCostSummary(specKey) {
  const snapshot = await db.collection(COLLECTIONS.ACCESSORY_COSTS)
    .where('specKey', '==', specKey)
    .get();
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

/** 取得所有配件（最新成本，用於設計款選料） */
async function getLatestAccessoryCosts() {
  const snapshot = await db.collection(COLLECTIONS.ACCESSORY_COSTS).orderBy('date', 'desc').get();
  const seen = new Set();
  const results = [];
  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (!seen.has(data.specKey)) {
      seen.add(data.specKey);
      results.push({ id: doc.id, ...data });
    }
  }
  return results;
}

/** 取得配件前一筆進貨 */
async function getPreviousAccessoryCost(specKey) {
  const snapshot = await db.collection(COLLECTIONS.ACCESSORY_COSTS)
    .where('specKey', '==', specKey)
    .get();
  if (snapshot.empty) return null;
  const records = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return records.length >= 2 ? records[1] : null;
}

/** 刪除配件進貨紀錄 */
async function deleteAccessoryCost(id) {
  await db.collection(COLLECTIONS.ACCESSORY_COSTS).doc(id).delete();
}

// ─── 設計款手鍊 ────────────────────────────

/** 新增設計款手鍊 */
async function addBraceletDesign(data) {
  const currentCost = await _calcBraceletCost(data.materials);
  const record = {
    ...data,
    baseCost: currentCost,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  const docRef = await db.collection(COLLECTIONS.BRACELET_DESIGNS).add(record);
  return docRef.id;
}

/** 取得所有設計款 */
async function getBraceletDesigns() {
  const snapshot = await db.collection(COLLECTIONS.BRACELET_DESIGNS).orderBy('createdAt', 'desc').get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/** 取得單一設計款 */
async function getBraceletDesign(id) {
  const doc = await db.collection(COLLECTIONS.BRACELET_DESIGNS).doc(id).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() };
}

/** 更新設計款 */
async function updateBraceletDesign(id, data) {
  const currentCost = await _calcBraceletCost(data.materials);
  await db.collection(COLLECTIONS.BRACELET_DESIGNS).doc(id).update({
    ...data,
    baseCost: currentCost,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

/** 刪除設計款 */
async function deleteBraceletDesign(id) {
  await db.collection(COLLECTIONS.BRACELET_DESIGNS).doc(id).delete();
}

/** 計算設計款當前總成本 */
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

/** 取得所有水晶最新成本（用於設計款選料） */
async function getLatestCrystalCosts() {
  const snapshot = await db.collection(COLLECTIONS.CRYSTAL_COSTS).orderBy('date', 'desc').get();
  const seen = new Set();
  const results = [];
  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (!seen.has(data.specKey)) {
      seen.add(data.specKey);
      results.push({ id: doc.id, ...data });
    }
  }
  return results;
}

// ─── 庫存表 ────────────────────────────────

/** 取得所有庫存 */
async function getInventory() {
  const snapshot = await db.collection(COLLECTIONS.INVENTORY).orderBy('displayName').get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/** 記錄耗損 */
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

/** 出貨：依手鍊名稱扣庫存 */
async function processShipment(braceletName, quantity = 1) {
  // 搜尋設計款
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
    await docRef.update({
      quantity: newQty,
      lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
    });
    if (newQty < 20) {
      alerts.push({ type: 'danger', msg: `「${m.displayName}」庫存剩 ${newQty} 顆，低於 20，請補貨！` });
    }
  }
  return alerts;
}

/** 進貨時根據初始庫存設定新增庫存 */
async function _addInventoryFromCrystalPurchase(specKey, data) {
  // 查初始庫存設定
  const settingDoc = await db.collection(COLLECTIONS.INITIAL_STOCK).doc(specKey).get();
  if (!settingDoc.exists) {
    // 沒有設定，跳過（前端會顯示提示）
    return null;
  }
  const defaultQty = settingDoc.data().defaultQuantity || 0;

  // 更新或建立庫存
  const invRef = db.collection(COLLECTIONS.INVENTORY).doc(specKey);
  const invDoc = await invRef.get();
  if (invDoc.exists) {
    await invRef.update({
      quantity: firebase.firestore.FieldValue.increment(defaultQty),
      lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
    });
  } else {
    await invRef.set({
      specKey,
      type: 'crystal',
      displayName: `${data.crystalName} ${data.size}mm ${data.typeB} ${data.typeA}`,
      quantity: defaultQty,
      lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
    });
  }
  return defaultQty;
}

// ─── 初始庫存設定 ──────────────────────────

/** 取得所有初始庫存設定 */
async function getInitialStockSettings() {
  const snapshot = await db.collection(COLLECTIONS.INITIAL_STOCK).orderBy('displayName').get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/** 新增或更新初始庫存設定 */
async function setInitialStockSetting(data) {
  const specKey = makeCrystalKey(data.crystalName, data.size, data.typeA, data.typeB);
  await db.collection(COLLECTIONS.INITIAL_STOCK).doc(specKey).set({
    specKey,
    crystalName: data.crystalName,
    size: data.size,
    typeA: data.typeA,
    typeB: data.typeB,
    displayName: `${data.crystalName} ${data.size}mm ${data.typeB} ${data.typeA}`,
    defaultQuantity: Number(data.defaultQuantity),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  return specKey;
}

/** 刪除初始庫存設定 */
async function deleteInitialStockSetting(specKey) {
  await db.collection(COLLECTIONS.INITIAL_STOCK).doc(specKey).delete();
}

// ─── 水晶功效 ─────────────────────────────

/** 新增水晶功效 */
async function addCrystalEffect(data) {
  const record = { ...data, createdAt: firebase.firestore.FieldValue.serverTimestamp() };
  const docRef = await db.collection(COLLECTIONS.CRYSTAL_EFFECTS).add(record);
  return docRef.id;
}

/** 取得所有水晶功效（可關鍵字篩選） */
async function getCrystalEffects(keyword = '') {
  const snapshot = await db.collection(COLLECTIONS.CRYSTAL_EFFECTS).orderBy('name').get();
  let results = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
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

/** 更新水晶功效 */
async function updateCrystalEffect(id, data) {
  await db.collection(COLLECTIONS.CRYSTAL_EFFECTS).doc(id).update({
    ...data,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

/** 刪除水晶功效 */
async function deleteCrystalEffect(id) {
  await db.collection(COLLECTIONS.CRYSTAL_EFFECTS).doc(id).delete();
}

/** 取得所有功效 tag 選項 */
async function getEffectTags() {
  const snapshot = await db.collection(COLLECTIONS.CRYSTAL_EFFECTS).get();
  const all = snapshot.docs.flatMap(doc => doc.data().tags || []);
  return [...new Set(all)].sort();
}
