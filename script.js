// script.js (Versão Otimizada e Profissional - FINAL)

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
let unsubscribeShoppingList = null; // Listener da Lista de Compras
let unsubscribeProductHistory = null; // Listener do Histórico
let currentItemId = null;
let currentItemName = null;

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

// NOVO/CORRIGIDO: Referências para elementos da Etapa 4
const loadingMessage = document.getElementById('loadingMessage'); 
const newMarketArea = document.getElementById('newMarketArea');
const newMarketInput = document.getElementById('newMarketInput'); // Garante que este existe

// =================================================================
// Funções de Ajuda
// =================================================================

// Formata o valor para R$
const formatPrice = (price) => {
    if (typeof price === 'number') {
        return price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }
    return 'R$ 0,00';
};

// Capitaliza a primeira letra de uma string
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Fecha o modal e limpa os campos
const closeBuyModal = () => {
    buyModal.style.display = 'none';
    priceInput.value = '';
    marketSelect.value = '';
    promoCheckbox.checked = false;
    currentItemId = null;
    currentItemName = null;
    newMarketArea.style.display = 'none'; // Esconde a área de novo mercado
    newMarketInput.value = ''; // Limpa o input
};

// =================================================================
// Funções CRUD Principais (Lista de Compras)
// =================================================================

// Adiciona um novo item à lista de compras
const addItem = async () => {
    const itemName = itemNameInput.value.trim().toLowerCase();
    if (!itemName) return alert("Por favor, insira o nome de um item.");

    try {
        await addDoc(SHOPPING_LIST_COLLECTION, {
            nome: itemName,
            timestamp: serverTimestamp() // Usa timestamp do servidor
        });
        itemNameInput.value = '';
    } catch (error) {
        console.error("Erro ao adicionar item:", error);
        alert("Erro ao adicionar item. Tente novamente.");
    }
};

// Remove um item da lista de compras
const deleteItem = async (itemId) => {
    if (confirm("Tem certeza que deseja remover este item da lista?")) {
        try {
            await deleteDoc(doc(SHOPPING_LIST_COLLECTION, itemId));
            // O listener onSnapshot cuidará da remoção do DOM
        } catch (error) {
            console.error("Erro ao deletar item:", error);
            alert("Erro ao remover item. Tente novamente.");
        }
    }
};

// Abre o modal de compra e busca o melhor preço
const openBuyModal = async (itemId, itemName) => {
    currentItemId = itemId;
    currentItemName = itemName;
    modalItemName.textContent = `Registrando compra para: ${capitalize(itemName)}`;
    
    // 1. Carrega os mercados e preenche o select
    await loadMarketsToSelect();

    // 2. Busca a sugestão de preço no cache
    const cachedProduct = productCache.get(itemName);
    if (cachedProduct && cachedProduct.bestPrice) {
        // Preenche o campo de preço com o melhor preço encontrado
        priceInput.value = cachedProduct.bestPrice;
    } else {
         priceInput.value = '';
    }

    // 3. Abre o modal e define o foco no input
    buyModal.style.display = 'block';
    // CORREÇÃO ETAPA 4: Define o foco no primeiro campo de input para acessibilidade
    priceInput.focus(); 
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
    
    if (marketName === '__NEW_MARKET__') {
        const newMarket = newMarketInput.value.trim().toLowerCase();
        if (!newMarket) {
            alert("Por favor, insira o nome do novo mercado.");
            return;
        }
        // 1. Adiciona o novo mercado ao Firestore
        marketName = await addMarket(newMarket);
    }

    if (!marketName) {
        alert("Por favor, selecione ou adicione um mercado.");
        return;
    }

    // Cria o objeto do produto com o preço pago
    const productData = {
        nome: currentItemName,
        preco: pricePaid,
        mercado: marketName,
        emPromocao: isPromo,
        timestamp: serverTimestamp(),
        // Para a lógica de sugestão, 'melhorPreco' e 'melhorMercado' são calculados 
        // separadamente ou mantidos no histórico. Aqui salvamos apenas a compra.
    };

    try {
        // 1. Salva a compra no histórico (products)
        await addDoc(PRODUCTS_COLLECTION, productData);

        // 2. Remove o item da lista de compras (shoppingList)
        await deleteDoc(doc(SHOPPING_LIST_COLLECTION, currentItemId));

        alert(`Compra de ${capitalize(currentItemName)} registrada com sucesso em ${capitalize(marketName)} por ${formatPrice(pricePaid)}.`);

    } catch (error) {
        console.error("Erro ao registrar compra:", error);
        alert("Erro ao registrar compra. Tente novamente.");
    } finally {
        closeBuyModal();
    }
};


// =================================================================
// Funções CRUD Secundárias (Mercados e Histórico)
// =================================================================

// Adiciona um novo mercado
const addMarket = async (marketName) => {
    try {
        const docRef = await addDoc(MARKETS_COLLECTION, {
            nome: marketName,
            timestamp: serverTimestamp()
        });
        return marketName; // Retorna o nome para uso no registro de compra
    } catch (error) {
        console.error("Erro ao adicionar mercado:", error);
        alert("Erro ao adicionar mercado. Tente novamente.");
        return null;
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

// Adiciona um item do histórico de volta à lista de compras
const addFromHistory = async (itemName) => {
    if (activeShoppingItems.has(itemName)) {
        alert(`${capitalize(itemName)} já está na sua lista de compras.`);
        return false;
    }
    
    try {
        await addDoc(SHOPPING_LIST_COLLECTION, {
            nome: itemName,
            timestamp: serverTimestamp()
        });
        return true; // Sucesso
    } catch (error) {
        console.error("Erro ao adicionar do histórico:", error);
        alert("Não foi possível adicionar o item do histórico. Verifique sua conexão.");
        return false; // Falha
    }
};

// Deleta um produto do histórico de preços
const deleteProductHistory = async (productId, itemName) => {
    if (confirm(`Tem certeza que deseja remover o registro de compra de ${capitalize(itemName)} do histórico?`)) {
        try {
            await deleteDoc(doc(PRODUCTS_COLLECTION, productId));
            // O listener do histórico cuidará da atualização do DOM/Cache
        } catch (error) {
            console.error("Erro ao deletar do histórico:", error);
            alert("Erro ao remover o item do histórico.");
        }
    }
};


// =================================================================
// Funções de Renderização e Listeners
// =================================================================

// Busca e retorna a sugestão de preço no cache
const getPriceHint = (itemName) => {
    const cached = productCache.get(itemName);
    if (!cached || !cached.bestPrice) {
        return `<span class="price-hint">Sem histórico de preço.</span>`;
    }
    const priceText = formatPrice(cached.bestPrice);
    const marketText = capitalize(cached.bestMarket);
    const promoText = cached.isPromo ? ' (PROMO)' : '';
    
    return `<span class="price-hint">Melhor preço: ${priceText} em ${marketText}${promoText}</span>`;
};

// Renderiza um único item da lista de compras
const renderShoppingItem = (itemId, item) => {
    const itemNameDisplay = capitalize(item.nome);
    const priceHintHTML = getPriceHint(item.nome);

    let li = document.getElementById(`item-${itemId}`);
    if (!li) {
        li = document.createElement('li');
        li.id = `item-${itemId}`;
        li.className = 'shopping-item';
        shoppingListUI.appendChild(li); // Adiciona ao final (ordenado pelo Firebase)
    }

    li.innerHTML = `
        <div class="item-info">
            <span class="item-name">${itemNameDisplay}</span>
            ${priceHintHTML}
        </div>
        <div class="item-actions">
            <button class="buy-button" onclick="markAsBought('${itemId}', '${item.nome}')">Comprei!</button>
            <button class="delete-button" onclick="deleteItem('${itemId}')">X</button>
        </div>
    `;
};

// Listener para o Histórico de Produtos (Popula o Cache)
const setupProductHistoryListener = () => {
    if (unsubscribeProductHistory) {
        unsubscribeProductHistory();
    }
    
    // Query: Pega todas as compras ordenadas pelo nome, depois pelo menor preço
    // O índice composto é: nome (asc), preco (asc)
    const q = query(PRODUCTS_COLLECTION, orderBy('nome', 'asc'), orderBy('preco', 'asc'));

    unsubscribeProductHistory = onSnapshot(q, (snapshot) => {
        productCache.clear();
        productHistoryUI.innerHTML = '';
        
        let currentItemName = null;
        let lastWrapper = null;
        
        // 1. Popula o Cache de Preços
        // Itera sobre o snapshot ordenado para encontrar o melhor preço para cada produto
        snapshot.docs.forEach((doc) => {
            const product = doc.data();
            const nome = product.nome;

            if (!productCache.has(nome)) {
                // O primeiro item que encontramos é o melhor preço (devido à ordenação)
                productCache.set(nome, {
                    bestPrice: product.preco,
                    bestMarket: product.mercado,
                    isPromo: product.emPromocao,
                    lastPurchase: product.timestamp ? product.timestamp.toDate() : new Date()
                });
            }
        });
        
        // 2. Renderiza o Histórico Visual
        // Itera novamente, desta vez renderizando todos os registros
        snapshot.docs.forEach((doc) => {
            const product = doc.data();
            const nome = product.nome;
            const id = doc.id;

            // Se for um novo produto, cria um novo wrapper
            if (nome !== currentItemName) {
                if (lastWrapper) productHistoryUI.appendChild(lastWrapper);
                
                lastWrapper = document.createElement('div');
                lastWrapper.className = 'product-tag-wrapper';
                
                const itemNameDisplay = capitalize(nome);
                const tag = document.createElement('span');
                
                // Renderiza o item do histórico como um "Tag" clicável
                tag.className = 'product-tag';
                // Usando onclick para adicionar do histórico
                tag.setAttribute('onclick', `addFromHistory('${nome}')`); 
                tag.innerHTML = `${itemNameDisplay} (${formatPrice(product.preco)})`;
                
                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'delete-history-btn';
                deleteBtn.setAttribute('onclick', `deleteProductHistory('${id}', '${nome}')`);
                deleteBtn.innerHTML = '&times;';
                deleteBtn.title = 'Remover este registro de compra';
                
                lastWrapper.appendChild(tag);
                lastWrapper.appendChild(deleteBtn);

                currentItemName = nome;
            }
            // NOTA: Para simplificar, estamos exibindo apenas o último registro de cada produto no histórico.
            // Para exibir TODAS as compras de um produto, a lógica precisaria ser revisada.
            // O código atual mostra o último preço encontrado para cada NOME ÚNICO de produto (pela ordenação).
        });
        
        if (lastWrapper) productHistoryUI.appendChild(lastWrapper); // Adiciona o último
        
        if (snapshot.docs.length === 0) {
            productHistoryUI.innerHTML = `<p class="history-info">Nenhum item comprado registrado. Registre uma compra para ver o histórico de preços.</p>`;
        }
        
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
    
    // ETAPA 4: Mostra a mensagem de carregamento antes de buscar os dados
    loadingMessage.style.display = 'block';

    // Cria o novo listener e armazena a função de cancelamento
    unsubscribeShoppingList = onSnapshot(q, async (snapshot) => {
        
        // ETAPA 4: Esconde a mensagem de carregamento após a primeira busca
        loadingMessage.style.display = 'none'; 
        
        // Limpa e repopula a lista no DOM (mais simples para lidar com modificações/ordenação)
        shoppingListUI.innerHTML = '';
        activeShoppingItems.clear();

        if (snapshot.docs.length === 0) {
            shoppingListUI.innerHTML = `<li>Lista de compras vazia!</li>`;
        }

        // Processa os documentos
        snapshot.docs.forEach((doc) => {
            const item = doc.data();
            const itemId = doc.id;
            activeShoppingItems.add(item.nome); // Atualiza o Set de itens ativos
            renderShoppingItem(itemId, item);
        });

    }, (error) => {
        console.error("Erro no Listener principal do Firestore:", error);
        // ETAPA 4: Esconde a mensagem de carregamento mesmo em caso de erro
        loadingMessage.style.display = 'none'; 
        shoppingListUI.innerHTML = `<li style="color: red;">Erro ao carregar a lista de compras.</li>`;
    });
};

// =================================================================
// Configuração dos Event Listeners Iniciais (Execução Final)
// =================================================================

// CORREÇÃO CRÍTICA: Exporta as funções para serem acessíveis pelos eventos 'onclick' no HTML globalmente
window.markAsBought = openBuyModal;
window.deleteItem = deleteItem;
window.addFromHistory = addFromHistory;
window.deleteProductHistory = deleteProductHistory;


if (!window.isShoppingListInitialized) {

    // Listeners do Input/Botão de Adicionar
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

    // Listener para novo mercado (ETAPA 4)
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
    setupShoppingListListener();   // 2. Começa a popular a lista de compras (que usa o cache)
    window.isShoppingListInitialized = true;

} else {
    console.warn("Inicialização de listeners bloqueada.");
}
