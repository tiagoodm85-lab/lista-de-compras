// script.js (Versão Final: Detalhes Salvos no Histórico de Preços e Correção de Duplicação)

// 1. IMPORTAÇÕES DO FIREBASE
import {
    PRODUCTS_COLLECTION, SHOPPING_LIST_COLLECTION, MARKETS_COLLECTION,
    doc, onSnapshot, query, orderBy, where, limit,
    addDoc, updateDoc, deleteDoc, serverTimestamp, getDocs
} from './firebase.js';

// =================================================================
// 2. VARIÁVEIS DE ESTADO E REFERÊNCIAS DOM
// =================================================================

const productCache = new Map();
let marketListCache = []; // Cache para armazenar a lista de todos os mercados

// Variáveis de estado
let activeShoppingItems = new Set();
let selectedMarket = null; // Mercado selecionado no MODAL de compra

// Mercado selecionado para FILTRAR a lista. 'TODOS' é a chave para não aplicar filtro.
let currentFilterMarket = 'TODOS'; 

// Referências da Interface (DOM)
const shoppingListUI = document.getElementById('shoppingList');
const itemNameInput = document.getElementById('itemNameInput');
const addButton = document.getElementById('addButton');
const productHistoryUI = document.getElementById('productHistoryArea');
const marketFilterAreaUI = document.getElementById('marketFilterArea'); // Área de filtro

// Referências do Modal de Compra
const buyModal = document.getElementById('buyModal');
const modalItemName = document.getElementById('modalItemName');
const priceInput = document.getElementById('priceInput');
const marketCheckboxesUI = document.getElementById('marketCheckboxes'); 
const promoCheckbox = document.getElementById('promoCheckbox');
const confirmBuyButton = document.getElementById('confirmBuy');
const closeButton = document.querySelector('.close-button');
const newMarketArea = document.getElementById('newMarketArea');
const newMarketInput = document.getElementById('newMarketInput');
const addNewMarketBtn = document.getElementById('addNewMarketBtn'); 
// NOVO: Referência para o input de Detalhes no Modal
const purchaseDetailsInput = document.getElementById('purchaseDetailsInput'); 


let currentItemId = null;
let currentItemName = null;
let unsubscribeShoppingList = null;
let unsubscribeMarkets = null;


// =================================================================
// 3. FUNÇÕES AUXILIARES
// =================================================================

/**
 * Capitaliza a primeira letra de uma string.
 * @param {string} s - A string a ser capitalizada.
 */
const capitalize = (s) => {
    if (!s) return '';
    return s.charAt(0).toUpperCase() + s.slice(1);
};

/**
 * Retorna o nome do melhor mercado regular de um item.
 * @param {string} itemName - Nome do item.
 * @returns {string} - Nome do mercado ou 'SEM_MERCADO' (para itens novos).
 */
const getBestRegularMarket = (itemName) => {
    const productData = productCache.get(itemName);
    // Retorna o nome do mercado em minúsculas, ou uma chave para itens novos
    return productData?.melhorMercadoRegular || 'SEM_MERCADO'; 
};

/**
 * Formata as dicas de melhor preço (Regular e Promoção) do histórico.
 * Agora inclui os Detalhes da Compra (quantidade/peso).
 * @param {object} productData - Dados do produto do Firestore.
 * @returns {string} - HTML formatado com as dicas de preço.
 */
const formatPriceHint = (productData) => {
    let regularHint = '';
    let promoHint = '';
    const currency = 'CAD$';

    if (productData) {
        // Lógica de Preço Regular
        const regularPrice = productData.melhorPrecoRegular;
        const regularMarket = productData.melhorMercadoRegular;
        const regularDetail = productData.melhorDetalheRegular; // NOVO: Detalhe
        if (regularPrice !== undefined && regularPrice !== null && regularPrice !== Infinity) {
            const formattedPrice = regularPrice.toFixed(2);
            const detailText = regularDetail ? ` (${regularDetail})` : ''; // Adiciona o detalhe
            regularHint = `Regular: ${currency} ${formattedPrice}${detailText} (${capitalize(regularMarket)})`;
        }

        // Lógica de Preço Promoção
        const promoPrice = productData.melhorPrecoPromo;
        const promoMarket = productData.melhorMercadoPromo;
        const promoDetail = productData.melhorDetalhePromo; // NOVO: Detalhe
        if (promoPrice !== undefined && promoPrice !== null && promoPrice !== Infinity) {
            const formattedPrice = promoPrice.toFixed(2);
            const detailText = promoDetail ? ` (${promoDetail})` : ''; // Adiciona o detalhe
            promoHint = `Promoção: ${currency} ${formattedPrice}${detailText} (${capitalize(promoMarket)})`;
        }
    }

    let bestPriceHint = '';
    
    if (regularHint) {
        bestPriceHint += regularHint;
    }
    
    // Adiciona quebra de linha se ambos os preços existirem
    if (regularHint && promoHint) {
        bestPriceHint += '<br>';
    }
    
    if (promoHint) {
        bestPriceHint += promoHint;
    }

    // Adiciona um aviso se não houver histórico de preço regular
    if (!regularHint) {
        bestPriceHint += (bestPriceHint ? '<br>' : '') + 'Sem histórico regular.';
    }

    return bestPriceHint;
};

/**
 * Fecha e limpa o modal de compra.
 */
const closeBuyModal = () => {
    buyModal.style.display = 'none';
    currentItemId = null;
    currentItemName = null;
    priceInput.value = '';
    marketCheckboxesUI.innerHTML = '';
    selectedMarket = null;
    promoCheckbox.checked = false;
    purchaseDetailsInput.value = ''; // NOVO: Limpa o campo de detalhes
    
    newMarketArea.style.display = 'none';
    newMarketInput.value = '';
    addNewMarketBtn.style.display = 'block';
};

// =================================================================
// 4. FUNÇÕES DE MANIPULAÇÃO DO FIREBASE
// =================================================================

/**
 * Deleta um item do histórico de produtos (coleção PRODUCTS_COLLECTION).
 * @param {string} productName - Nome do produto a ser deletado.
 */
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

/**
 * Abre o modal de compra e carrega os mercados.
 * @param {string} itemId - ID do item na lista de compras.
 * @param {string} itemName - Nome do item.
 */
const openBuyModal = async (itemId, itemName) => {
    currentItemId = itemId;
    currentItemName = itemName;
    modalItemName.textContent = `Registrar compra de: ${capitalize(itemName)}`;

    await loadMarketsToSelect(); // Carrega os mercados como checkboxes

    // Garante que os campos estejam limpos ao abrir
    priceInput.value = '';
    promoCheckbox.checked = false;
    purchaseDetailsInput.value = ''; // Limpa os detalhes
    
    newMarketArea.style.display = 'none';
    addNewMarketBtn.style.display = 'block';
    selectedMarket = null;

    buyModal.style.display = 'block';
};

/**
 * Deleta um item da lista de compras (coleção SHOPPING_LIST_COLLECTION).
 * @param {string} itemId - ID do item na lista de compras.
 */
const deleteItem = async (itemId) => {
    try {
        const itemRef = doc(SHOPPING_LIST_COLLECTION, itemId);
        await deleteDoc(itemRef);
    } catch (error) {
        console.error("Erro ao deletar item:", error);
        alert("Não foi possível deletar o item.");
    }
};

/**
 * Adiciona um item à lista de compras principal, prevenindo duplicação.
 */
const addItem = async () => {
    const itemName = itemNameInput.value.trim();
    if (!itemName) return;

    const normalizedName = itemName.toLowerCase();

    // Verifica se já está na lista (usando o estado mais recente)
    if (activeShoppingItems.has(normalizedName)) {
        alert(`O item '${capitalize(normalizedName)}' já está na sua lista de compras.`);
        itemNameInput.value = '';
        return;
    }

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

/**
 * Adiciona um item do histórico (productName) de volta para a lista de compras.
 * @param {string} productName - Nome do produto a ser adicionado.
 */
const addFromHistory = async (productName) => {
    // CORREÇÃO: Verifica o estado atual antes de tentar adicionar para prevenir duplicação
    if (activeShoppingItems.has(productName)) {
        // Isso deve ser prevenido pela UI (checkbox desabilitado), mas é um fallback seguro.
        console.warn(`Item '${capitalize(productName)}' já está na lista. Adição cancelada.`);
        return false;
    }

    try {
        await addDoc(SHOPPING_LIST_COLLECTION, {
            nome: productName,
            timestamp: serverTimestamp(),
        });
        return true;
    } catch (error) {
        console.error("Erro ao adicionar do histórico:", error);
        alert("Não foi possível adicionar o item do histórico. Verifique sua conexão.");
        return false;
    }
};

/**
 * Carrega os mercados do Firestore e os renderiza como checkboxes de seleção única.
 */
const loadMarketsToSelect = async () => {
    marketCheckboxesUI.innerHTML = ''; 
    selectedMarket = null; 
    
    // Usa o cache de mercados para renderizar (marketListCache é populado em setupMarketsListener)
    marketListCache.forEach((marketName) => {
        const marketId = `market-${marketName.replace(/\s/g, '-')}`;

        const wrapper = document.createElement('div');
        wrapper.className = 'market-checkbox-wrapper';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = marketId;
        checkbox.value = marketName;
        checkbox.className = 'market-checkbox-input';

        const label = document.createElement('label');
        label.htmlFor = marketId;
        label.textContent = capitalize(marketName);
        label.className = 'market-checkbox-label';

        // Lógica de seleção única
        checkbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                selectedMarket = marketName;
                marketCheckboxesUI.querySelectorAll('.market-checkbox-input').forEach(cb => {
                    if (cb !== checkbox) {
                        cb.checked = false;
                    }
                });
                newMarketArea.style.display = 'none';
                addNewMarketBtn.style.display = 'block';
                newMarketInput.value = '';
            } else {
                selectedMarket = null;
            }
        });

        wrapper.appendChild(checkbox);
        wrapper.appendChild(label);
        marketCheckboxesUI.appendChild(wrapper);
    });
};

/**
 * Processa a confirmação de compra, registra o preço/mercado/detalhe e remove o item da lista.
 */
const confirmBuyHandler = async () => {
    const pricePaidStr = priceInput.value;
    const isPromo = promoCheckbox.checked;
    const pricePaid = parseFloat(pricePaidStr.replace(',', '.'));
    // NOVO: Lê o detalhe da compra
    const purchaseDetails = purchaseDetailsInput.value.trim(); 

    if (!pricePaid || pricePaid <= 0) {
        alert("Por favor, insira um preço válido.");
        return;
    }

    let marketName = selectedMarket;

    // 1. Lógica para NOVO MERCADO
    if (newMarketArea.style.display === 'block') {
        let newMarketInputTrimmed = newMarketInput.value.trim();
        
        if (!newMarketInputTrimmed) {
            alert("Por favor, insira o nome do novo mercado.");
            return;
        }

        marketName = newMarketInputTrimmed.toLowerCase();
        
        try {
            await addDoc(MARKETS_COLLECTION, {
                nome: marketName,
                timestamp: serverTimestamp(),
            });
        } catch (error) {
            console.error("Erro ao adicionar novo mercado:", error);
            alert("Não foi possível adicionar o novo mercado. Tente novamente.");
            return;
        }

    } else if (!marketName) { // 2. Verifica se algum mercado (existente) foi selecionado
        alert("Por favor, selecione ou adicione um mercado.");
        return;
    }
    
    // 3. REGISTRO DA COMPRA NO HISTÓRICO (PRODUCTS_COLLECTION)
    try {
        const itemRefQuery = query(PRODUCTS_COLLECTION, where('nome', '==', currentItemName), limit(1));
        const itemSnapshot = await getDocs(itemRefQuery);
        let updateFields = { ultimaCompra: serverTimestamp() };

        if (!itemSnapshot.empty) {
            const productDocRef = doc(PRODUCTS_COLLECTION, itemSnapshot.docs[0].id);
            const productData = itemSnapshot.docs[0].data();
            
            // Atualização de Preço Promoção
            const currentPromoPrice = productData.melhorPrecoPromo || Infinity;
            if (isPromo && pricePaid < currentPromoPrice) {
                updateFields.melhorPrecoPromo = pricePaid;
                updateFields.melhorMercadoPromo = marketName;
                updateFields.melhorDetalhePromo = purchaseDetails; // NOVO
            }

            // Atualização de Preço Regular
            const currentRegularPrice = productData.melhorPrecoRegular || Infinity;
            if (!isPromo && pricePaid < currentRegularPrice) {
                updateFields.melhorPrecoRegular = pricePaid;
                updateFields.melhorMercadoRegular = marketName;
                updateFields.melhorDetalheRegular = purchaseDetails; // NOVO
            }

            await updateDoc(productDocRef, updateFields);
        } else {
            // Cria um novo registro de produto
            const productData = {
                nome: currentItemName,
                melhorPrecoPromo: isPromo ? pricePaid : null,
                melhorMercadoPromo: isPromo ? marketName : null,
                melhorDetalhePromo: isPromo ? purchaseDetails : null, // NOVO
                melhorPrecoRegular: !isPromo ? pricePaid : null,
                melhorMercadoRegular: !isPromo ? marketName : null,
                melhorDetalheRegular: !isPromo ? purchaseDetails : null, // NOVO
                ultimaCompra: serverTimestamp()
            };
            await addDoc(PRODUCTS_COLLECTION, productData);
        }

        // 4. REMOVE ITEM DA LISTA DE COMPRAS ATUAL
        if (currentItemId) {
            const shoppingItemRef = doc(SHOPPING_LIST_COLLECTION, currentItemId);
            await deleteDoc(shoppingItemRef);
        }

        priceInput.blur();
        closeBuyModal();
    } catch (error) {
        console.error("Erro ao registrar compra:", error);
        alert("Não foi possível registrar a compra. Verifique sua conexão.");
    }
};

// =================================================================
// 5. FUNÇÕES DE RENDERIZAÇÃO E LISTENERS (FIREBASE & UI)
// =================================================================

/**
 * Renderiza os botões/tags de filtro de mercado.
 */
const renderMarketFilters = () => {
    marketFilterAreaUI.innerHTML = '';
    
    // 1. Opção 'Todos'
    let allMarkets = ['TODOS', ...marketListCache]; 
    
    allMarkets.forEach(market => {
        // Ignora a chave de filtro 'SEM_MERCADO' na interface
        if (market === 'SEM_MERCADO') return;

        const tag = document.createElement('div');
        tag.className = 'filter-market-tag';
        tag.textContent = capitalize(market).replace('_', ' '); 
        tag.dataset.market = market; 

        if (market === currentFilterMarket) {
            tag.classList.add('active');
        }

        tag.addEventListener('click', () => {
            if (currentFilterMarket !== market) {
                currentFilterMarket = market;
                setupShoppingListListener(); 
            }
            renderMarketFilters();
        });

        marketFilterAreaUI.appendChild(tag);
    });
};

/**
 * Configura o listener do Firestore para os Mercados (MARKETS_COLLECTION).
 */
const setupMarketsListener = () => {
    if (unsubscribeMarkets) {
        unsubscribeMarkets();
    }

    const q = query(MARKETS_COLLECTION, orderBy('nome'));
    
    unsubscribeMarkets = onSnapshot(q, (snapshot) => {
        marketListCache = [];
        snapshot.forEach(doc => {
            marketListCache.push(doc.data().nome);
        });
        
        renderMarketFilters(); 

    }, (error) => {
        console.error("Erro no Listener de Mercados:", error);
    });
};

/**
 * Configura o listener do Firestore para o Histórico de Produtos (PRODUCTS_COLLECTION).
 */
const setupProductHistoryListener = () => {
    const q = query(PRODUCTS_COLLECTION, orderBy('nome'));
    
    onSnapshot(q, (snapshot) => {
        productCache.clear();
        snapshot.forEach(doc => {
            const product = { ...doc.data(), id: doc.id };
            productCache.set(product.nome, product);
        });
        
        renderProductHistory(activeShoppingItems); 
        setupShoppingListListener(); // Força a re-renderização da lista principal com novos preços
        renderMarketFilters();
        

    }, (error) => {
        console.error("Erro no Listener do Histórico de Produtos:", error);
    });
};

/**
 * Renderiza os itens do histórico de produtos na UI.
 * CORREÇÃO DE BUG: Remove a mudança otimista de UI no clique e confia no listener.
 * @param {Set<string>} activeItems - Nomes dos itens que estão atualmente na lista de compras.
 */
const renderProductHistory = (activeItems) => {
    
    productHistoryUI.innerHTML = '';
    
    const sortedProducts = Array.from(productCache.values()).sort((a, b) => a.nome.localeCompare(b.nome));

    sortedProducts.forEach((product) => {
        const productName = product.nome;
        const isItemActive = activeItems.has(productName);

        const tag = document.createElement('div');
        tag.className = 'product-tag-wrapper';
        
        const label = document.createElement('label');
        label.className = 'product-tag';

        if (isItemActive) {
            label.classList.add('disabled-tag');
        }

        const displayName = capitalize(productName);
        const checkboxDisabledAttr = isItemActive ? 'disabled' : '';
        const checkboxCheckedAttr = isItemActive ? 'checked' : '';

        label.innerHTML = `
            <input type="checkbox" ${checkboxDisabledAttr} ${checkboxCheckedAttr}>
            <span>${displayName}</span>
        `;
        
        label.addEventListener('click', async (e) => {
            if (e.target.closest('.delete-history-btn')) {
                return;
            }

            e.preventDefault(); 
            
            // CORREÇÃO: Verifica se o item JÁ ESTÁ ATIVO no estado do cache (activeShoppingItems).
            // Se já estiver, não faz nada (prevenindo cliques duplos).
            if (activeItems.has(productName)) {
                return; 
            }
            
            // Adiciona o item. O listener (onSnapshot) fará a re-renderização completa 
            // e desabilitará o checkbox após o sucesso da escrita no Firestore.
            await addFromHistory(productName);
        });
        
        const deleteButton = document.createElement('button');
        deleteButton.className = 'delete-history-btn';
        deleteButton.innerHTML = '🗑️';
        deleteButton.title = `Excluir '${displayName}' do histórico de preços`;
        deleteButton.onclick = (e) => {
            e.stopPropagation();
            deleteProductFromHistory(productName);
        };
        
        tag.appendChild(label);
        tag.appendChild(deleteButton);
        productHistoryUI.appendChild(tag);
    });
};


/**
 * Configura o listener principal do Firestore para a Lista de Compras Atual (SHOPPING_LIST_COLLECTION).
 */
const setupShoppingListListener = () => {
    if (unsubscribeShoppingList) {
        unsubscribeShoppingList(); 
    }

    const q = query(SHOPPING_LIST_COLLECTION); 

    unsubscribeShoppingList = onSnapshot(q, (snapshot) => {

        let shoppingItems = [];
        const currentActiveItems = new Set();
        
        snapshot.docs.forEach(doc => {
            const item = { ...doc.data(), id: doc.id };
            shoppingItems.push(item);
            currentActiveItems.add(item.nome);
        });
        activeShoppingItems = currentActiveItems;

        // 1. FILTRAGEM
        if (currentFilterMarket !== 'TODOS') {
             shoppingItems = shoppingItems.filter(item => {
                const bestMarket = getBestRegularMarket(item.nome);
                
                const isCurrentMarket = bestMarket === currentFilterMarket;
                const isNoMarketItem = bestMarket === 'SEM_MERCADO';

                // Itens SEM_MERCADO devem aparecer em TODOS os filtros (inclusive no TODOS)
                return isCurrentMarket || isNoMarketItem;
             });
        }
        
        // 2. ORDENAÇÃO
        shoppingItems.sort((a, b) => {
            const marketA = getBestRegularMarket(a.nome);
            const marketB = getBestRegularMarket(b.nome);
            
            // SEM MERCADO sempre no final
            if (marketA === 'SEM_MERCADO' && marketB !== 'SEM_MERCADO') return 1;
            if (marketA !== 'SEM_MERCADO' && marketB === 'SEM_MERCADO') return -1;
            
            // ORDEM ALFABÉTICA para os mercados existentes
            if (marketA < marketB) return -1;
            if (marketA > marketB) return 1;

            // Ordem Secundária: Nome do Item (Alfabética)
            if (a.nome < b.nome) return -1;
            if (a.nome > b.nome) return 1;

            return 0;
        });


        // 3. RENDERIZAÇÃO
        shoppingListUI.innerHTML = '';
        
        if (shoppingItems.length === 0) {
            const message = document.createElement('li');
            message.className = 'shopping-item';
            
            if (currentFilterMarket === 'TODOS') {
                message.innerHTML = `<div class="item-info"><span class="item-name">🎉 Lista vazia! Que tal adicionar algo?</span></div>`;
            } else {
                 message.innerHTML = `<div class="item-info"><span class="item-name">✅ Nada para comprar no ${capitalize(currentFilterMarket)}.</span></div>`;
            }
            shoppingListUI.appendChild(message);
        } else {
             shoppingItems.forEach((item) => {
                const itemId = item.id;
                const itemName = item.nome;
                const itemNameDisplay = capitalize(itemName);
                
                const productData = productCache.get(itemName);
                const bestPriceHint = formatPriceHint(productData);
                const bestMarket = getBestRegularMarket(itemName);

                const li = document.createElement('li');
                li.id = `item-${itemId}`;
                li.className = 'shopping-item';
                
                if (bestMarket === 'SEM_MERCADO') {
                     li.classList.add('no-market-item');
                }

                // REMOVIDO: o item-details-wrapper e o item-details-input editável.
                li.innerHTML = `
                    <div class="item-info">
                        <span class="item-name">${itemNameDisplay}</span>
                        <span class="price-hint">${bestPriceHint}</span>
                    </div>
                    <button class="delete-button" onclick="deleteItem('${itemId}')">Remover / Comprei</button>
                    <button class="buy-button" onclick="markAsBought('${itemId}', '${itemName}')">Ajustar</button>
                `;

                shoppingListUI.appendChild(li);
            });
        }
        
        // NOVO: Re-renderiza o histórico aqui para garantir que os status "ativo/desabilitado"
        // estejam corretos após qualquer atualização da lista principal (incluindo adição).
        renderProductHistory(activeShoppingItems);

    }, (error) => {
        console.error("Erro no Listener principal do Firestore:", error);
        shoppingListUI.innerHTML = `<li style="color: red;">Erro ao carregar a lista de compras.</li>`;
    });
};

// =================================================================
// 6. CONFIGURAÇÃO DOS EVENT LISTENERS INICIAIS
// =================================================================

// Expõe funções globais para serem usadas nos atributos 'onclick' do HTML
window.markAsBought = openBuyModal;
window.deleteItem = deleteItem;

if (!window.isShoppingListInitialized) {

    // Listeners para Adicionar Item
    addButton.addEventListener('click', addItem);
    itemNameInput.addEventListener('keyup', (event) => {
        if (event.key === 'Enter') addItem();
    });

    // Listeners do Modal
    confirmBuyButton.addEventListener('click', confirmBuyHandler);
    closeButton.addEventListener('click', closeBuyModal);
    window.addEventListener('click', (event) => {
        if (event.target === buyModal) {
            closeBuyModal();
        }
    });

    // Listener para o botão de 'Adicionar Novo Mercado' 
    addNewMarketBtn.addEventListener('click', () => {
        newMarketArea.style.display = 'block';
        addNewMarketBtn.style.display = 'none';
        newMarketInput.focus();
        
        marketCheckboxesUI.querySelectorAll('.market-checkbox-input').forEach(cb => {
            cb.checked = false;
        });
        selectedMarket = null;
    });

    // Inicialização dos Listeners do Firestore
    setupMarketsListener(); // Inicializa os mercados (e os filtros)
    setupProductHistoryListener(); // Inicializa o cache de produtos e a lista de compras
    
    window.isShoppingListInitialized = true;

} else {
    console.warn("Inicialização de listeners bloqueada.");
}
