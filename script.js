// script.js (O novo core da aplicação com correção de importações)

// 1. IMPORTAÇÕES - Traz tudo que o firebase.js exportou
import {
    PRODUCTS_COLLECTION, SHOPPING_LIST_COLLECTION, MARKETS_COLLECTION,
    doc, onSnapshot, query, orderBy, where, limit,
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

// Função para fechar o modal
const closeBuyModal = () => {
    buyModal.style.display = 'none';
    currentItemId = null;
    currentItemName = null;
    priceInput.value = '';
    marketSelect.value = '';
    promoCheckbox.checked = false;
};

// Função para abrir o modal de compra (chamada pelo botão 'Comprei!' no HTML)
const openBuyModal = async (itemId, itemName) => {
    currentItemId = itemId;
    currentItemName = itemName;
    modalItemName.textContent = `Registrar compra de: ${itemName.charAt(0).toUpperCase() + itemName.slice(1)}`;

    // Carregar os mercados dinamicamente
    await loadMarketsToSelect();

    // Tenta obter o último preço (opcional, se houver lógica de cache ou histórico)
    priceInput.value = '';
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

// Função auxiliar para obter itens ativos (em um Set para checagem rápida)
const getActiveShoppingList = async () => {
    const q = query(SHOPPING_LIST_COLLECTION);
    const snapshot = await getDocs(q);
    const activeItems = new Set();
    snapshot.forEach(doc => {
        activeItems.add(doc.data().nome);
    });
    return activeItems;
};


// =================================================================
// Lógica de Adicionar Item
// =================================================================

const addItem = async () => {
    const itemName = itemNameInput.value.trim();
    if (!itemName) return;

    // Adiciona o item à Lista de Compras Atual
    try {
        await addDoc(SHOPPING_LIST_COLLECTION, {
            nome: itemName.toLowerCase(),
            timestamp: serverTimestamp(),
        });
        itemNameInput.value = '';
    } catch (error) {
        console.error("Erro ao adicionar item:", error);
    }
};

// Função para adicionar item do histórico (chamada pelo HTML do histórico)
const addFromHistory = async (event, productName) => {
    const checkbox = event.target;

    // Impede múltiplas adições e desabilita o checkbox imediatamente
    checkbox.disabled = true;

    if (checkbox.checked) {
        try {
            await addDoc(SHOPPING_LIST_COLLECTION, {
                nome: productName,
                timestamp: serverTimestamp(),
            });
            // O loadProductHistory() será chamado pelo listener principal,
            // que irá garantir que o checkbox tenha a classe 'disabled-tag'.
        } catch (error) {
            console.error("Erro ao adicionar do histórico:", error);
            // Em caso de erro, reabilita o checkbox
            checkbox.disabled = false;
            checkbox.checked = false;
        }
        // O caso de 'não checado' não precisa de lógica, pois só adicionamos.
    } else {
        // Se desmarcar antes da atualização do listener, reabilita.
        checkbox.disabled = false;
    }
};

// =================================================================
// Lógica de Registro de Compra (Modal Handler)
// =================================================================

const loadMarketsToSelect = async () => {
    marketSelect.innerHTML = '<option value="">Selecione o Mercado</option>';
    try {
        const q = query(MARKETS_COLLECTION, orderBy('nome'));
        const marketSnapshot = await getDocs(q);

        marketSnapshot.forEach((doc) => {
            const market = doc.data();
            const option = document.createElement('option');
            option.value = market.nome;
            option.textContent = market.nome;
            marketSelect.appendChild(option);
        });
    } catch (error) {
        console.error("Erro ao carregar mercados:", error);
    }
};


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
        // 1. Atualizar ou Criar o Registro do Produto
        const itemRefQuery = query(PRODUCTS_COLLECTION, where('nome', '==', currentItemName), limit(1));
        const itemSnapshot = await getDocs(itemRefQuery);

        let productDocRef;
        let isNewProduct = itemSnapshot.empty;
        
        // Objeto para conter os campos que serão atualizados
        const updateFields = {
            ultimaCompra: serverTimestamp()
        };

        if (isNewProduct) {
            // Se for um novo produto no histórico
            const productData = {
                nome: currentItemName,
                // Define o preço de acordo com a promoção/regular
                melhorPrecoPromo: isPromo ? pricePaid : null,
                melhorMercadoPromo: isPromo ? marketName : null,
                melhorPrecoRegular: !isPromo ? pricePaid : null,
                melhorMercadoRegular: !isPromo ? marketName : null,
                ultimaCompra: serverTimestamp()
            };
            const newDoc = await addDoc(PRODUCTS_COLLECTION, productData);
            productDocRef = newDoc;

        } else {
            // Produto existente, verifica se é o melhor preço (promo e regular)
            const existingDoc = itemSnapshot.docs[0];
            productDocRef = doc(PRODUCTS_COLLECTION, existingDoc.id);
            const productData = existingDoc.data();
            
            // LÓGICA DE ATUALIZAÇÃO PARA PROMOÇÃO
            // Inicializa com Infinity se o campo for nulo/undefined, garantindo que o primeiro preço seja salvo
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

            // Atualiza o documento com os campos alterados
            await updateDoc(productDocRef, updateFields);
        }
        
        // 2. Apagar o Item da Lista de Compras Atual
        if (currentItemId) {
            const shoppingItemRef = doc(SHOPPING_LIST_COLLECTION, currentItemId);
            await deleteDoc(shoppingItemRef);
        }

        closeBuyModal(); // Fecha o modal após o sucesso
    } catch (error) {
        console.error("Erro ao registrar compra:", error);
        alert("Não foi possível registrar a compra. Verifique sua conexão.");
    }
};

// =================================================================
// Lógica do Histórico de Produtos (Itens Comprados)
// =================================================================

const loadProductHistory = async () => {
    try {
        const q = query(PRODUCTS_COLLECTION, orderBy('nome'));
        const productSnapshot = await getDocs(q);
        const activeItems = await getActiveShoppingList(); // Busca itens ativos

        productHistoryUI.innerHTML = '';

        productSnapshot.forEach((doc) => {
            const product = doc.data();
            const productName = product.nome;

            // Checagem se o item está ativo na lista atual
            const isItemActive = activeItems.has(productName);

            const tag = document.createElement('label');
            tag.className = 'product-tag';

            // Adiciona a classe 'disabled' se o item estiver ativo
            if (isItemActive) {
                tag.classList.add('disabled-tag');
            }

            // Formata o nome para exibição
            const displayName = productName.charAt(0).toUpperCase() + productName.slice(1);

            // O checkbox é desabilitado no HTML se estiver ativo
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
// Listener Principal (Lista de Compras Atual)
// =================================================================

const setupShoppingListListener = () => {
    if (unsubscribeShoppingList) {
        unsubscribeShoppingList(); // Cancela o listener antigo se existir
    }

    const q = query(SHOPPING_LIST_COLLECTION, orderBy('timestamp', 'desc'));

    // Cria o novo listener e armazena a função de cancelamento
    unsubscribeShoppingList = onSnapshot(q, async (snapshot) => {

        // Limpa a lista apenas para a primeira carga ou se for uma mudança total
        if (snapshot.docChanges().length === snapshot.docs.length && snapshot.docChanges().every(change => change.type === 'added')) {
             shoppingListUI.innerHTML = '';
        }

        // Processa as mudanças no snapshot
        snapshot.docChanges().forEach(async (change) => {
            const itemId = change.doc.id;
            const item = change.doc.data();
            const itemNameDisplay = item.nome.charAt(0).toUpperCase() + item.nome.slice(1);

            if (change.type === 'added' || change.type === 'modified') {
                let existingLi = document.getElementById(`item-${itemId}`);

                // 1. Sugestão de Preço (Best Price Hint)
                const itemNameNormalized = item.nome;
                const productQuery = query(PRODUCTS_COLLECTION, where('nome', '==', itemNameNormalized), limit(1));
                const productSnapshot = await getDocs(productQuery);

                let priceHints = [];

                if (!productSnapshot.empty) {
                    const productData = productSnapshot.docs[0].data();

                    // Melhor Preço Regular
                    const regularPrice = productData.melhorPrecoRegular;
                    const regularMarket = productData.melhorMercadoRegular;
                    if (regularPrice !== undefined && regularPrice !== null && regularPrice !== Infinity) {
                        priceHints.push(`Regular: R$ ${regularPrice.toFixed(2)} (${regularMarket})`);
                    }

                    // Melhor Preço Promoção
                    const promoPrice = productData.melhorPrecoPromo;
                    const promoMarket = productData.melhorMercadoPromo;
                    if (promoPrice !== undefined && promoPrice !== null && promoPrice !== Infinity) {
                        priceHints.push(`Promoção: R$ ${promoPrice.toFixed(2)} (${promoMarket})`);
                    }
                }

                // Formata o texto de dica de preço
                let bestPriceHint = priceHints.length > 0 ?
                                    priceHints.join(' | ') : // <-- ESTA LINHA VAI MUDAR
                                    'Novo item. Sem histórico de preço.';
                
                // 2. Renderização ou Atualização do Item
                const newLiHtml = `
                    <div class="item-info">
                        <span class="item-name">${itemNameDisplay}</span>
                        <span class="price-hint">${bestPriceHint}</span>
                    </div>
                    <button class="delete-button" onclick="deleteItem('${itemId}')">X</button>
                    <button class="buy-button" onclick="markAsBought('${itemId}', '${item.nome}')">Comprei!</button>
                `;

                if (change.type === 'added') {
                    const li = document.createElement('li');
                    li.id = `item-${itemId}`;
                    li.className = 'shopping-item';
                    li.innerHTML = newLiHtml;

                    // Inserção no topo da lista (por causa do orderBy('desc'))
                    if (shoppingListUI.firstChild) {
                        shoppingListUI.insertBefore(li, shoppingListUI.firstChild);
                    } else {
                        shoppingListUI.appendChild(li);
                    }
                } else if (change.type === 'modified' && existingLi) {
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

// Exporta as funções para serem acessíveis pelos eventos 'onclick' no HTML globalmente
window.markAsBought = openBuyModal;
window.deleteItem = deleteItem;
window.addFromHistory = addFromHistory;

// Adiciona um flag global para evitar duplicação de listeners em ambientes de desenvolvimento
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
    console.warn("Inicialização de listeners bloqueada. (Usando um módulo ES6)");
}
