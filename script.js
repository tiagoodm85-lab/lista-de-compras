// script.js (Versão Final: Compatibilidade Universal PC/Mobile)

// =================================================================
// 1. IMPORTAÇÕES DO FIREBASE
// =================================================================
import {
    PRODUCTS_COLLECTION, SHOPPING_LIST_COLLECTION, MARKETS_COLLECTION,
    doc, onSnapshot, query, orderBy, where, limit,
    addDoc, updateDoc, deleteDoc, serverTimestamp, getDocs
} from './firebase.js';

// =================================================================
// 2. VARIÁVEIS DE ESTADO E REFERÊNCIAS DOM
// =================================================================

const productCache = new Map();
let marketListCache = []; 
let activeShoppingItems = new Set();
let selectedMarket = null; 
let currentFilterMarket = 'TODOS'; 

const shoppingListUI = document.getElementById('shoppingList');
const itemNameInput = document.getElementById('itemNameInput');
const addButton = document.getElementById('addButton');
const productHistoryUI = document.getElementById('productHistoryArea');
const marketFilterAreaUI = document.getElementById('marketFilterArea');

const buyModal = document.getElementById('buyModal');
const modalItemName = document.getElementById('modalItemName');
const purchaseDetailsInput = document.getElementById('purchaseDetailsInput');
const priceInput = document.getElementById('priceInput');
const marketCheckboxesUI = document.getElementById('marketCheckboxes');
const newMarketInput = document.getElementById('newMarketInput');
const newMarketArea = document.getElementById('newMarketArea');
const addNewMarketBtn = document.getElementById('addNewMarketBtn');
const promoCheckbox = document.getElementById('promoCheckbox');
const confirmBuyButton = document.getElementById('confirmBuy');
const closeButton = document.querySelector('.close-button');

// =================================================================
// 3. FUNÇÕES DE MANIPULAÇÃO DO FIRESTORE (CRUD)
// =================================================================

/** Adiciona um novo item à lista de compras */
const addItem = async () => {
    const itemName = itemNameInput.value.trim();
    if (itemName === "") return;

    const normalizedName = itemName.toLowerCase();

    if (activeShoppingItems.has(normalizedName)) {
        alert(`O item '${itemName}' já está na sua lista de compras!`);
        itemNameInput.value = '';
        return;
    }

    try {
        await addDoc(SHOPPING_LIST_COLLECTION, {
            name: itemName,
            normalizedName: normalizedName,
            createdAt: serverTimestamp(),
        });
        itemNameInput.value = ''; 
    } catch (e) {
        console.error("Erro ao adicionar documento: ", e);
        alert("Não foi possível adicionar o item. Verifique a conexão.");
    }
};

/** Deleta um item da lista de compras */
const deleteItem = async (docId) => {
    try {
        await deleteDoc(doc(SHOPPING_LIST_COLLECTION, docId));
    } catch (e) {
        console.error("Erro ao deletar item da lista: ", e);
        alert("Não foi possível deletar o item. Verifique a conexão.");
    }
};

/** Abre o modal de compra */
const openBuyModal = (docId, name) => {
    buyModal.dataset.shoppingDocId = docId;
    modalItemName.textContent = `Item: ${name}`;
    priceInput.value = '';
    purchaseDetailsInput.value = '';
    promoCheckbox.checked = false;
    newMarketArea.style.display = 'none';
    addNewMarketBtn.style.display = 'block';

    marketCheckboxesUI.querySelectorAll('.market-checkbox-input').forEach(cb => {
        cb.checked = false;
    });
    selectedMarket = null;

    const normalizedName = name.toLowerCase();
    const productData = productCache.get(normalizedName);
    if (productData) {
        priceInput.value = productData.latestPrice || '';
        purchaseDetailsInput.value = productData.latestDetails || '';
        promoCheckbox.checked = productData.isPromo || false;
    }

    buyModal.style.display = 'block';
    priceInput.focus();
};

/** Fecha o modal de compra */
const closeBuyModal = () => {
    buyModal.style.display = 'none';
    buyModal.dataset.shoppingDocId = '';
};

/** Confirma a compra e move para o histórico */
const confirmBuyHandler = async () => {
    const docId = buyModal.dataset.shoppingDocId;
    const itemName = modalItemName.textContent.replace('Item: ', '').trim();
    const price = parseFloat(priceInput.value);
    const details = purchaseDetailsInput.value.trim();
    const isPromo = promoCheckbox.checked;

    if (!docId || isNaN(price) || price <= 0 || !selectedMarket) {
        alert("Por favor, insira um preço válido e selecione um mercado.");
        return;
    }

    try {
        let marketId = selectedMarket;
        let marketName = marketListCache.find(m => m.id === marketId)?.name;
        
        if (newMarketArea.style.display === 'block' && newMarketInput.value.trim() !== '') {
            marketName = newMarketInput.value.trim();
            const newMarketRef = await addDoc(MARKETS_COLLECTION, {
                name: marketName,
                createdAt: serverTimestamp()
            });
            marketId = newMarketRef.id;
        }

        const normalizedName = itemName.toLowerCase();
        let productData = productCache.get(normalizedName);

        if (productData) {
            await updateDoc(doc(PRODUCTS_COLLECTION, productData.id), {
                latestPrice: price,
                latestDetails: details,
                isPromo: isPromo,
                latestMarketId: marketId,
                latestMarketName: marketName,
                lastPurchasedAt: serverTimestamp()
            });
        } else {
            await addDoc(PRODUCTS_COLLECTION, {
                name: itemName,
                normalizedName: normalizedName,
                latestPrice: price,
                latestDetails: details,
                isPromo: isPromo,
                latestMarketId: marketId,
                latestMarketName: marketName,
                lastPurchasedAt: serverTimestamp(),
                createdAt: serverTimestamp()
            });
        }

        await deleteDoc(doc(SHOPPING_LIST_COLLECTION, docId));
        closeBuyModal();

    } catch (e) {
        console.error("Erro ao confirmar compra: ", e);
        alert("Não foi possível registrar a compra. Verifique a conexão.");
    }
};

/** Deleta um item do histórico */
const deleteProductFromHistory = async (productId) => {
    if (confirm("ATENÇÃO: Este item será removido PERMANENTEMENTE do seu histórico de preços. Tem certeza?")) {
        try {
            await deleteDoc(doc(PRODUCTS_COLLECTION, productId));
        } catch (e) {
            console.error("Erro ao deletar produto do histórico: ", e);
            alert("Não foi possível deletar o produto do histórico.");
        }
    }
};

/** Adiciona item do histórico à lista */
const addItemFromHistory = async (name, normalizedName) => {
    try {
        await addDoc(SHOPPING_LIST_COLLECTION, {
            name: name,
            normalizedName: normalizedName,
            createdAt: serverTimestamp(),
        });
    } catch (e) {
        console.error("Erro ao adicionar item do histórico: ", e);
    }
};

const reAddFromHistory = (normalizedName, name) => {
    if (activeShoppingItems.has(normalizedName)) {
        return;
    }
    addItemFromHistory(name, normalizedName);
};

// =================================================================
// 4. FUNÇÕES DE RENDERIZAÇÃO (UI)
// =================================================================

const renderMarketFilters = () => {
    const allMarketBtn = `<button class="filter-btn ${currentFilterMarket === 'TODOS' ? 'active' : ''}" data-market-id="TODOS">TODOS</button>`;
    
    const marketButtons = marketListCache.map(market => `
        <button class="filter-btn ${currentFilterMarket === market.id ? 'active' : ''}" 
                data-market-id="${market.id}">
            ${market.name}
        </button>
    `).join('');

    marketFilterAreaUI.innerHTML = allMarketBtn + marketButtons;

    marketFilterAreaUI.querySelectorAll('.filter-btn').forEach(button => {
        button.addEventListener('click', (event) => {
            const marketId = event.target.dataset.marketId;
            currentFilterMarket = marketId;
            renderMarketFilters();
            setupShoppingListListener();
        });
    });
};

const renderProductHistory = () => {
    let html = '';
    const sortedProducts = Array.from(productCache.values()).sort((a, b) => {
        const timeA = a.lastPurchasedAt?.seconds || 0;
        const timeB = b.lastPurchasedAt?.seconds || 0;
        return timeB - timeA;
    });

    if (sortedProducts.length === 0) {
        productHistoryUI.innerHTML = '<p class="history-info">Nenhum produto registrado ainda.</p>';
        return;
    }

    sortedProducts.forEach(product => {
        const isInShoppingList = activeShoppingItems.has(product.normalizedName);
        const promoClass = product.isPromo ? 'promo-tag' : '';
        const priceText = product.latestPrice ? `C$${product.latestPrice.toFixed(2)}` : '';
        const marketText = product.latestMarketName ? `(${product.latestMarketName})` : '';
        
        html += `
            <div class="product-tag-wrapper">
                <label class="product-tag ${promoClass} ${isInShoppingList ? 'added-to-list' : ''}">
                    <input type="checkbox" class="history-checkbox" ${isInShoppingList ? 'checked disabled' : ''}
                           data-normalized-name="${product.normalizedName}"
                           data-item-name="${product.name}"
                    >
                    <span class="product-name">${product.name}</span>
                    <span class="product-details">${product.latestDetails ? product.latestDetails + ' / ' : ''}</span>
                    <span class="product-price">${priceText} ${marketText}</span>
                    ${isInShoppingList ? ' <span class="added-text">✅ Adicionado</span>' : ''}
                </label>
                <button class="delete-history-btn" data-product-id="${product.id}" title="Excluir do Histórico">❌</button>
            </div>
        `;
    });

    productHistoryUI.innerHTML = html;
};

const renderShoppingList = (items) => {
    shoppingListUI.innerHTML = '';
    
    if (items.length === 0) {
        shoppingListUI.innerHTML = `<li style="text-align: center; color: #6c757d;">A lista de compras está vazia!</li>`;
        return;
    }
    
    items.forEach(item => {
        const itemMarketId = item.market || 'TODOS';
        const marketName = marketListCache.find(m => m.id === itemMarketId)?.name || 'Mercado Não Especificado';
        const borderClass = (itemMarketId === 'TODOS') ? 'no-market-item' : (itemMarketId === currentFilterMarket) ? '' : 'other-market-item';
        const isFilteredOut = (currentFilterMarket !== 'TODOS' && itemMarketId !== currentFilterMarket);

        const itemElement = document.createElement('li');
        itemElement.className = `shopping-item ${isFilteredOut ? 'filtered-out' : ''} ${borderClass}`;
        
        const productData = productCache.get(item.normalizedName);
        const hasHistoryPrice = productData && productData.latestPrice > 0;
        const historyPriceText = hasHistoryPrice ? ` (Último preço: C$${productData.latestPrice.toFixed(2)} - ${productData.latestMarketName})` : '';

        itemElement.innerHTML = `
            <span class="item-name-wrapper">
                <span class="item-name">${item.name}</span>
                ${hasHistoryPrice ? '<span class="price-icon" title="Preço Salvo">💰</span>' : ''}
                ${item.market ? `<span class="market-name"> [${marketName}] </span>` : ''}
            </span>
            <div class="shopping-item-actions">
                <button class="buy-button" onclick="markAsBought('${item.id}', '${item.name}')">Comprar</button>
                <button class="delete-button" onclick="deleteItem('${item.id}')">Deletar</button>
            </div>
            <span class="item-details-history">${historyPriceText}</span>
        `;
        
        shoppingListUI.appendChild(itemElement);
    });
};

const renderMarketCheckboxes = () => {
    marketCheckboxesUI.innerHTML = '';
    marketListCache.forEach(market => {
        const marketId = market.id;
        const marketName = market.name;
        
        const wrapper = document.createElement('div');
        wrapper.className = 'market-checkbox-wrapper';
        wrapper.innerHTML = `
            <input type="checkbox" id="market-${marketId}" class="market-checkbox-input" data-market-id="${marketId}">
            <label for="market-${marketId}" class="market-checkbox-label">${marketName}</label>
        `;
        marketCheckboxesUI.appendChild(wrapper);

        const checkbox = wrapper.querySelector(`#market-${marketId}`);
        checkbox.addEventListener('change', (event) => {
            if (event.target.checked) {
                marketCheckboxesUI.querySelectorAll('.market-checkbox-input').forEach(cb => {
                    if (cb !== event.target) {
                        cb.checked = false;
                    }
                });
                selectedMarket = marketId;
                newMarketArea.style.display = 'none';
                addNewMarketBtn.style.display = 'block';
                newMarketInput.value = '';
            } else {
                selectedMarket = null;
            }
        });
    });
};

// =================================================================
// 5. LISTENERS DO FIRESTORE
// =================================================================

const setupProductHistoryListener = () => {
    const q = query(PRODUCTS_COLLECTION, orderBy("normalizedName", "asc"));
    onSnapshot(q, (snapshot) => {
        productCache.clear();
        snapshot.forEach((doc) => {
            productCache.set(doc.data().normalizedName, { id: doc.id, ...doc.data() });
        });
        renderProductHistory();
        setupShoppingListListener(); 
    }, (error) => {
        console.error("Erro ao carregar histórico: ", error);
    });
};

const setupShoppingListListener = () => {
    let q = SHOPPING_LIST_COLLECTION;
    if (currentFilterMarket !== 'TODOS') {
        q = query(SHOPPING_LIST_COLLECTION, where("market", "==", currentFilterMarket), orderBy("createdAt", "desc"));
    } else {
        q = query(SHOPPING_LIST_COLLECTION, orderBy("createdAt", "desc"));
    }

    onSnapshot(q, (snapshot) => {
        const items = [];
        activeShoppingItems.clear();
        snapshot.forEach((doc) => {
            const data = doc.data();
            items.push({ id: doc.id, ...data });
            activeShoppingItems.add(data.normalizedName);
        });
        renderShoppingList(items);
        renderProductHistory();
    }, (error) => {
        console.error("Erro ao carregar lista de compras: ", error);
    });
};

const setupMarketsListener = () => {
    const q = query(MARKETS_COLLECTION, orderBy("name", "asc"));
    onSnapshot(q, (snapshot) => {
        marketListCache = [];
        snapshot.forEach((doc) => {
            marketListCache.push({ id: doc.id, ...doc.data() });
        });
        renderMarketFilters();
        renderMarketCheckboxes();
    }, (error) => {
        console.error("Erro ao carregar mercados: ", error);
    });
};

// =================================================================
// 6. INICIALIZAÇÃO
// =================================================================

window.markAsBought = openBuyModal;
window.deleteItem = deleteItem;
// Importante: Mantenha isso para segurança no PC, mesmo usando delegação
window.deleteProductFromHistory = deleteProductFromHistory; 

if (!window.isShoppingListInitialized) {
    addButton.addEventListener('click', addItem);
    itemNameInput.addEventListener('keyup', (e) => { if (e.key === 'Enter') addItem(); });
    confirmBuyButton.addEventListener('click', confirmBuyHandler);
    closeButton.addEventListener('click', closeBuyModal);
    window.addEventListener('click', (e) => { if (e.target === buyModal) closeBuyModal(); });

    addNewMarketBtn.addEventListener('click', () => {
        newMarketArea.style.display = 'block';
        addNewMarketBtn.style.display = 'none';
        newMarketInput.focus();
        marketCheckboxesUI.querySelectorAll('.market-checkbox-input').forEach(cb => { cb.checked = false; });
        selectedMarket = null;
    });

    // LISTENER UNIVERSAL PARA EXCLUSÃO (PC E MOBILE)
    productHistoryUI.addEventListener('click', (event) => {
        const deleteButton = event.target.closest('.delete-history-btn');
        if (deleteButton) {
            event.preventDefault(); 
            event.stopPropagation(); // Impede que o clique propague para o label (checkbox)
            const productId = deleteButton.dataset.productId;
            if (productId) {
                deleteProductFromHistory(productId); 
            }
        }
    });

    productHistoryUI.addEventListener('change', (event) => {
        const checkbox = event.target.closest('.history-checkbox');
        if (checkbox && checkbox.checked) {
            reAddFromHistory(checkbox.dataset.normalizedName, checkbox.dataset.itemName);
        }
    });

    setupMarketsListener();
    setupProductHistoryListener();
    
    window.isShoppingListInitialized = true;
}
