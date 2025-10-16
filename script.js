// =================================================================
// 1. Variáveis Globais, Incluindo o Unsubscriber
// =================================================================

// Variável que irá armazenar a função de CANCELAMENTO do listener do Firebase.
// Esta é a CHAVE da correção.
let unsubscribeShoppingList = null; 

// O 'db' é definido no index.html e está disponível globalmente.
const PRODUCTS_COLLECTION = db.collection('produtos');
const SHOPPING_LIST_COLLECTION = db.collection('lista_atual');
const MARKETS_COLLECTION = db.collection('mercados');

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
// 2. Lógica de Adicionar Item
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


// =================================================================
// 3. Funções de Modal e Compra
// =================================================================

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

const closeBuyModal = () => {
    buyModal.style.display = 'none';
    priceInput.value = '';
    marketSelect.value = ''; 
    promoCheckbox.checked = false;
    currentItemId = null;
    currentItemName = null;
};

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

const processBuy = async (itemId, itemName, pricePaid, market, isPromo) => {
    
    const itemNameNormalized = itemName.toLowerCase();
    await SHOPPING_LIST_COLLECTION.doc(itemId).delete();

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

window.markAsBought = (itemId, itemName) => openBuyModal(itemId, itemName);


// =================================================================
// 4. Lógica de Histórico e Checkboxes
// =================================================================

const getActiveShoppingList = async () => {
    const snapshot = await SHOPPING_LIST_COLLECTION.get();
    const activeItems = new Set();
    snapshot.forEach(doc => { activeItems.add(doc.data().nome); });
    return activeItems;
};

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

window.addFromHistory = addFromHistory;

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
// 5. Sincronização em Tempo Real (O Listener ÚNICO E REFORÇADO)
// =================================================================

const setupShoppingListListener = () => {
    
    // 💥 CHAVE DA CORREÇÃO 💥
    // Se a função de cancelamento já existe, chamamos ela para parar o listener antigo.
    if (unsubscribeShoppingList) {
        unsubscribeShoppingList();
        console.log("Listener antigo do Firestore cancelado com sucesso.");
    }
    
    // Criamos o novo listener e ARMAZENAMOS A FUNÇÃO DE CANCELAMENTO.
    unsubscribeShoppingList = SHOPPING_LIST_COLLECTION.orderBy('timestamp').onSnapshot(async (snapshot) => {
        
        // CORREÇÃO: Limpa a lista antes de reconstruir.
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

    }, (error) => {
        console.error("Erro no Listener principal do Firestore:", error);
        shoppingListUI.innerHTML = `<li style="color: red;">Erro ao carregar a lista de compras.</li>`;
    });
};

// =================================================================
// 6. Configuração dos Event Listeners Iniciais (Execução Final)
// =================================================================

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

// Inicia o Listener ÚNICO
setupShoppingListListener();
