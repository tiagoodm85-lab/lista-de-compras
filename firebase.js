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


// 2. CONFIGURAÇÕES (MANTER OU ATUALIZAR SUAS CHAVES)
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

// 4. REFERÊNCIAS DE COLEÇÕES (EXPORTÁVEIS)
export const PRODUCTS_COLLECTION = collection(db, 'produtos');
export const SHOPPING_LIST_COLLECTION = collection(db, 'lista_atual');
export const MARKETS_COLLECTION = collection(db, 'mercados');

// 5. FUNÇÕES DO FIRESTORE (EXPORTÁVEIS)
// Isso centraliza todas as chamadas do Firestore para que 'script.js' fique mais limpo.
export { 
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
};
