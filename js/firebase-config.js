// =============================================
// Firebase 設定檔
// =============================================

const firebaseConfig = {
  apiKey: "AIzaSyBepGb7dtWrWu6CCKZMwzvtRWlczUUJnt4",
  authDomain: "junea-crystal.firebaseapp.com",
  projectId: "junea-crystal",
  storageBucket: "junea-crystal.firebasestorage.app",
  messagingSenderId: "1067467501699",
  appId: "1:1067467501699:web:9b469d9d77f7bea3afabb6",
  measurementId: "G-3WF2SFYZRT"
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
