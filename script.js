// script.js (Versão Final - Otimizada, Reativa e com Correção de Toque/Mobile)

// 1. IMPORTAÇÕES - Traz tudo que o firebase.js exportou
import {
    PRODUCTS_COLLECTION, SHOPPING_LIST_COLLECTION, MARKETS_COLLECTION,
    doc, onSnapshot, query, orderBy, where, limit,
    addDoc, updateDoc, deleteDoc, serverTimestamp, getDocs
} from './firebase.js';

// =================================================================
// Variáveis de Estado e Cache
// =================================================================

// Cache para armazenar o histórico de produtos e evitar múltiplas chamadas ao Firestore
const productCache = new Map(); 

// Variável para armazenar o estado mais recente dos itens na lista de compras
let activeShoppingItems = new Set(); 

// =================================================================
// Referências de Elementos (DOM)
// =================================================================

const shoppingListUI = document.getElementById('shoppingList');
const itemNameInput = document.getElementById('itemNameInput');
const addButton = document.getElementById('addButton');
const productHistoryUI = document.getElementById('productHistoryArea');

const buyModal = document.getElementById('buyModal');
const modalItemName = document.getElementById('modalItemName');
const priceInput = document.getElementById('priceInput');
const marketSelect = document.getElementById('marketSelect');
const promoCheckbox = document.getElementById('promoCheckbox');
const confirmBuyButton = document.getElementById('confirmBuy');
const closeButton = document.querySelector('.close-button');

// Referências para o campo de novo mercado
const newMarketArea = document.getElementById('newMarketArea');
const newMarketInput = document.getElementById('newMarketInput');


let currentItemId = null;
let currentItemName = null;
let unsubscribeShoppingList = null;

// =================================================================
// Funções Auxiliares
// =================================================================

// Formata o nome do item com a primeira letra maiúscula
const capitalize = (s) => {
    if (!s) return '';
    return s.charAt(0).toUpperCase() + s.slice(1);
};

// Formata a dica de preço (Regular e Promoção) em linhas separadas.
const formatPriceHint = (productData) => {
    let regularHint = '';
    let promoHint = '';
    // MOEDA: CAD$ (Mantenha consistente com o index.html)
    const currency = 'CAD$'; 

    if (productData) {
        // Melhor Preço Regular
        const regularPrice = productData.melhorPrecoRegular;
        const regularMarket = productData.melhorMercadoRegular;
        if (regularPrice !== undefined && regularPrice !== null && regularPrice !== Infinity) {
            const formattedPrice = regularPrice.toFixed(2);
            regularHint = `Regular: ${currency} ${formattedPrice} (${capitalize(regularMarket)})`;
        }

        // Melhor Preço Promoção
        const promoPrice = productData.melhorPrecoPromo;
        const promoMarket = productData.melhorMercadoPromo;
        if (promoPrice !== undefined && promoPrice !== null && promoPrice !== Infinity) {
            const formattedPrice = promoPrice.toFixed(2);
            promoHint = `Promoção: ${currency} ${formattedPrice} (${capitalize(promoMarket)})`;
        }
    }

    let bestPriceHint = '';
    
    if (regularHint) {
        bestPriceHint += regularHint;
    }
    
    // Adiciona quebra de linha (se ambos existirem)
    if (regularHint && promoHint) {
        bestPriceHint += '<br>';
    }
    
    if (promoHint) {
        bestPriceHint += promoHint;
    }

    return bestPriceHint || 'Novo item. Sem histórico de preço.';
};

// Função para fechar o modal
const closeBuyModal = () => {
    buyModal.style.display = 'none';
    currentItemId = null;
    currentItemName = null;
    priceInput.value = '';
    marketSelect.value = '';
    promoCheckbox.checked = false;
    
    // Reseta o campo de novo mercado
    newMarketArea.style.display = 'none';
    newMarketInput.value = '';
};

// =================================================================
// Funções de Manipulação do DOM e Firebase
// =================================================================

// Deleta item do histórico de produtos (PRODUCTS_COLLECTION)
const deleteProductFromHistory = async (productName) => {
    if (!confirm(`Tem certeza que deseja excluir '${capitalize(productName)}' permanentemente do histórico de preços?`)) {
        return;
    }

    try {
        const q = query(PRODUCTS_COLLECTION, where('nome', '==', productName), limit(1));
        const itemSnapshot = await getDocs(q);

        if (!itemSnapshot.empty) {
            const docRef = doc(PRODUCTS_COLLECTION, itemSnapshot.docs[0].id);
            await deleteDoc(docRef);
            alert(`'${capitalize(productName)}' excluído do histórico com sucesso.`);
        } else {
            alert("Item não encontrado no histórico.");
        }
    } catch (error) {
        console.error("Erro ao deletar item do histórico:", error);
        alert("Não foi possível excluir o item do histórico.");
    }
};

// Abre o modal de compra
const openBuyModal = async (itemId, itemName) => {
    currentItemId = itemId;
    currentItemName = itemName;
    modalItemName.textContent = `Registrar compra de: ${capitalize(itemName)}`;

    await loadMarketsToSelect();

    priceInput.value = '';
    marketSelect.value = '';
    promoCheckbox.checked = false;
    newMarketArea.style.display = 'none'; 

    buyModal.style.display = 'block';
};

// Deleta um item da lista
const deleteItem = async (itemId) => {
    if (confirm('Tem certeza que deseja remover este item da lista?')) {
        try {
            const itemRef = doc(SHOPPING_LIST_COLLECTION, itemId);
            await deleteDoc(itemRef);
        } catch (error) {
            console.error("Erro ao deletar item:", error);
            alert("Não foi possível deletar o item.");
        }
    }
};

// Lógica de Adicionar Item
const addItem = async () => {
    const itemName = itemNameInput.value.trim();
    if (!itemName) return;

    const normalizedName = itemName.toLowerCase();

    try {
        await addDoc(SHOPPING_LIST_COLLECTION, {
            nome: normalizedName,
            timestamp: serverTimestamp(),
        });
        itemNameInput.value = '';
    } catch (error) {
        console.error("Erro ao adicionar item:", error);
        alert("Não foi possível adicionar o item à lista.");
    }
};

// FUNÇÃO: Adiciona item do histórico (Apenas lógica de Firebase)
const addFromHistory = async (productName) => {
    try {
        await addDoc(SHOPPING_LIST_COLLECTION, {
            nome: productName,
            timestamp: serverTimestamp(),
        });
        return true; // Sucesso
    } catch (error) {
        console.error("Erro ao adicionar do histórico:", error);
        alert("Não foi possível adicionar o item do histórico. Verifique sua conexão.");
        return false; // Falha
    }
};

// Carrega os mercados para o select do modal
const loadMarketsToSelect = async () => {
    marketSelect.innerHTML = '<option value="">Selecione o Mercado</option>';
    try {
        const q = query(MARKETS_COLLECTION, orderBy('nome'));
        const marketSnapshot = await getDocs(q);

        const newMarketOption = document.createElement('option');
        newMarketOption.value = '__NEW_MARKET__';
        newMarketOption.textContent = '➕ Adicionar Novo Mercado...';
        marketSelect.appendChild(newMarketOption);

        marketSnapshot.forEach((doc) => {
            const market = doc.data();
            const option = document.createElement('option');
            option.value = market.nome; 
            option.textContent = capitalize(market.nome);
            marketSelect.appendChild(option);
        });
    } catch (error) {
        console.error("Erro ao carregar mercados:", error);
    }
};

// Lógica de Registro de Compra
const confirmBuyHandler = async () => {
    const pricePaidStr = priceInput.value;
    const isPromo = promoCheckbox.checked;

    const pricePaid = parseFloat(pricePaidStr.replace(',', '.'));

    if (!pricePaid || pricePaid <= 0) {
        alert("Por favor, insira um preço válido.");
        return;
    }

    let marketName = marketSelect.value;

    if (marketName
