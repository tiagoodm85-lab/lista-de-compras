// script.js (Versão Final - Otimizada, Reativa e com Correção de Zoom)

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
    const currency = 'R$'; // Moeda: Reais (Manter R$ conforme index.html)

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

    // Se não tiver nenhum dos dois, mostra a mensagem padrão
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
};

// =================================================================
// Funções de Manipulação do DOM e Firebase
// =================================================================

// Função para abrir o modal de compra (chamada pelo botão 'Comprei!' no HTML)
const openBuyModal = async (itemId, itemName) => {
    currentItemId = itemId;
    currentItemName = itemName;
    modalItemName.textContent = `Registrar compra de: ${capitalize(itemName)}`;

    await loadMarketsToSelect();

    // Preenche o input de preço com o melhor preço regular do cache, se existir
    const cachedProduct = productCache.get(itemName);
    if (cachedProduct && cachedProduct.melhorPrecoRegular) {
        priceInput.value = cachedProduct.melhorPrecoRegular.toFixed(2);
    } else {
        priceInput.value = '';
    }

    promoCheckbox.checked = false;
    buyModal.style.display = 'block';
};

// Função para deletar um item da lista (chamada pelo HTML)
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

// Função para adicionar item do histórico
const addFromHistory = async (event, productName) => {
    const checkbox = event.target;
    checkbox.disabled = true;

    if (checkbox.checked) {
        try {
            await addDoc(SHOPPING_LIST_COLLECTION, {
                nome: productName,
                timestamp: serverTimestamp(),
            });
            // O listener da lista de compras irá reabilitar/desabilitar o checkbox
        } catch (error) {
            console.error("Erro ao adicionar do histórico:", error);
            checkbox.disabled = false;
            checkbox.checked = false;
            alert("Não foi possível adicionar o item do histórico.");
        }
    }
};

// Carrega os mercados para o select do modal
const loadMarketsToSelect = async () => {
    marketSelect.innerHTML = '<option value="">Selecione o Mercado</option>';
    try {
        const q = query(MARKETS_COLLECTION, orderBy('nome'));
        const marketSnapshot = await getDocs(q);

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
    const marketName = marketSelect.value;
    const isPromo = promoCheckbox.checked;

    // Garante que a conversão para float usa '.' como separador decimal
    const pricePaid = parseFloat(pricePaidStr.replace(',', '.'));

    if (!pricePaid || pricePaid <= 0 || !marketName) {
        alert("Por favor, insira um preço válido e selecione um mercado.");
        return;
    }

    try {
        // 1. Atualizar ou Criar o Registro do Produto (Usando o cache)
        const cachedProductData = productCache.get(currentItemName);
        
        let productDocRef;
        
        const updateFields = {
            ultimaCompra: serverTimestamp()
        };

        if (!cachedProductData) {
            // Se for um novo produto no histórico
            const productData = {
                nome: currentItemName,
                melhorPrecoPromo: isPromo ? pricePaid : null,
                melhorMercadoPromo: isPromo ? marketName : null,
                melhorPrecoRegular: !isPromo ? pricePaid : null,
                melhorMercadoRegular: !isPromo ? marketName : null,
                ultimaCompra: serverTimestamp()
            };
            await addDoc(PRODUCTS_COLLECTION, productData);

        } else {
            // Produto existente
            const itemRefQuery = query(PRODUCTS_COLLECTION, where('nome', '==', currentItemName), limit(1));
            const itemSnapshot = await getDocs(itemRefQuery);
            productDocRef = doc(PRODUCTS_COLLECTION, itemSnapshot.docs[0].id);
            const productData = itemSnapshot.docs[0].data();
            
            // LÓGICA DE ATUALIZAÇÃO PARA PROMOÇÃO
            const currentPromoPrice = productData.melhorPrecoPromo || Infinity;
            if (isPromo && pricePaid < currentPromoPrice) {
                updateFields.melhorPrecoPromo = pricePaid;
                updateFields.melhorMercadoPromo = marketName;
            }

            // LÓGICA DE ATUALIZAÇÃO PARA REGULAR
            const currentRegularPrice = productData.melhorPrecoRegular || Infinity;
            if (!isPromo && pricePaid < currentRegularPrice) {
                updateFields.melhorPrecoRegular = pricePaid;
                updateFields.melhorMercadoRegular = marketName;
            }

            await updateDoc(productDocRef, updateFields);
        }
        
        // 2. Apagar o Item da Lista de Compras Atual
        if (currentItemId) {
            const shoppingItemRef = doc(SHOPPING_LIST_COLLECTION, currentItemId);
            await deleteDoc(shoppingItemRef);
        }

        // CORREÇÃO DE ZOOM: Remove o foco do input de preço antes de fechar o modal.
        // Isso força o fechamento do teclado virtual e o navegador a desfazer o zoom.
        priceInput.blur(); 
        
        closeBuyModal(); 
    } catch (error) {
        console.error("Erro ao registrar compra:", error);
        alert("Não foi possível registrar a compra. Verifique sua conexão.");
    }
};

// =================================================================
// Listeners e Cache em Tempo Real
// =================================================================

// Listener para o Histórico de Produtos (Cache em tempo real)
const setupProductHistoryListener = () => {
    const q = query(PRODUCTS_COLLECTION, orderBy('nome'));
    
    // onSnapshot: mantém o productCache atualizado em tempo real
    onSnapshot(q, (snapshot) => {
        productCache.clear();
        snapshot.forEach(doc => {
            const product = doc.data();
            productCache.set(product.nome, product);
        });
        // A renderização do histórico visual será chamada pelo listener da lista de compras
    }, (error) => {
        console.error("Erro no Listener do Histórico de Produtos:", error);
    });
};

// Renderiza o histórico de produtos a partir do cache e itens ativos
const renderProductHistory = async (activeItems) => {
    
    productHistoryUI.innerHTML = '';
    
    // Ordena os produtos do cache alfabeticamente
    const sortedProducts = Array.from(productCache.values()).sort((a, b) => a.nome.localeCompare(b.nome));

    sortedProducts.forEach((product) => {
        const productName = product.nome;
        const isItemActive = activeItems.has(productName);

        const tag = document.createElement('label');
        tag.className = 'product-tag';

        if (isItemActive) {
            tag.classList.add('disabled-tag');
        }

        const displayName = capitalize(productName);
        // Garante que se o item estiver ativo, o checkbox aparece 'checked' e 'disabled'
        const checkboxDisabledAttr = isItemActive ? 'disabled' : '';
        const checkboxCheckedAttr = isItemActive ? 'checked' : ''; 

        tag.innerHTML = `
            <input type="checkbox" ${checkboxDisabledAttr} ${checkboxCheckedAttr} onclick="addFromHistory(event, '${productName}')">
            ${displayName}
        `;

        productHistoryUI.appendChild(tag);
    });
};


// Listener Principal (Lista de Compras Atual)
const setupShoppingListListener = () => {
    if (unsubscribeShoppingList) {
        unsubscribeShoppingList(); 
    }

    const q = query(SHOPPING_LIST_COLLECTION, orderBy('timestamp', 'desc'));

    unsubscribeShoppingList = onSnapshot(q, async (snapshot) => {

        // 1. Lógica para manter os itens ativos
        const activeItems = new Set();
        snapshot.docs.forEach(doc => activeItems.add(doc.data().nome));

        // 2. Renderiza o histórico com os itens ativos atualizados
        renderProductHistory(activeItems);

        // 3. Processa as mudanças na Lista de Compras
        snapshot.docChanges().forEach((change) => {
            const itemId = change.doc.id;
            const item = change.doc.data();
            const itemName = item.nome;
            const itemNameDisplay = capitalize(itemName);
            
            // OTIMIZAÇÃO: Acessa o preço do cache (productCache)
            const productData = productCache.get(itemName);
            const bestPriceHint = formatPriceHint(productData); // Usa o helper de formatação

            if (change.type === 'added' || change.type === 'modified') {
                let existingLi = document.getElementById(`item-${itemId}`);

                const newLiHtml = `
                    <div class="item-info">
                        <span class="item-name">${itemNameDisplay}</span>
                        <span class="price-hint">${bestPriceHint}</span>
                    </div>
                    <button class="delete-button" onclick="deleteItem('${itemId}')">X</button>
                    <button class="buy-button" onclick="markAsBought('${itemId}', '${itemName}')">Comprei!</button>
                `;

                if (change.type === 'added') {
                    const li = document.createElement('li');
                    li.id = `item-${itemId}`;
                    li.className = 'shopping-item';
                    li.innerHTML = newLiHtml;

                    // Adiciona o novo item no topo da lista
                    if (shoppingListUI.firstChild) {
                        shoppingListUI.insertBefore(li, shoppingListUI.firstChild);
                    } else {
                        shoppingListUI.appendChild(li);
                    }
                } else if (change.type === 'modified' && existingLi) {
                    // Atualiza o conteúdo se for uma modificação (ex: preço)
                    existingLi.innerHTML = newLiHtml;
                }
            }

            if (change.type === 'removed') {
                const existingLi = document.getElementById(`item-${itemId}`);
                if (existingLi) {
                    existingLi.remove();
                }
            }
        });

        // Se a lista de compras atual estiver vazia, garante que o HTML esteja limpo
        if (snapshot.docs.length === 0) {
            shoppingListUI.innerHTML = '';
        }

    }, (error) => {
        console.error("Erro no Listener principal do Firestore:", error);
        shoppingListUI.innerHTML = `<li style="color: red;">Erro ao carregar a lista de compras.</li>`;
    });
};

// =================================================================
// Configuração dos Event Listeners Iniciais (Execução Final)
// =================================================================

// Exporta as funções para serem acessíveis pelos eventos 'onclick' no HTML globalmente
window.markAsBought = openBuyModal;
window.deleteItem = deleteItem;
window.addFromHistory = addFromHistory;

if (!window.isShoppingListInitialized) {

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

    // Ordem de inicialização:
    setupProductHistoryListener(); // 1. Começa a popular o cache de preços
    setupShoppingListListener();   // 2. Começa a popular a lista de compras e atualiza o histórico visual
    window.isShoppingListInitialized = true;

} else {
    console.warn("Inicialização de listeners bloqueada.");
}
