// firebase.js (Versão CORRIGIDA)

// Importa apenas o necessário do Firebase v9 (Melhor Performance!)
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { 
    getFirestore, 
    collection, 
    doc, 
    onSnapshot, 
    query, 
    orderBy, 
    where, 
    limit, // <--- ADICIONADO!
    addDoc, 
    updateDoc, 
    deleteDoc, 
    serverTimestamp, 
    getDocs 
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// Suas configurações
const firebaseConfig = {
    apiKey: "AIzaSyC5vHvRVvhtOOZjXfanQyibodcN4z8NYrE",
    authDomain: "lista-de-compras-399c7.firebaseapp.com",
    projectId: "lista-de-compras-399c7",
    storageBucket: "lista-de-compras-399c7.firebasestorage.app",
    messagingSenderId: "255177223099",
    appId: "1:255177223099:web:ce583b7412fe7dddceb29e" 
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// REFERÊNCIAS DE COLEÇÕES
export const PRODUCTS_COLLECTION = collection(db, 'produtos');
export const SHOPPING_LIST_COLLECTION = collection(db, 'lista_atual');
export const MARKETS_COLLECTION = collection(db, 'mercados');

// EXPORTAÇÕES MODULARES: Expor todos os métodos que usaremos (v9)
export { 
    doc,
    onSnapshot, 
    query, 
    orderBy, 
    where, 
    limit, // <--- ADICIONADO!
    addDoc, 
    updateDoc, 
    deleteDoc, 
    serverTimestamp, 
    getDocs 
};
