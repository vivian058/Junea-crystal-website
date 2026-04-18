// =============================================
// Firebase 設定檔
// 請至 Firebase Console 取得您的設定後填入
// =============================================

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// 初始化 Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Collection 名稱常數
const COLLECTIONS = {
  CRYSTAL_COSTS: 'crystalCosts',
  ACCESSORY_COSTS: 'accessoryCosts',
  BRACELET_DESIGNS: 'braceletDesigns',
  INVENTORY: 'inventory',
  INITIAL_STOCK: 'initialStockSettings',
  CRYSTAL_EFFECTS: 'crystalEffects'
};
