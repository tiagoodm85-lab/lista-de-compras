// =================================================================
// 1. Variáveis Globais (Definidas Apenas Aqui)
// =================================================================

// As coleções serão definidas após a garantia de que o 'db' do Firebase existe.
let PRODUCTS_COLLECTION;
let SHOPPING_LIST_COLLECTION;
let MARKETS_COLLECTION;

// Referências de Elementos da UI
const shoppingListUI = document.getElementById('shoppingList');
const itemNameInput = document.getElementById('itemNameInput');
const addButton = document.getElementById('addButton'); 
const productHistoryUI = document.getElementById('productHistoryArea');

// Referências aos elementos da janela modal
const buyModal = document.getElementById('buyModal');
const modalItemName = document.getElementById('modalItemName');
const priceInput = document.getElementById('priceInput');
const marketSelect = document.getElementById('marketSelect');
const promoCheckbox = document.getElementById('promoCheckbox');
const confirmBuyButton = document.getElementById('confirmBuy');
const closeButton = document.querySelector('.close-button');

// Variáveis de estado da modal
let currentItemId = null;
let currentItemName = null;


// =================================================================
// 2. Função de Inicialização (Executada após o Firebase)
// =================================================================

// Esta função garante que todo o código dependente do Firebase só rode uma vez.
const initializeApp = () => {
    // Se 'db' não existir no escopo global (pode acontecer com alguns carregamentos)
    if (typeof db === 'undefined' || typeof firebase === 'undefined') {
        console.error("Firebase ou 'db' não estão definidos. Tentando novamente em 500ms.");
        setTimeout(initializeApp, 500);
        return;
    }
    
    // Define as coleções do Firestore AGORA
    PRODUCTS_COLLECTION = db.collection('produtos');
    SHOPPING_LIST_COLLECTION = db.collection('lista_atual');
    MARKETS_COLLECTION = db.collection('mercados');

    // Associa os eventos de input
    addButton.addEventListener('click', addItem);
    itemNameInput.addEventListener('keyup', (event) => {
        if (event.key === 'Enter') addItem();
    });

    // Associa os eventos da modal
    confirmBuyButton.addEventListener('click', confirmBuyHandler);
    closeButton.addEventListener('click', closeBuyModal);
    window.addEventListener('click', (event) => {
        if (event.target === buyModal) {
            closeBuyModal();
        }
    });
    
    // Inicia o Listener ÚNICO para a lista de compras
    setupShoppingListListener();
};


// =================================================================
// 3. Funções Principais
// =================================================================

const addItem = async () => {
    const itemName = itemNameInput.value.trim();
    if (!itemName) return;

    await SHOPPING_LIST_COLLECTION.add({
        nome: itemName.toLowerCase(),
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    });

    itemNameInput.value = '';
};

// Abre a modal e popula a lista de mercados
const openBuyModal = async (itemId, itemName) => {
    currentItemId = itemId;
    currentItemName = itemName;
    modalItemName.textContent = `Registrar compra de: ${itemName.charAt(0).toUpperCase() + itemName.slice(1)}`;
    
    marketSelect.innerHTML = '<option value="" selected disabled hidden>Carregando mercados...</option>';
    const marketsSnapshot = await MARKETS_COLLECTION.orderBy('nome').get();
    
    marketSelect.innerHTML = '<option value="" selected disabled hidden>Selecione um mercado</option>';
    marketsSnapshot.forEach(doc => {
        const option = document.createElement('option');
        option.value = doc.data().nome;
        option.textContent = doc.data().nome;
        marketSelect.appendChild(option);
    });

    buyModal.style.display = 'block';
};

// Fecha a modal e limpa o estado
const closeBuyModal = () => {
    buyModal.style.display = 'none';
    priceInput.value = '';
    marketSelect.value = ''; 
    promoCheckbox.checked = false;
    currentItemId = null;
    currentItemName = null;
};

// Lógica principal de confirmação de compra (Handler)
const confirmBuyHandler = async () => {
    const pricePaid = parseFloat(priceInput.value);
    const market = marketSelect.value;
    const isPromo = promoCheckbox.checked;

    if (isNaN(pricePaid) || pricePaid <= 0 || !market) {
        alert("Por favor, preencha todos os campos corretamente.");
        return;
    }
    
    await processBuy(currentItemId, currentItemName, pricePaid, market, isPromo);
    closeBuyModal();
};

// Processa a compra, deleta o item e atualiza o histórico/recorde
const processBuy = async (itemId, itemName, pricePaid, market, isPromo) => {
    
    const itemNameNormalized = itemName.toLowerCase();

    // 1. Remove o item da Lista de Compras Atual
    await SHOPPING_LIST_COLLECTION.doc(itemId).delete();

    // 2. Busca/Cria o produto mestre
    const productQuery = await PRODUCTS_COLLECTION.where('nome', '==', itemNameNormalized).limit(1).get();
    
    let productId;
    let bestPrice = Infinity;
    let melhorMercadoExistente = 'N/A';

    if (!productQuery.empty) {
        const doc = productQuery.docs[0];
        productId = doc.id;
        bestPrice = doc.data().melhorPreco || Infinity;
        melhorMercadoExistente = doc.data().melhorMercado;
    } else {
        const newProductRef = await PRODUCTS_COLLECTION.add({
            nome: itemNameNormalized,
            melhorPreco: Infinity, 
            melhorMercado: '',
            emPromocao: false,
        });
        productId = newProductRef.id;
    }

    // 3. Compara o preço e atualiza o Recorde
    if (pricePaid < bestPrice) {
        await PRODUCTS_COLLECTION.doc(productId).update({
            melhorPreco: pricePaid,
            melhorMercado: market,
            emPromocao: isPromo,
            ultimaAtualizacao: firebase.firestore.FieldValue.serverTimestamp()
        });
        alert(`NOVO RECORDE! O melhor preço de ${itemName.charAt(0).toUpperCase() + itemName.slice(1)} agora é R$ ${pricePaid.toFixed(2)} em ${market}.`);
    } else {
        const precoExistente = bestPrice === Infinity ? 'N/A' : bestPrice.toFixed(2);
        alert(`Compra registrada, mas o melhor preço continua sendo R$ ${precoExistente} em ${melhorMercadoExistente}.`);
    }
};

// Torna a função acessível no HTML (onclick)
window.markAsBought = (itemId, itemName) => openBuyModal(itemId, itemName);


// Busca a lista de itens ativos no momento
const getActiveShoppingList = async () => {
    const snapshot = await SHOPPING_LIST_COLLECTION.get();
    const activeItems = new Set();
    snapshot.forEach(doc => { activeItems.add(doc.data().nome); });
    return activeItems;
};

// Adiciona o item do histórico à lista de compras
const addFromHistory = async (event, itemName) => {
    event.stopPropagation();
    const checkbox = event.target;
    
    if (checkbox.checked) {
        checkbox.disabled = true;

        try {
            await SHOPPING_LIST_COLLECTION.add({
                nome: itemName,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            });
        } catch (error) {
            console.error("Erro ao adicionar item do histórico:", error);
            alert("Erro ao adicionar item.");
        } finally {
            checkbox.checked = false;
        }
    }
};

// Torna a função acessível no HTML (onclick)
window.addFromHistory = addFromHistory;


// Renderiza a área de histórico de produtos
const loadProductHistory = async () => {
    try {
        const productSnapshot = await PRODUCTS_COLLECTION.orderBy('nome').get();
        const activeItems = await getActiveShoppingList(); 
        
        productHistoryUI.innerHTML = '';
        
        productSnapshot.forEach((doc) => {
            const product = doc.data();
            const productName = product.nome;
            const isItemActive = activeItems.has(productName);
            
            const tag = document.createElement('label');
            tag.className = 'product-tag';
            
            if (isItemActive) {
                tag.classList.add('disabled-tag');
            }
            
            const displayName = productName.charAt(0).toUpperCase() + productName.slice(1);
            const checkboxDisabledAttr = isItemActive ? 'disabled' : '';

            tag.innerHTML = `
                <input type="checkbox" ${checkboxDisabledAttr} onclick="addFromHistory(event, '${productName}')">
                ${displayName}
            `;
            
            productHistoryUI.appendChild(tag);
        });

    } catch (error) {
        console.error("Erro ao carregar o histórico de produtos:", error);
        productHistoryUI.innerHTML = `<p style="color: red;">Não foi possível carregar o histórico.</p>`;
    }
};


// =================================================================
// 4. Sincronização em Tempo Real (O Listener ÚNICO)
// =================================================================

const setupShoppingListListener = () => {
    SHOPPING_LIST_COLLECTION.orderBy('timestamp').onSnapshot(async (snapshot) => {
        
        // CORREÇÃO: Limpa a lista antes de reconstruir.
        shoppingListUI.innerHTML = ''; 
        
        for (const doc of snapshot.docs) {
            const item = doc.data();
            const itemId = doc.id;
            
            const itemNameDisplay = item.nome.charAt(0).toUpperCase() + item.nome.slice(1);
            const itemNameNormalized = item.nome; 

            // Busca os dados do histórico para exibição
            const productQuery = await PRODUCTS_COLLECTION.where('nome', '==', itemNameNormalized).limit(1).get();
            let bestPriceHint = 'Novo item. Sem histórico de preço.';

            if (!productQuery.empty) {
                const productData = productQuery.docs[0].data();
                if (productData.melhorPreco && productData.melhorPreco !== Infinity) {
                    const promo = productData.emPromocao ? ' (PROMO)' : '';
                    bestPriceHint = `Melhor Preço: R$ ${productData.melhorPreco.toFixed(2)} em ${productData.melhorMercado}${promo}`;
                }
            }

            const li = document.createElement('li');
            li.className = 'shopping-item';
            li.innerHTML = `
                <div class="item-info">
                    <span class="item-name">${itemNameDisplay}</span>
                    <span class="price-hint">${bestPriceHint}</span>
                </div>
                <button class="buy-button" onclick="markAsBought('${itemId}', '${item.nome}')">Comprei!</button>
            `;
            
            shoppingListUI.appendChild(li);
        }
        
        // Recarrega o histórico de produtos
        loadProductHistory(); 

    }, (error) => {
        console.error("Erro no Listener principal do Firestore:", error);
        shoppingListUI.innerHTML = `<li style="color: red;">Erro ao carregar a lista de compras.</li>`;
    });
};

// Chama a inicialização no final para garantir que todos os elementos e funções existam
initializeApp();
