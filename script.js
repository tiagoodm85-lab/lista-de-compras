// Referências às coleções no Firestore
const PRODUCTS_COLLECTION = db.collection('produtos');
const SHOPPING_LIST_COLLECTION = db.collection('lista_atual');
const MARKETS_COLLECTION = db.collection('mercados');
const shoppingListUI = document.getElementById('shoppingList');
const itemNameInput = document.getElementById('itemNameInput');
const addButton = document.getElementById('addButton'); 

// Referências aos elementos da nova janela modal
const buyModal = document.getElementById('buyModal');
const modalItemName = document.getElementById('modalItemName');
const priceInput = document.getElementById('priceInput');
const marketSelect = document.getElementById('marketSelect');
const promoCheckbox = document.getElementById('promoCheckbox');
const confirmBuyButton = document.getElementById('confirmBuy');
const closeButton = document.querySelector('.close-button');

let currentItemId = null;
let currentItemName = null;
let isListenerActive = false; // NOVA VARIÁVEL GLOBAL


// =================================================================
// Lógica de Adicionar Item
// =================================================================

const addItem = async () => {
    const itemName = itemNameInput.value.trim();
    if (!itemName) return;

    // Adiciona o item à Lista de Compras Atual
    await SHOPPING_LIST_COLLECTION.add({
        nome: itemName.toLowerCase(),
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    });

    itemNameInput.value = '';
};

addButton.addEventListener('click', addItem);
itemNameInput.addEventListener('keyup', (event) => {
    if (event.key === 'Enter') addItem();
});


// =================================================================
// Lógica da Janela Modal (NOVO!)
// =================================================================

// Função para abrir a modal de compra
const openBuyModal = async (itemId, itemName) => {
    currentItemId = itemId;
    currentItemName = itemName;
    modalItemName.textContent = `Registrar compra de: ${itemName}`;
    
    // Popula a lista de mercados
    marketSelect.innerHTML = '<option value="">Carregando...</option>';
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

// Função para fechar a modal
const closeBuyModal = () => {
    buyModal.style.display = 'none';
    priceInput.value = '';
    promoCheckbox.checked = false;
};

// Nova lógica de "Comprei!"
confirmBuyButton.addEventListener('click', async () => {
    const pricePaid = parseFloat(priceInput.value);
    const market = marketSelect.value;
    const isPromo = promoCheckbox.checked;

    if (isNaN(pricePaid) || pricePaid <= 0 || !market) {
        alert("Por favor, preencha todos os campos corretamente.");
        return;
    }
    
    // Agora, chame a lógica de comparação de preço com os novos valores
    await processBuy(currentItemId, currentItemName, pricePaid, market, isPromo);
    
    closeBuyModal();
});

// Eventos da modal
closeButton.addEventListener('click', closeBuyModal);
window.addEventListener('click', (event) => {
    if (event.target === buyModal) {
        closeBuyModal();
    }
});

// A função `markAsBought` agora apenas abre a modal.
window.markAsBought = (itemId, itemName) => openBuyModal(itemId, itemName);


// =================================================================
// Lógica de Registro de Compra e Comparação de Preços (Agora em outra função)
// =================================================================

const processBuy = async (itemId, itemName, pricePaid, market, isPromo) => {
    
    const itemNameNormalized = itemName.toLowerCase();

    // 1. Remove o item da Lista de Compras Atual
    await SHOPPING_LIST_COLLECTION.doc(itemId).delete();

    // 2. Busca o produto mestre para comparação
    const productQuery = await PRODUCTS_COLLECTION.where('nome', '==', itemNameNormalized).limit(1).get();
    
    let productId;
    let bestPrice = Infinity;

    if (!productQuery.empty) {
        const doc = productQuery.docs[0];
        productId = doc.id;
        bestPrice = doc.data().melhorPreco || Infinity;
    } else {
        const newProductRef = await PRODUCTS_COLLECTION.add({
            nome: itemNameNormalized,
            melhorPreco: Infinity, 
            melhorMercado: '',
            emPromocao: false,
        });
        productId = newProductRef.id;
    }

    // 3. Lógica Inteligente: Compara o preço e atualiza o Recorde
    if (pricePaid < bestPrice) {
        await PRODUCTS_COLLECTION.doc(productId).update({
            melhorPreco: pricePaid,
            melhorMercado: market,
            emPromocao: isPromo,
            ultimaAtualizacao: firebase.firestore.FieldValue.serverTimestamp()
        });
        alert(`NOVO RECORDE! O melhor preço de ${itemName} agora é R$ ${pricePaid.toFixed(2)} em ${market}.`);
    } else {
        alert(`Compra registrada, mas o melhor preço continua sendo R$ ${bestPrice.toFixed(2)} em ${bestPrice === Infinity ? '' : productQuery.docs[0].data().melhorMercado}.`);
    }
};

// =================================================================
// Lógica de Sincronização em Tempo Real (O Real-Time Listener)
// =================================================================

// Monitora a Lista de Compras Atual e atualiza a interface em tempo real
SHOPPING_LIST_COLLECTION.orderBy('timestamp').onSnapshot(async (snapshot) => {
    shoppingListUI.innerHTML = '';
    
    for (const doc of snapshot.docs) {
        const item = doc.data();
        const itemId = doc.id;
        
        const itemNameDisplay = item.nome.charAt(0).toUpperCase() + item.nome.slice(1);
        const itemNameNormalized = item.nome; 

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
    
    loadProductHistory(); 
});
isListenerActive = true; // Define como ativo apos a primeira execucao
}

// =================================================================
// Lógica de Reutilização de Itens Comprados (Checkboxes)
// =================================================================

const productHistoryUI = document.getElementById('productHistoryArea');

const getActiveShoppingList = async () => {
    const snapshot = await SHOPPING_LIST_COLLECTION.get();
    
    const activeItems = new Set();
    snapshot.forEach(doc => {
        activeItems.add(doc.data().nome);
    });
    return activeItems;
}

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
            checkbox.checked = true; 
            checkbox.disabled = false;
        } finally {
            checkbox.checked = false;
        }
    } else {
        checkbox.disabled = false;
    }
};

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
