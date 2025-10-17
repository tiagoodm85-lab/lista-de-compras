// script.js (O novo core da aplicação com a correção de mercado e duplicação)

// 1. IMPORTAÇÕES - Traz tudo que o firebase.js exportou
import { 
    PRODUCTS_COLLECTION, SHOPPING_LIST_COLLECTION, MARKETS_COLLECTION,
    doc, 
    onSnapshot, query, orderBy, where, limit, 
    addDoc, updateDoc, deleteDoc, serverTimestamp, getDocs
} from './firebase.js';

// =================================================================
// Variáveis e Referências de Elementos (DOM)
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
// Funções de Ajuda (DOM Manipulation)
// =================================================================

// Função de ajude para criar o item da lista
const createShoppingItemUI = (itemId, item, bestPriceHint) => {
    const itemNameDisplay = item.nome.charAt(0).toUpperCase() + item.nome.slice(1);

    const li = document.createElement('li');
    li.id = `item-${itemId}`; // Define um ID único
    li.className = 'shopping-item';
    li.innerHTML = `
        <div class="item-info">
            <span class="item-name">${itemNameDisplay}</span>
            <span class="price-hint">${bestPriceHint}</span>
        </div>
        <button class="buy-button" onclick="markAsBought('${itemId}', '${item.nome}')">Comprei!</button>
        <button class="delete-button" onclick="deleteItem('${itemId}')">X</button>
    `;
    
    // Adicionar um delay de 0ms para garantir que o elemento exista antes de ser inserido
    setTimeout(() => {
        shoppingListUI.appendChild(li);
    }, 0);
};

// =================================================================
// Lógica de Adicionar/Deletar Item
// =================================================================

// FUNÇÃO MODIFICADA: Adiciona item apenas se não estiver na lista atual
const addItem = async () => {
    const itemName = itemNameInput.value.trim();
    if (!itemName) return;

    const itemNameNormalized = itemName.toLowerCase();

    try {
        // 1. VERIFICAÇÃO DE DUPLICAÇÃO (A CHAVE DA CORREÇÃO)
        const checkQuery = query(SHOPPING_LIST_COLLECTION, where('nome', '==', itemNameNormalized), limit(1));
        const existingSnapshot = await getDocs(checkQuery);

        if (!existingSnapshot.empty) {
            alert(`O item "${itemName.charAt(0).toUpperCase() + itemName.slice(1)}" já está na sua lista de compras!`);
            itemNameInput.value = '';
            return; 
        }

        // 2. SE NÃO EXISTE, ADICIONA
        await addDoc(SHOPPING_LIST_COLLECTION, {
            nome: itemNameNormalized,
            timestamp: serverTimestamp(),
        });
        
        itemNameInput.value = '';

    } catch (error) {
        console.error("Erro ao adicionar item:", error);
    }
};

const deleteItem = async (itemId) => {
    // CORREÇÃO: Usa doc() para obter a referência do documento
    await deleteDoc(doc(SHOPPING_LIST_COLLECTION, itemId));
};

// =================================================================
// Lógica de Histórico de Produtos (Itens Comprados)
// =================================================================

const getActiveShoppingList = async () => {
    // Esta função agora é crucial: busca todos os nomes na lista atual
    const snapshot = await getDocs(SHOPPING_LIST_COLLECTION);
    const activeItems = new Set();
    snapshot.forEach(doc => {
        activeItems.add(doc.data().nome);
    });
    return activeItems;
};


const addFromHistory = async (event, productName) => {
    const checkbox = event.target;
    // Evita o disparo duplo de evento
    if (checkbox.checked) { 
        checkbox.disabled = true;
        try {
            // Não é necessário checar aqui, pois o checkbox já deveria estar disabled 
            // se o item estivesse ativo, mas manteremos o fluxo.
            await addDoc(SHOPPING_LIST_COLLECTION, {
                nome: productName,
                timestamp: serverTimestamp(),
            });
            // O listener principal irá atualizar a lista e desabilitar o checkbox via loadProductHistory()
        } catch (error) {
            console.error("Erro ao adicionar do histórico:", error);
            alert("Erro ao adicionar item do histórico.");
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
        const productQuery = query(PRODUCTS_COLLECTION, orderBy('nome'));
        const productSnapshot = await getDocs(productQuery);
        // Obtém o conjunto de nomes de itens ativos
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
            
            // O checkbox é desabilitado *somente* se o item estiver ativo (já na lista)
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
// Lógica de Modal e Compra (Mercado) - Mantida da correção anterior
// =================================================================

const registerNewMarket = async () => {
    const newMarketName = prompt("Digite o nome do novo mercado:");
    if (newMarketName && newMarketName.trim() !== "") {
        const marketNameNormalized = newMarketName.trim().toLowerCase();
        try {
            await addDoc(MARKETS_COLLECTION, { 
                nome: marketNameNormalized 
            });
            alert(`Mercado "${newMarketName.trim()}" cadastrado com sucesso!`);
            return marketNameNormalized; 
        } catch (error) {
            console.error("Erro ao registrar novo mercado:", error);
            alert("Erro ao tentar cadastrar o mercado. Verifique o console.");
        }
    }
    return null;
};


const openBuyModal = async (itemId, itemName) => {
    currentItemId = itemId;
    currentItemName = itemName;
    modalItemName.textContent = `Registrar compra de: ${itemName.charAt(0).toUpperCase() + itemName.slice(1)}`;
    
    marketSelect.innerHTML = '<option value="" selected disabled hidden>Carregando mercados...</option>';
    marketSelect.disabled = true;

    priceInput.value = '';
    promoCheckbox.checked = false;
    
    try {
        const marketsQuery = query(MARKETS_COLLECTION, orderBy('nome'));
        const marketsSnapshot = await getDocs(marketsQuery);
        
        marketSelect.innerHTML = '<option value="" selected disabled hidden>Selecione um mercado</option>';
        
        const newOption = document.createElement('option');
        newOption.value = 'NEW_MARKET';
        newOption.textContent = '➡️ Novo Mercado...';
        marketSelect.appendChild(newOption);

        marketsSnapshot.forEach(doc => {
            const marketData = doc.data();
            const option = document.createElement('option');
            option.value = marketData.nome;
            option.textContent = marketData.nome.charAt(0).toUpperCase() + marketData.nome.slice(1);
            marketSelect.appendChild(option);
        });
        
        marketSelect.disabled = false;
    } catch (error) {
        console.error("Erro ao carregar mercados:", error);
        marketSelect.innerHTML = `<option value="" selected disabled hidden>Erro: Não foi possível carregar os mercados.</option>`;
    }
    
    buyModal.style.display = 'block';
};

const closeBuyModal = () => {
    buyModal.style.display = 'none';
    currentItemId = null;
    currentItemName = null;
    priceInput.value = '';
    promoCheckbox.checked = false;
};


const confirmBuyHandler = async () => {
    let market = marketSelect.value;
    const pricePaid = parseFloat(priceInput.value);
    const isPromo = promoCheckbox.checked;

    if (market === 'NEW_MARKET') {
        const registeredMarket = await registerNewMarket();
        if (registeredMarket) {
            market = registeredMarket;
            marketSelect.value = market;
        } else {
            alert("Cadastro de mercado cancelado. Selecione um mercado ou tente cadastrar novamente.");
            return; 
        }
    }
    
    if (isNaN(pricePaid) || pricePaid <= 0 || !market || market === '') {
        alert("Por favor, preencha todos os campos (Preço e Mercado) corretamente.");
        return;
    }
    
    confirmBuyButton.disabled = true;

    try {
        await processBuy(currentItemId, currentItemName, pricePaid, market, isPromo);
        closeBuyModal();
    } catch (error) {
        console.error("ERRO CRÍTICO ao confirmar a compra:", error);
        alert("Ocorreu um erro ao registrar a compra. Verifique o console do navegador (F12) para detalhes.");
    } finally {
        confirmBuyButton.disabled = false;
    }
};

const processBuy = async (itemId, itemName, pricePaid, market, isPromo) => {
    await deleteDoc(doc(SHOPPING_LIST_COLLECTION, itemId));
    
    const itemNameNormalized = itemName.toLowerCase();
    const marketNormalized = market.toLowerCase();
    
    const productQueryRef = query(PRODUCTS_COLLECTION, where('nome', '==', itemNameNormalized), limit(1));
    const productSnapshot = await getDocs(productQueryRef);
    
    const newPriceData = {
        nome: itemNameNormalized,
        ultimaCompra: serverTimestamp(),
        melhorPreco: pricePaid, 
        melhorMercado: marketNormalized,
        emPromocao: isPromo
    };

    if (productSnapshot.empty) {
        await addDoc(PRODUCTS_COLLECTION, newPriceData);
    } else {
        const productId = productSnapshot.docs[0].id;
        const currentBestPrice = productSnapshot.docs[0].data().melhorPreco || Infinity;
        
        const updateData = { ultimaCompra: newPriceData.ultimaCompra };
        
        if (pricePaid <= currentBestPrice) {
            updateData.melhorPreco = pricePaid;
            updateData.melhorMercado = marketNormalized;
            updateData.emPromocao = isPromo;
        }
        
        await updateDoc(doc(PRODUCTS_COLLECTION, productId), updateData);
    }
};

// =================================================================
// Listener Principal (Monitora a Lista em Tempo Real)
// =================================================================

const setupShoppingListListener = () => {
    if (unsubscribeShoppingList) {
        unsubscribeShoppingList();
    }

    const q = query(SHOPPING_LIST_COLLECTION, orderBy('timestamp', 'desc'));

    unsubscribeShoppingList = onSnapshot(q, async (snapshot) => {
        
        snapshot.docChanges().forEach(async (change) => {
            const item = change.doc.data();
            const itemId = change.doc.id;
            const itemNameDisplay = item.nome.charAt(0).toUpperCase() + item.nome.slice(1);
            
            if (change.type === 'added' || change.type === 'modified') {
                const productQueryRef = query(PRODUCTS_COLLECTION, where('nome', '==', item.nome), limit(1));
                const productQuery = await getDocs(productQueryRef);

                let bestPriceHint = 'Novo item. Sem histórico de preço.';

                if (!productQuery.empty) {
                    const productData = productQuery.docs[0].data();
                    if (productData.melhorPreco && productData.melhorPreco !== Infinity) {
                        const promo = productData.emPromocao ? ' (PROMO)' : '';
                        const marketDisplay = productData.melhorMercado.charAt(0).toUpperCase() + productData.melhorMercado.slice(1);
                        bestPriceHint = `Melhor Preço: R$ ${productData.melhorPreco.toFixed(2)} em ${marketDisplay}${promo}`;
                    }
                }
                
                const existingLi = document.getElementById(`item-${itemId}`);

                if (existingLi) {
                    existingLi.querySelector('.item-name').textContent = itemNameDisplay;
                    existingLi.querySelector('.price-hint').textContent = bestPriceHint;
                    existingLi.querySelector('.buy-button').setAttribute('onclick', `markAsBought('${itemId}', '${item.nome}')`);
                    existingLi.querySelector('.delete-button').setAttribute('onclick', `deleteItem('${itemId}')`);
                } else {
                    createShoppingItemUI(itemId, item, bestPriceHint);
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

// Exporta a função para uso no botão "Comprei!"
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

    setupShoppingListListener();
    window.isShoppingListInitialized = true;
    
} else {
    console.warn("Inicialização de listeners bloqueada.");
}
