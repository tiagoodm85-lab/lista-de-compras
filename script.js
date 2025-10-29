// script.js (Versão Otimizada e Profissional)

// 1. IMPORTAÇÕES - Traz tudo que o firebase.js exportou
import {
    PRODUCTS_COLLECTION, SHOPPING_LIST_COLLECTION, MARKETS_COLLECTION,
    doc, onSnapshot, query, orderBy, where, limit,
    addDoc, updateDoc, deleteDoc, serverTimestamp, getDocs, db 
} from './firebase.js';

// =================================================================
// Variáveis de Estado e Cache
// =================================================================

// Cache para armazenar o histórico de produtos e evitar múltiplas chamadas ao Firestore
const productCache = new Map(); 

// Variável para armazenar o estado mais recente dos itens na lista de compras
let activeShoppingItems = new Set(); 
let unsubscribeShoppingList = null;
let unsubscribeProductHistory = null;
let unsubscribeMarkets = null;

// =================================================================
// Referências de Elementos (DOM)
// =================================================================
// Referências de elementos DOM
const shoppingListUI = document.getElementById('shoppingList');
const itemNameInput = document.getElementById('itemNameInput');
const addButton = document.getElementById('addButton');
const productHistoryUI = document.getElementById('productHistoryArea');
const loadingMessage = document.getElementById('loadingMessage'); // NOVO: Mensagem de carregamento

const buyModal = document.getElementById('buyModal');
const modalItemName = document.getElementById('modalItemName');
const priceInput = document.getElementById('priceInput');
const marketSelect = document.getElementById('marketSelect');
const promoCheckbox = document.getElementById('promoCheckbox');
const confirmBuyButton = document.getElementById('confirmBuy');
const closeButton = document.querySelector('.close-button');
const newMarketArea = document.getElementById('newMarketArea'); // NOVO: Campo de novo mercado
const newMarketInput = document.getElementById('newMarketInput'); // NOVO: Input de novo mercado


let currentItemId = null;
let currentItemName = null;

// =================================================================
// Funções de Ajuda (DOM Manipulation e Lógica)
// =================================================================

// Função para capitalizar o texto (nome do produto/mercado)
const capitalize = (str) => {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

// Abre o Modal de Compra
const openBuyModal = (itemId, itemName) => {
    currentItemId = itemId;
    currentItemName = itemName;
    modalItemName.textContent = capitalize(itemName);
    
    // Reseta o modal
    priceInput.value = '';
    promoCheckbox.checked = false;
    newMarketArea.style.display = 'none';
    newMarketInput.value = '';

    // Chamada para carregar mercados (se ainda não estiver carregado, ou para garantir)
    loadMarketsToSelect();
    marketSelect.value = '';
    
    buyModal.style.display = 'block';
};

// Fecha o Modal de Compra
const closeBuyModal = () => {
    buyModal.style.display = 'none';
};


// Função para gerar o HTML do item da lista
const renderItem = async (itemId, item, existingLi) => {
    const itemNameNormalized = item.nome;
    const itemNameDisplay = capitalize(item.nome);
    const itemMarketDisplay = item.market ? `(${capitalize(item.market)})` : '';
    // A data é opcional, deixei o display simples para não poluir
    // const itemDate = item.timestamp ? new Date(item.timestamp.toDate()).toLocaleDateString('pt-BR') : '';

    // 1. Sugestão de Preço (Best Price Hint) - LÓGICA ATUALIZADA (2 PREÇOS)
    // O cache deve ser populado pelo setupProductHistoryListener
    const priceHints = productCache.get(itemNameNormalized) || { 
        regularPrice: null, regularMarket: null, promoPrice: null, promoMarket: null 
    };
    
    let bestPriceHintHTML = '';
    
    // Preço Regular
    if (priceHints.regularPrice) {
        bestPriceHintHTML += `Mais Barato (Reg.): R$ ${priceHints.regularPrice.toFixed(2)} em ${capitalize(priceHints.regularMarket)}`;
    }
    
    // Preço Promocional
    if (priceHints.promoPrice) {
        if (bestPriceHintHTML) {
            bestPriceHintHTML += `<br>`; // Quebra de linha se já houver preço regular
        }
        bestPriceHintHTML += `Melhor Promoção: R$ ${priceHints.promoPrice.toFixed(2)} em ${capitalize(priceHints.promoMarket)}`;
    }

    if (bestPriceHintHTML) {
        bestPriceHintHTML = `<p class="price-hint">${bestPriceHintHTML}</p>`;
    }

    const li = existingLi || document.createElement('li');
    li.id = `item-${itemId}`;
    li.className = 'shopping-item';
    li.setAttribute('data-id', itemId);

    // ESTRUTURA HTML ATUALIZADA: Item info + Container de Ações
    li.innerHTML = `
        <div class="item-info">
            <span class="item-name">${itemNameDisplay}</span>
            <span class="item-market">${itemMarketDisplay}</span>
            ${bestPriceHintHTML}
        </div>
        <div class="item-actions">
            <button class="options-button" data-action="toggleOptions" aria-label="Opções para ${itemNameDisplay}">⋮</button>
            
            <div class="action-buttons-group">
                <button class="buy-button" data-action="buyItem" data-id="${itemId}">COMPREI</button>
                <button class="delete-button" data-action="deleteItem" data-id="${itemId}">APAGAR</button>
            </div>
        </div>
    `;

    if (!existingLi) {
        shoppingListUI.prepend(li); // Adiciona no topo
    }

    // Retorna a <li> atualizada
    return li;
};

// =================================================================
// 2. FUNÇÕES DO FIREBASE (CRIAÇÃO, DELEÇÃO, ATUALIZAÇÃO)
// =================================================================

// Adicionar novo item à lista
const addItem = async (itemNameFromHistory) => {
    const itemName = itemNameFromHistory || itemNameInput.value.trim().toLowerCase();
    
    if (!itemName) {
        alert("Por favor, insira o nome de um item.");
        return;
    }

    // Verifica se o item já está na lista (para evitar duplicidade)
    if (activeShoppingItems.has(itemName)) {
        alert(`O item "${capitalize(itemName)}" já está na sua lista!`);
        return;
    }

    try {
        await addDoc(SHOPPING_LIST_COLLECTION, {
            nome: itemName,
            timestamp: serverTimestamp()
        });
        itemNameInput.value = ''; // Limpa o input após adicionar
    } catch (error) {
        console.error("Erro ao adicionar item:", error);
        alert("Não foi possível adicionar o item. Verifique sua conexão.");
    }
};

// Lógica de Deleção (SEM CONFIRMAÇÃO)
const deleteItem = async (itemId) => {
    try {
        await deleteDoc(doc(SHOPPING_LIST_COLLECTION, itemId));
        // O listener onSnapshot cuida da remoção visual da tela
    } catch (error) {
        console.error("Erro ao deletar item:", error);
        alert("Não foi possível apagar o item. Tente novamente.");
    }
};

// Adicionar um item do histórico à lista
// NOTE: Esta função agora é chamada diretamente pelo click handler (handleProductHistoryClick)
// e usa a função addItem.
// const addFromHistory = async (name) => { ... } - Removido pois é integrado ao addItem

// Adicionar novo mercado (caso o usuário tenha selecionado a opção "__NEW_MARKET__")
const addNewMarket = async (marketName) => {
    try {
        const newMarketRef = await addDoc(MARKETS_COLLECTION, {
            nome: marketName,
            timestamp: serverTimestamp()
        });
        console.log("Novo mercado adicionado:", marketName);
        return marketName;
    } catch (error) {
        console.error("Erro ao adicionar novo mercado:", error);
        alert("Não foi possível adicionar o novo mercado.");
        return null;
    }
};

// Deleção de todo o histórico de um produto
const deleteProductHistory = async (itemName) => {
    try {
        const q = query(PRODUCTS_COLLECTION, where('nome', '==', itemName));
        const snapshot = await getDocs(q);
        
        const deletePromises = [];
        snapshot.forEach((doc) => {
            deletePromises.push(deleteDoc(doc.ref));
        });
        
        await Promise.all(deletePromises);
        console.log(`Todo histórico de preço para '${itemName}' apagado.`);
        
        // A remoção visual é tratada pelo listener (setupProductHistoryListener)
    } catch (error) {
        console.error("Erro ao apagar histórico do produto:", error);
        alert("Não foi possível apagar o histórico. Tente novamente.");
    }
}

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
    
    // Lógica para Novo Mercado
    if (marketName === '__NEW_MARKET__') {
        const newMarketName = newMarketInput.value.trim().toLowerCase();
        if (!newMarketName) {
            alert("Por favor, digite o nome do novo mercado.");
            return;
        }
        marketName = newMarketName; // Usa o nome digitado como mercado
        await addNewMarket(marketName);
    }

    if (!marketName) {
        alert("Por favor, selecione ou adicione um mercado.");
        return;
    }

    try {
        // 1. Adicionar o registro na coleção de Histórico de Preços (products)
        await addDoc(PRODUCTS_COLLECTION, {
            nome: currentItemName,
            preco: pricePaid,
            market: marketName,
            isPromo: isPromo,
            timestamp: serverTimestamp()
        });

        // 2. Apagar o item da lista de compras principal
        await deleteDoc(doc(SHOPPING_LIST_COLLECTION, currentItemId));

        // 3. Fechar o modal
        closeBuyModal();

    } catch (error) {
        console.error("Erro ao confirmar compra:", error);
        alert("Não foi possível registrar a compra. Tente novamente.");
    }
};


// =================================================================
// Funções de Listener (Dados em Tempo Real)
// =================================================================

// NOVO: Listener de Mercados (Para popular o select do modal)
const loadMarketsToSelect = async () => {
    // Se já houver um listener, cancela para não duplicar
    if (unsubscribeMarkets) unsubscribeMarkets(); 
    
    marketSelect.innerHTML = '<option value="">Selecione o Mercado</option>';
    
    // Adiciona a opção de novo mercado no topo
    const newMarketOption = document.createElement('option');
    newMarketOption.value = '__NEW_MARKET__';
    newMarketOption.textContent = '➕ Adicionar Novo Mercado...';
    marketSelect.appendChild(newMarketOption);

    const q = query(MARKETS_COLLECTION, orderBy('nome'));

    // Cria o listener em tempo real para mercados
    unsubscribeMarkets = onSnapshot(q, (snapshot) => {
        // Limpa todas as opções, exceto o 'Selecione' e o 'Adicionar Novo'
        while (marketSelect.options.length > 1) {
            marketSelect.remove(1); 
        }

        snapshot.forEach((doc) => {
            const market = doc.data();
            const option = document.createElement('option');
            option.value = market.nome; 
            option.textContent = capitalize(market.nome);
            // Insere antes do "Adicionar Novo Mercado"
            marketSelect.insertBefore(option, newMarketOption);
        });
    }, (error) => {
        console.error("Erro no Listener de Mercados:", error);
    });
};

// RENDERIZAÇÃO DO HISTÓRICO VISUAL
const loadProductHistory = () => {
    productHistoryUI.innerHTML = ''; // Limpa a UI

    // Ordena as chaves (nomes dos produtos) em ordem alfabética
    const sortedProductNames = Array.from(productCache.keys()).sort();

    sortedProductNames.forEach(name => {
        // Pega os 2 preços do cache (já processados)
        const prices = productCache.get(name);
        const itemNameDisplay = capitalize(name);

        let priceDisplay = '';
        
        // Exibe Preço Regular
        if (prices.regularPrice) {
            priceDisplay += `R$ ${prices.regularPrice.toFixed(2)} (Reg. em ${capitalize(prices.regularMarket)})`;
        }
        
        // Exibe Preço Promocional
        if (prices.promoPrice) {
            if (priceDisplay) {
                priceDisplay += ` | `;
            }
            priceDisplay += `R$ ${prices.promoPrice.toFixed(2)} (Promo. em ${capitalize(prices.promoMarket)})`;
        }

        if (!priceDisplay) {
            priceDisplay = 'Preço não registrado.';
        }

        // Estrutura HTML do item do histórico
        const historyItemHTML = `
            <div class="product-tag-wrapper">
                <label class="product-tag" data-action="addFromHistory" data-name="${name}">
                    <span class="product-name">${itemNameDisplay}</span>
                    <span class="product-price-info">${priceDisplay}</span>
                </label>
                <button class="delete-history-btn" data-action="deleteHistoryItem" data-name="${name}" aria-label="Apagar todo histórico de ${itemNameDisplay}">
                    &times;
                </button>
            </div>
        `;
        productHistoryUI.innerHTML += historyItemHTML;
    });
    
    // Se o histórico estiver vazio
    if (productHistoryUI.innerHTML === '') {
        productHistoryUI.innerHTML = `<p class="history-empty">Nenhum item comprado ainda.</p>`;
    }
};


// Listener do Histórico (Popula o Cache com 2 Preços)
const setupProductHistoryListener = () => {
    if (unsubscribeProductHistory) {
        unsubscribeProductHistory();
    }

    // Consulta que pega TUDO, pois a agregação (2 melhores preços) será feita no cliente
    const q = query(PRODUCTS_COLLECTION, orderBy('nome')); 

    unsubscribeProductHistory = onSnapshot(q, (snapshot) => {
        // Limpa o cache para reconstruir o histórico
        productCache.clear(); 
        
        const historyData = new Map(); // Key: Item Name, Value: Array of price objects

        snapshot.forEach((doc) => {
            const item = doc.data();
            const nome = item.nome;
            const preco = item.preco;
            const isPromo = item.isPromo || false;
            const market = item.market;
            
            if (!historyData.has(nome)) {
                historyData.set(nome, []);
            }
            historyData.get(nome).push({ preco, isPromo, market });
        });

        // 2. Processa o historyData para encontrar o Melhor Preço (Regular e Promo) e Histórico Visual
        historyData.forEach((prices, nome) => {
            let bestRegular = { price: Infinity, market: null };
            let bestPromo = { price: Infinity, market: null };

            // Itera sobre todos os preços para encontrar os melhores
            prices.forEach(p => {
                if (p.preco > 0) { // Garante que o preço seja válido
                    if (!p.isPromo) {
                        // Preço Regular
                        if (p.preco < bestRegular.price) {
                            bestRegular.price = p.preco;
                            bestRegular.market = p.market;
                        }
                    } else {
                        // Preço em Promoção
                        if (p.preco < bestPromo.price) {
                            bestPromo.price = p.preco;
                            bestPromo.market = p.market;
                        }
                    }
                }
            });
            
            // Armazena no cache (o cache agora armazena o objeto de 2 preços)
            productCache.set(nome, {
                regularPrice: isFinite(bestRegular.price) ? bestRegular.price : null,
                regularMarket: isFinite(bestRegular.price) ? bestRegular.market : null,
                promoPrice: isFinite(bestPromo.price) ? bestPromo.price : null,
                promoMarket: isFinite(bestPromo.price) ? bestPromo.market : null
            });
        });

        // 3. Recarrega o histórico visual após popular o cache
        loadProductHistory();
        
        // Força a atualização da lista de compras para atualizar os 'hints' de preço
        setupShoppingListListener();

    }, (error) => {
        console.error("Erro no Listener do Histórico:", error);
        productHistoryUI.innerHTML = `<p style="color: red;">Não foi possível carregar o histórico.</p>`;
    });
};

// Listener Principal (Lista de Compras Atual)
const setupShoppingListListener = () => {
    if (unsubscribeShoppingList) {
        unsubscribeShoppingList(); // Cancela o listener antigo se existir
    }

    const q = query(SHOPPING_LIST_COLLECTION, orderBy('timestamp', 'desc'));
    
    // NOVO: Mostra a mensagem de carregamento antes de tentar carregar
    if (loadingMessage) loadingMessage.style.display = 'block';

    // Cria o novo listener e armazena a função de cancelamento
    unsubscribeShoppingList = onSnapshot(q, async (snapshot) => {

        if (loadingMessage) loadingMessage.style.display = 'none'; // Esconde após a primeira carga

        // Lógica para garantir que a lista seja limpa se não houver itens
        activeShoppingItems.clear(); // Limpa o Set de itens ativos
        
        // Verifica se a lista estava vazia
        if (snapshot.docs.length === 0) {
            shoppingListUI.innerHTML = '';
        }

        // Processa as mudanças no snapshot
        snapshot.docChanges().forEach(async (change) => {
            const itemId = change.doc.id;
            const item = change.doc.data();

            // Adiciona o nome do item no Set para verificação de duplicidade
            activeShoppingItems.add(item.nome);
            
            let existingLi = document.getElementById(`item-${itemId}`);

            if (change.type === 'added' || change.type === 'modified') {
                
                // Chamada da função de renderização atualizada
                renderItem(itemId, item, existingLi);

            } else if (change.type === 'removed') {
                // Remove o item do DOM se existir
                if (existingLi) {
                    existingLi.remove();
                }
            }
        });
        
        // Se após o processamento, o snapshot estiver vazio e não houver itens renderizados, limpa.
        if (snapshot.docs.length === 0 && shoppingListUI.children.length > 0) {
            shoppingListUI.innerHTML = '';
        }

    }, (error) => {
        console.error("Erro no Listener principal do Firestore:", error);
        if (loadingMessage) loadingMessage.style.display = 'none';
        shoppingListUI.innerHTML = `<li style="color: red;">Erro ao carregar a lista de compras.</li>`;
    });
};


// =================================================================
// Delegação de Eventos
// =================================================================

// NOVO: Função para lidar com o clique na lista
const handleShoppingListClick = (event) => {
    const target = event.target;
    // Encontra o item <li> pai que contém o data-id
    const li = target.closest('.shopping-item');
    if (!li) return;

    const itemId = li.getAttribute('data-id');
    const itemNameElement = li.querySelector('.item-name');
    const itemName = itemNameElement ? itemNameElement.textContent : '';
    const action = target.getAttribute('data-action');
    
    // Lógica para o botão de opções (três pontos)
    if (action === 'toggleOptions') {
        // Fecha as opções de todos os outros itens
        document.querySelectorAll('.shopping-item').forEach(item => {
            if (item !== li) {
                item.classList.remove('active-options');
            }
        });
        // Alterna as opções do item clicado
        li.classList.toggle('active-options');
        
    } else if (action === 'buyItem') {
        // Chamada de função que abre o modal
        openBuyModal(itemId, itemName);
        li.classList.remove('active-options'); // Esconde os botões após a ação
    } else if (action === 'deleteItem') {
        // Usa a função deleteItem (SEM CONFIRMAÇÃO)
        deleteItem(itemId);
        // O listener onSnapshot removerá a LI
    }
};

// Delegação de Eventos para o HISTÓRICO
const handleProductHistoryClick = (event) => {
    const target = event.target.closest('[data-action="addFromHistory"], [data-action="deleteHistoryItem"]');
    if (!target) return;

    const action = target.getAttribute('data-action');
    const itemName = target.getAttribute('data-name');
    
    if (action === 'addFromHistory') {
        // Adiciona o item (o histórico não tem ID do documento, só o nome)
        // O nome está em minúsculas
        addItem(itemName); 
    } else if (action === 'deleteHistoryItem') {
        // Ação de deleção de histórico
        if (confirm(`Tem certeza que deseja apagar TODO o histórico de preços para o item '${capitalize(itemName)}'? Esta ação é IRREVERSÍVEL.`)) {
             deleteProductHistory(itemName);
        }
    }
};


// =================================================================
// Configuração dos Event Listeners Iniciais (Execução Final)
// =================================================================

// Exporta as funções para serem acessíveis pelos eventos 'onclick' no HTML globalmente
window.markAsBought = openBuyModal;
window.deleteItem = deleteItem;


if (!window.isShoppingListInitialized) {

    addButton.addEventListener('click', () => addItem());
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
    
    // NOVO: Listener de Delegação de Eventos para a Lista Principal
    shoppingListUI.addEventListener('click', handleShoppingListClick);
    
    // NOVO: Listener de Delegação de Eventos para o Histórico
    productHistoryUI.addEventListener('click', handleProductHistoryClick);


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
    setupProductHistoryListener(); // 1. Começa a popular o cache de preços
    setupShoppingListListener();   // 2. Começa a popular a lista de compras
    // Note: loadMarketsToSelect() é chamado dentro de openBuyModal
    
    window.isShoppingListInitialized = true;

} else {
    console.warn("Inicialização de listeners bloqueada.");
}
