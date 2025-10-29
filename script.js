// script.js (Versão Otimizada e Profissional)

// 1. IMPORTAÇÕES - Traz tudo que o firebase.js exportou
import {
    PRODUCTS_COLLECTION, SHOPPING_LIST_COLLECTION, MARKETS_COLLECTION,
    doc, onSnapshot, query, orderBy, where, limit,
    addDoc, updateDoc, deleteDoc, serverTimestamp, getDocs, db // Importe 'db' se for necessário para coleções não tipadas
} from './firebase.js';

// =================================================================
// Variáveis de Estado e Cache (Mantidas - ÓTIMA PRÁTICA!)
// =================================================================

const productCache = new Map();
let activeShoppingItems = new Set();
let unsubscribeShoppingList = null;
let unsubscribeProductHistory = null;

// =================================================================
// Referências de Elementos (DOM)
// =================================================================
// OBS: Mova newMarketArea e newMarketInput para o topo
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

// Novos elementos do modal:
const newMarketArea = document.getElementById('newMarketArea');
const newMarketInput = document.getElementById('newMarketInput');


let currentItemId = null;
let currentItemName = null;

// =================================================================
// Funções de Ajuda
// =================================================================

// Função de formatação para clareza e reutilização
const formatCurrency = (value) => {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); // Assumindo BRL, ajuste para 'CAD' se necessário.
};

const normalizeName = (name) => name.trim().toLowerCase();
const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);

const openBuyModal = async (itemId, itemName) => {
    // ... Lógica mantida: preenche o modal, carrega mercados e exibe
    currentItemId = itemId;
    currentItemName = normalizeName(itemName);
    modalItemName.textContent = capitalize(itemName);
    priceInput.value = '';
    promoCheckbox.checked = false;
    newMarketArea.style.display = 'none';
    newMarketInput.value = '';

    await loadMarketsToSelect();
    buyModal.style.display = 'block';
};

const closeBuyModal = () => {
    buyModal.style.display = 'none';
    currentItemId = null;
    currentItemName = null;
    priceInput.value = '';
    marketSelect.value = '';
};

// ... (Outras Funções: addItem, deleteItem, confirmBuyHandler, addMarket, etc.)

// =================================================================
// RENDERIZAÇÃO E DOM - Nova função limpa
// =================================================================

/**
 * Cria ou atualiza o elemento LI para um item da lista de compras.
 * @param {string} itemId - ID do documento no Firestore.
 * @param {object} item - Dados do documento.
 * @param {string} bestPriceHint - O texto da sugestão de preço.
 */
const renderShoppingListItem = (itemId, item, bestPriceHint) => {
    let existingLi = document.getElementById(`item-${itemId}`);
    const itemNameDisplay = capitalize(item.nome);

    if (!existingLi) {
        existingLi = document.createElement('li');
        existingLi.id = `item-${itemId}`;
        existingLi.className = 'shopping-item';
        shoppingListUI.appendChild(existingLi);
    }

    // Ações são delegadas ao elemento pai (shoppingListUI)
    existingLi.innerHTML = `
        <div class="item-info">
            <span class="item-name">${itemNameDisplay}</span>
            <p class="price-hint">${bestPriceHint}</p>
        </div>
        <button class="buy-button" data-action="markAsBought" data-id="${itemId}" data-name="${item.nome}">
            Comprei
        </button>
        <button class="delete-button" data-action="deleteItem" data-id="${itemId}">
            Remover
        </button>
    `;

    // Garante que o item adicionado esteja no topo da lista visual
    shoppingListUI.prepend(existingLi);
};


// =================================================================
// LISTENER PRINCIPAL (Lista de Compras Atual) - Simplificado
// =================================================================

const setupShoppingListListener = () => {
    if (unsubscribeShoppingList) {
        unsubscribeShoppingList();
    }

    const q = query(SHOPPING_LIST_COLLECTION, orderBy('timestamp', 'desc'));

    unsubscribeShoppingList = onSnapshot(q, async (snapshot) => {
        // Limpa todos os itens removidos
        snapshot.docChanges().forEach((change) => {
            if (change.type === 'removed') {
                const liToRemove = document.getElementById(`item-${change.doc.id}`);
                if (liToRemove) {
                    liToRemove.remove();
                    activeShoppingItems.delete(normalizeName(change.doc.data().nome));
                }
            }
        });

        // Processa os itens adicionados/modificados
        for (const change of snapshot.docChanges()) {
            const itemId = change.doc.id;
            const item = change.doc.data();
            const itemNameNormalized = normalizeName(item.nome);

            if (change.type === 'added' || change.type === 'modified') {
                // Tenta obter o melhor preço do cache
                const bestPriceData = productCache.get(itemNameNormalized);
                
                let bestPriceHint = 'Sem histórico de preços.';
                if (bestPriceData) {
                    const priceFormatted = formatCurrency(bestPriceData.bestPrice);
                    bestPriceHint = `Melhor preço: ${priceFormatted} (${bestPriceData.market})`;
                }

                // Renderiza o item usando a nova função
                renderShoppingListItem(itemId, item, bestPriceHint);
                activeShoppingItems.add(itemNameNormalized);
            }
        }
    }, (error) => {
        console.error("Erro no Listener principal do Firestore:", error);
        shoppingListUI.innerHTML = `<li style="color: red;">Erro ao carregar a lista de compras.</li>`;
    });
};


// ... (loadProductHistory, renderProductTag, deleteProductFromHistory)

// =================================================================
// 6. Configuração dos Event Listeners Iniciais (Execução Final)
// =================================================================

if (!window.isShoppingListInitialized) {

    // DELEGAÇÃO DE EVENTOS PARA A LISTA PRINCIPAL
    shoppingListUI.addEventListener('click', (event) => {
        const target = event.target;
        const action = target.getAttribute('data-action');
        const itemId = target.getAttribute('data-id');
        const itemName = target.getAttribute('data-name'); // Para markAsBought

        if (!action || !itemId) return; // Não é um botão de ação

        if (action === 'markAsBought') {
            openBuyModal(itemId, itemName);
        } else if (action === 'deleteItem') {
            // Usa a função deleteItem (SEM CONFIRMAÇÃO)
            deleteItem(itemId);
        }
    });
    
    // Delegação de Eventos para o HISTÓRICO (para a função addFromHistory)
    // Se a função addFromHistory e o elemento tiverem sido alterados para usar data-action,
    // adicione um listener aqui:
    // Exemplo: productHistoryUI.addEventListener('click', ...);

    // Eventos mantidos
    addButton.addEventListener('click', addItem);
    itemNameInput.addEventListener('keyup', (event) => {
        if (event.key === 'Enter') addItem();
    });

    confirmBuyButton.addEventListener('click', confirmBuyHandler);
    closeButton.addEventListener('click', closeBuyModal);
    window.addEventListener('click', (event) => {
        if (event.target === buyModal) {
            closeBuyModal();
        }
    });

    // Listener para novo mercado (mantido)
    marketSelect.addEventListener('change', () => {
        if (marketSelect.value === '__NEW_MARKET__') {
            newMarketArea.style.display = 'block';
            newMarketInput.focus();
        } else {
            newMarketArea.style.display = 'none';
            newMarketInput.value = '';
        }
    });

    // Ordem de inicialização:
    setupProductHistoryListener();
    setupShoppingListListener();
    window.isShoppingListInitialized = true;

} else {
    console.warn("Inicialização de listeners bloqueada.");
}
