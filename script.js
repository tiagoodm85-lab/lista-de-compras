// =================================================================
// Variáveis e Referências
// =================================================================

// Referências às coleções no Firestore
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

// Variáveis de estado
let currentItemId = null;
let currentItemName = null;
let isListenerActive = false; // Variável de controle para o listener

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
// Lógica da Janela Modal
// =================================================================

// Função para abrir a modal de compra
const openBuyModal = async (itemId, itemName) => {
    currentItemId = itemId;
    currentItemName = itemName;
    modalItemName.textContent = `Registrar compra de: ${itemName.charAt(0).toUpperCase() + itemName.slice(1)}`;
    
    // Popula a lista de mercados dinamicamente
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

// Função para fechar a modal
const closeBuyModal = () => {
    buyModal.style.display = 'none';
    // Limpa os campos após o fechamento
    priceInput.value = '';
    marketSelect.value = ''; 
    promoCheckbox.checked = false;
    currentItemId = null;
    currentItemName = null;
};

// Evento de "Comprei!" na lista
window.markAsBought = (itemId, itemName) => openBuyModal(itemId, itemName);


// =================================================================
// Lógica de Registro de Compra e Comparação de Preços
// =================================================================

const processBuy = async (itemId, itemName, pricePaid, market, isPromo) => {
    
    const itemNameNormalized = itemName.toLowerCase();

    // 1. Remove o item da Lista de Compras Atual
    await SHOPPING_LIST_COLLECTION.doc(itemId).delete();

    // 2. Busca/Cria o produto mestre para comparação
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
        // Usa o melhor mercado existente se não for um novo recorde
        const melhorMercadoExistente = productQuery.empty ? 'N/A' : productQuery.docs[0].data().melhorMercado;
        const precoExistente = bestPrice === Infinity ? 'N/A' : bestPrice.toFixed(2);
        alert(`Compra registrada, mas o melhor preço continua sendo R$ ${precoExistente} em ${melhorMercadoExistente}.`);
    }
};

// Nova lógica de "Comprei!" (Confirmação na modal)
confirmBuyButton.addEventListener('click', async () => {
    const pricePaid = parseFloat(priceInput.value);
    const market = marketSelect.value;
    const isPromo = promoCheckbox.checked;

    if (isNaN(pricePaid) || pricePaid <= 0 || !market) {
        alert("Por favor, preencha todos os campos corretamente.");
        return;
    }
    
    await processBuy(currentItemId, currentItemName, pricePaid, market, isPromo);
    
    closeBuyModal();
});

// Eventos de fechar a modal
closeButton.addEventListener('click', closeBuyModal);
window.addEventListener('click', (event) => {
    if (event.target === buyModal) {
        closeBuyModal();
    }
});


// =================================================================
// Lógica de Reutilização de Itens Comprados (Checkboxes)
// =================================================================

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
            // O listener irá remover o item da tela, mas desmarcamos por segurança
            checkbox.checked = false;
        }
    }
    // Não precisa de 'else', o listener cuida da re-renderização
};

const loadProductHistory = async () => {
    try {
        const productSnapshot = await PRODUCTS_COLLECTION.orderBy('nome').get();
        const activeItems = await getActiveShoppingList(); 
        
        productHistoryUI.innerHTML = ''; // Limpa a área do histórico
        
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
// Lógica de Sincronização em Tempo Real (O Real-Time Listener)
// =================================================================

// CORREÇÃO DEFINITIVA: Garante que o listener seja configurado apenas uma vez.
if (!isListenerActive) {
    SHOPPING_LIST_COLLECTION.orderBy('timestamp').onSnapshot(async (snapshot) => {
        
        shoppingListUI.innerHTML = ''; // Limpa a lista antes de reconstruir (Anti-Duplicação)
        
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
        
        // Recarrega o histórico de produtos (para habilitar/desabilitar checkboxes)
        loadProductHistory(); 
    }, (error) => {
        console.error("Erro no Listener principal do Firestore:", error);
        shoppingListUI.innerHTML = `<li style="color: red;">Erro ao carregar a lista de compras.</li>`;
    });

    isListenerActive = true;
}
