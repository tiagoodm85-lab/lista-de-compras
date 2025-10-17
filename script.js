// script.js (O novo core da aplicação)

// 1. IMPORTAÇÕES - Traz tudo que o firebase.js exportou
import { 
    PRODUCTS_COLLECTION, SHOPPING_LIST_COLLECTION, MARKETS_COLLECTION,
    doc,
    onSnapshot, query, orderBy, where, limit, 
    addDoc, updateDoc, deleteDoc, serverTimestamp, getDocs
} from './firebase.js';

// =================================================================
// Variáveis e Referências de Elementos (SEM MUDANÇA)
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
let unsubscribeShoppingList = null; // Listener de cancelamento (Ainda necessário por segurança)

// =================================================================
// Funções de Ajuda (DOM Manipulation)
// =================================================================

const formatCurrency = (value) => value === Infinity ? 'N/A' : `R$ ${value.toFixed(2)}`;

const createListItem = (itemId, itemName, priceHint, marketHint, isPromo) => {
    const li = document.createElement('li');
    li.id = `item-${itemId}`; // Usado para remoção/modificação rápida
    li.className = 'shopping-item';
    
    const bestPriceHint = priceHint === Infinity 
        ? 'Novo item. Sem histórico de preço.'
        : `Melhor Preço: ${formatCurrency(priceHint)} em ${marketHint}${isPromo ? ' (PROMO)' : ''}`;

    const itemNameDisplay = itemName.charAt(0).toUpperCase() + itemName.slice(1);

    li.innerHTML = `
        <div class="item-info">
            <span class="item-name">${itemNameDisplay}</span>
            <span class="price-hint">${bestPriceHint}</span>
        </div>
        <button class="buy-button" onclick="window.markAsBought('${itemId}', '${itemName}')">Comprei!</button>
    `;
    return li;
};

// =================================================================
// 2. Lógica de Adicionar Item (COM DENORMALIZAÇÃO)
// =================================================================

const addItem = async () => {
    const itemName = itemNameInput.value.trim().toLowerCase();
    if (!itemName) return;

    itemNameInput.disabled = true;

    try {
        // 💥 Melhoria: Consulta de histórico ANTES de adicionar (Denormalização)
        const productQuery = await getDocs(query(PRODUCTS_COLLECTION, where('nome', '==', itemName), orderBy('nome'), limit(1)));
        
        let bestPrice = Infinity;
        let market = 'N/A';
        let isPromo = false;

        if (!productQuery.empty) {
            const productData = productQuery.docs[0].data();
            bestPrice = productData.melhorPreco || Infinity;
            market = productData.melhorMercado || 'N/A';
            isPromo = productData.emPromocao || false;
        }

        // 💥 Melhoria: Adiciona o melhor preço à lista atual (dados denormalizados)
        await addDoc(SHOPPING_LIST_COLLECTION, {
            nome: itemName,
            timestamp: serverTimestamp(),
            melhorPreco: bestPrice,
            melhorMercado: market,
            emPromocao: isPromo
        });

        itemNameInput.value = '';
    } catch (error) {
        console.error("Erro ao adicionar item:", error);
        alert("Erro ao adicionar item.");
    } finally {
        itemNameInput.disabled = false;
    }
};

// =================================================================
// 3. Funções de Modal e Compra (Lógica de Preço V9)
// =================================================================

const openBuyModal = async (itemId, itemName) => {
    currentItemId = itemId;
    currentItemName = itemName;
    modalItemName.textContent = `Registrar compra de: ${itemName.charAt(0).toUpperCase() + itemName.slice(1)}`;
    
    marketSelect.innerHTML = '<option value="" selected disabled hidden>Carregando mercados...</option>';
    marketSelect.disabled = true; // Desabilita enquanto carrega
    
    // Melhoria: Assincronia e uso de getDocs (v9)
    try {
        const marketsSnapshot = await getDocs(query(MARKETS_COLLECTION, orderBy('nome')));
        marketSelect.innerHTML = '<option value="" selected disabled hidden>Selecione um mercado</option>';
        marketsSnapshot.forEach(doc => {
            const option = document.createElement('option');
            option.value = doc.data().nome;
            option.textContent = doc.data().nome;
            marketSelect.appendChild(option);
        });
        marketSelect.disabled = false; // Habilita após carregar
    } catch (error) {
        console.error("Erro ao carregar mercados:", error);
        marketSelect.innerHTML = '<option value="" selected disabled hidden>Erro ao carregar mercados</option>';
    }
    
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

// 💥 Correção: A função deve ser ASYNC para usar await no processBuy
const confirmBuyHandler = async () => {
    const pricePaid = parseFloat(priceInput.value);
    const market = marketSelect.value;
    const isPromo = promoCheckbox.checked;

    if (isNaN(pricePaid) || pricePaid <= 0 || !market) {
        alert("Por favor, preencha todos os campos corretamente.");
        return;
    }
    
    // Desabilita o botão para evitar cliques duplicados
    confirmBuyButton.disabled = true;

    try {
        // Chama o processamento assíncrono
        await processBuy(currentItemId, currentItemName, pricePaid, market, isPromo);
        
        // Se deu certo, fecha a modal
        closeBuyModal();
    } catch (error) {
        console.error("Erro ao confirmar a compra:", error);
        alert("Ocorreu um erro ao registrar a compra. Verifique o console.");
    } finally {
        confirmBuyButton.disabled = false;
    }
};


const processBuy = async (itemId, itemName, pricePaid, market, isPromo) => {
    const itemNameNormalized = itemName.toLowerCase();

    // 💥 Melhoria: Deleta item da lista atual (v9)
    await deleteDoc(doc(SHOPPING_LIST_COLLECTION, itemId));

    // Busca o produto no histórico
    const productQuery = await getDocs(query(PRODUCTS_COLLECTION, where('nome', '==', itemNameNormalized), limit(1)));
    
    let productId;
    let bestPrice = Infinity;
    let melhorMercadoExistente = 'N/A';
    
    if (!productQuery.empty) {
        const docSnapshot = productQuery.docs[0];
        productId = docSnapshot.id;
        bestPrice = docSnapshot.data().melhorPreco || Infinity;
        melhorMercadoExistente = docSnapshot.data().melhorMercado;
    } else {
        // 💥 Melhoria: Cria o produto se não existir (v9)
        const newProductRef = await addDoc(PRODUCTS_COLLECTION, {
            nome: itemNameNormalized,
            melhorPreco: Infinity, 
            melhorMercado: '',
            emPromocao: false,
        });
        productId = newProductRef.id;
    }

    if (pricePaid < bestPrice) {
        // 💥 Melhoria: Atualiza o melhor preço no histórico (v9)
        await updateDoc(doc(PRODUCTS_COLLECTION, productId), {
            melhorPreco: pricePaid,
            melhorMercado: market,
            emPromocao: isPromo,
            ultimaAtualizacao: serverTimestamp()
        });
        alert(`NOVO RECORDE! O melhor preço de ${itemName.charAt(0).toUpperCase() + itemName.slice(1)} agora é ${formatCurrency(pricePaid)} em ${market}.`);
    } else {
        const precoExistente = bestPrice === Infinity ? 'N/A' : formatCurrency(bestPrice);
        alert(`Compra registrada, mas o melhor preço continua sendo ${precoExistente} em ${melhorMercadoExistente}.`);
    }
};

window.markAsBought = (itemId, itemName) => openBuyModal(itemId, itemName);

// =================================================================
// 4. Lógica de Histórico e Checkboxes (V9)
// =================================================================

// (O resto das funções de histórico e checkbox permanecem idênticas, 
// apenas com a sintaxe V9 aplicada internamente)

const getActiveShoppingList = async () => {
    const snapshot = await getDocs(SHOPPING_LIST_COLLECTION);
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
            // Consulta de histórico para denormalizar (igual ao addItem)
            const productQuery = await getDocs(query(PRODUCTS_COLLECTION, where('nome', '==', itemName), limit(1)));
            
            let bestPrice = Infinity;
            let market = 'N/A';
            let isPromo = false;

            if (!productQuery.empty) {
                const productData = productQuery.docs[0].data();
                bestPrice = productData.melhorPreco || Infinity;
                market = productData.melhorMercado || 'N/A';
                isPromo = productData.emPromocao || false;
            }

            // 💥 Melhoria: Adiciona item denormalizado (V9)
            await addDoc(SHOPPING_LIST_COLLECTION, {
                nome: itemName,
                timestamp: serverTimestamp(),
                melhorPreco: bestPrice,
                melhorMercado: market,
                emPromocao: isPromo
            });

        } catch (error) {
            console.error("Erro ao adicionar item do histórico:", error);
            alert("Erro ao adicionar item.");
        } finally {
            checkbox.checked = false;
            checkbox.disabled = false;
        }
    }
};

window.addFromHistory = addFromHistory;

const loadProductHistory = async () => {
    try {
        // (V9)
        const productSnapshot = await getDocs(query(PRODUCTS_COLLECTION, orderBy('nome')));
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
// 5. Sincronização em Tempo Real (COM DOCCHANGES)
// =================================================================

const setupShoppingListListener = () => {
    
    if (unsubscribeShoppingList) {
        unsubscribeShoppingList();
    }
    
    // 💥 Melhoria: Cria o listener com query (V9)
    const listQuery = query(SHOPPING_LIST_COLLECTION, orderBy('timestamp'));

    // 💥 Melhoria: Usando docChanges() para manipulação cirúrgica do DOM
    unsubscribeShoppingList = onSnapshot(listQuery, (snapshot) => {
        
        snapshot.docChanges().forEach((change) => {
            const item = change.doc.data();
            const itemId = change.doc.id;

            const priceHint = item.melhorPreco || Infinity;
            const marketHint = item.melhorMercado || 'N/A';
            const isPromo = item.emPromocao || false;

            if (change.type === 'added') {
                const li = createListItem(itemId, item.nome, priceHint, marketHint, isPromo);
                shoppingListUI.appendChild(li);
            }
            if (change.type === 'modified') {
                // Apenas modifica a dica de preço se os dados denormalizados mudaram
                const existingLi = document.getElementById(`item-${itemId}`);
                if (existingLi) {
                    const bestPriceHintText = priceHint === Infinity 
                        ? 'Novo item. Sem histórico de preço.'
                        : `Melhor Preço: ${formatCurrency(priceHint)} em ${marketHint}${isPromo ? ' (PROMO)' : ''}`;
                    existingLi.querySelector('.price-hint').textContent = bestPriceHintText;
                }
            }
            if (change.type === 'removed') {
                const existingLi = document.getElementById(`item-${itemId}`);
                if (existingLi) {
                    existingLi.remove();
                }
            }
        });
        
        // Recarregar o histórico é mais seguro fora do docChanges loop
        loadProductHistory(); 

    }, (error) => {
        console.error("Erro no Listener principal do Firestore:", error);
        shoppingListUI.innerHTML = `<li style="color: red;">Erro ao carregar a lista de compras.</li>`;
    });
};

// =================================================================
// 6. Configuração dos Event Listeners Iniciais (Execução Final)
// =================================================================

// Garantia anti-duplicação (Ainda mantida, mesmo com módulos, por segurança extrema)
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

    setupShoppingListListener();
    window.isShoppingListInitialized = true;
    
} else {
    console.warn("Inicialização de listeners bloqueada.");
}
