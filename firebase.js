// firebase.js (Versão Final - Modularizada com Firebase v9)

// 1. IMPORTAÇÕES NECESSÁRIAS DO FIREBASE V9
import { 
    initializeApp 
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";

import { 
    getFirestore, 
    collection, 
    doc, 
    onSnapshot, 
    query, 
    orderBy, 
    where, 
    limit, 
    addDoc, 
    updateDoc, 
    deleteDoc, 
    serverTimestamp, 
    getDocs 
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";


// 2. CONFIGURAÇÕES (MANTENHA OU ATUALIZE SUAS CHAVES)
const firebaseConfig = {
    apiKey: "AIzaSyC5vHvRVvhtOOZjXfanQyibodcN4z8NYrE",
    authDomain: "lista-de-compras-399c7.firebaseapp.com",
    projectId: "lista-de-compras-399c7",
    storageBucket: "lista-de-compras-399c7.firebasestorage.app",
    messagingSenderId: "255177223099",
    appId: "1:255177223099:web:ce583b7412fe7dddceb29e" 
};

// 3. INICIALIZAÇÃO
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// 4. DEFINIÇÕES DE COLEÇÕES (Exportadas para uso em script.js)
const SHOPPING_LIST_COLLECTION = collection(db, 'shoppingList');
const PRODUCTS_COLLECTION = collection(db, 'products'); // Histórico de preços
const MARKETS_COLLECTION = collection(db, 'markets'); // Nova coleção para mercados

// 5. EXPORTAÇÕES
export {
    SHOPPING_LIST_COLLECTION,
    PRODUCTS_COLLECTION,
    MARKETS_COLLECTION,
    db, // Opcional, mas útil se precisar de mais funcionalidades do DB
    doc, onSnapshot, query, orderBy, where, limit, 
    addDoc, updateDoc, deleteDoc, serverTimestamp, getDocs
};
