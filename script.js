// script.js (O novo core da aplicação com a correção de mercado)

// 1. IMPORTAÇÕES - Traz tudo que o firebase.js exportou
import { 
    PRODUCTS_COLLECTION, SHOPPING_LIST_COLLECTION, MARKETS_COLLECTION,
    doc, // Necessário para a função processBuy
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
    // e evitar problemas de ordem de renderização
    setTimeout(() => {
        shoppingListUI.appendChild(li);
    }, 0);
};

// =================================================================
// Lógica de Adicionar/Deletar Item
// =================================================================

const addItem = async () => {
    const itemName = itemNameInput.value.trim();
    if (!itemName) return;

    try {
        await addDoc(SHOPPING_LIST_COLLECTION, {
            nome: itemName.toLowerCase(),
            timestamp: serverTimestamp(), // Use o serverTimestamp correto
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
// Lógica de Modal e Compra (CORREÇÃO DE MERCADO)
// =================================================================

// FUNÇÃO NOVA: Cadastra um novo mercado
const registerNewMarket = async () => {
    // Usa prompt() para obter o nome do novo mercado
    const newMarketName = prompt("Digite o nome do novo mercado:");
    if (newMarketName && newMarketName.trim() !== "") {
        const marketNameNormalized = newMarketName.trim().toLowerCase();
        try {
            // Adiciona o novo mercado à coleção 'mercados'
            await addDoc(MARKETS_COLLECTION, { 
                nome: marketNameNormalized 
            });
            alert(`Mercado "${newMarketName.trim()}" cadastrado com sucesso!`);
            // Retorna o nome normalizado para uso imediato na compra
            return marketNameNormalized; 
        } catch (error) {
            console.error("Erro ao registrar novo mercado:", error);
            alert("Erro ao tentar cadastrar o mercado. Verifique o console.");
        }
    }
    return null; // Retorna null se for cancelado ou vazio
};


// FUNÇÃO MODIFICADA: Abre a modal e carrega os mercados
const openBuyModal = async (itemId, itemName) => {
    currentItemId = itemId;
    currentItemName = itemName;
    modalItemName.textContent = `Registrar compra de: ${itemName.charAt(0).toUpperCase() + itemName.slice(1)}`;
    
    // Mostra um estado de carregamento
    marketSelect.innerHTML = '<option value="" selected disabled hidden>Carregando mercados...</option>';
    marketSelect.disabled = true;

    priceInput.value = '';
    promoCheckbox.checked = false; // Garante que o checkbox de promoção está desmarcado
    
    try {
        // Busca os mercados ordenados por nome
        const marketsQuery = query(MARKETS_COLLECTION, orderBy('nome'));
        const marketsSnapshot = await getDocs(marketsQuery);
        
        // Limpa e Adiciona a opção padrão
        marketSelect.innerHTML = '<option value="" selected disabled hidden>Selecione um mercado</option>';
        
        // 1. Adiciona a opção de Novo Mercado (CHAVE DA CORREÇÃO)
        const newOption = document.createElement('option');
        newOption.value = 'NEW_MARKET'; // Valor único para identificação no handler
        newOption.textContent = '➡️ Novo Mercado...';
        marketSelect.appendChild(newOption);

        // 2. Adiciona os mercados existentes
        marketsSnapshot.forEach(doc => {
            const marketData = doc.data();
            const option = document.createElement('option');
            option.value = marketData.nome;
            // Capitaliza o nome para exibição
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
    // O select será recarregado na próxima abertura
};


// FUNÇÃO MODIFICADA: Processa o clique em Confirmar
const confirmBuyHandler = async () => {
    let market = marketSelect.value;
    const pricePaid = parseFloat(priceInput.value);
    const isPromo = promoCheckbox.checked;

    // NOVO: Checa se a opção de Novo Mercado foi selecionada
    if (market === 'NEW_MARKET') {
        // Tenta registrar e obter o nome do novo mercado
        const registeredMarket = await registerNewMarket();
        if (registeredMarket) {
            market = registeredMarket; // Usa o nome do mercado recém-cadastrado
            // Atualiza o select com o novo mercado selecionado para dar feedback imediato
            marketSelect.value = market;
        } else {
            // Se o usuário cancelou o cadastro (clicou em cancelar no prompt ou deixou vazio)
            alert("Cadastro de mercado cancelado. Selecione um mercado ou tente cadastrar novamente.");
            return; 
        }
    }
    
    // Validação final de campos
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
    // 1. Deleta o item da lista de compras atual
    // CORREÇÃO: Usa doc()
    await deleteDoc(doc(SHOPPING_LIST_COLLECTION, itemId));
    
    // 2. Normaliza o nome do item e do mercado
    const itemNameNormalized = itemName.toLowerCase();
    const marketNormalized = market.toLowerCase();
    
    // 3. Verifica se o produto existe no histórico (coleção 'produtos')
    const productQueryRef = query(PRODUCTS_COLLECTION, where('nome', '==', itemNameNormalized), limit(1));
    const productSnapshot = await getDocs(productQueryRef);
    
    const newPriceData = {
        nome: itemNameNormalized,
        ultimaCompra: serverTimestamp(),
        // Define o preço como o melhor preço no primeiro registro
        melhorPreco: pricePaid, 
        melhorMercado: marketNormalized,
        emPromocao: isPromo
    };

    if (productSnapshot.empty) {
        // A. PRODUTO NOVO: Adiciona
        await addDoc(PRODUCTS_COLLECTION, newPriceData);
    } else {
        // B. PRODUTO EXISTENTE: Atualiza
        const productId = productSnapshot.docs[0].id;
        const currentBestPrice = productSnapshot.docs[0].data().melhorPreco || Infinity;
        
        // Cria o objeto de atualização
        const updateData = { ultimaCompra: newPriceData.ultimaCompra };
        
        // Compara e atualiza se for um preço melhor (ou igual, mantendo o mesmo mercado)
        if (pricePaid <= currentBestPrice) {
            updateData.melhorPreco = pricePaid;
            updateData.melhorMercado = marketNormalized;
            updateData.emPromocao = isPromo;
        }
        
        // CORREÇÃO: Usa doc()
        await updateDoc(doc(PRODUCTS_COLLECTION, productId), updateData);
    }
};

// =================================================================
// Listener Principal (Monitora a Lista em Tempo Real)
// =================================================================

const setupShoppingListListener = () => {
    // Se já houver um listener ativo, cancela-o
    if (unsubscribeShoppingList) {
        unsubscribeShoppingList();
    }

    // Ordena por timestamp para manter a ordem de inserção
    const q = query(SHOPPING_LIST_COLLECTION, orderBy('timestamp', 'desc'));

    // Inicia o listener em tempo real
    unsubscribeShoppingList = onSnapshot(q, async (snapshot) => {
        
        // Remove todos os itens que não serão atualizados/inseridos para evitar duplicação
        // Se a mudança for 'added', ele recriará o item. Se for 'removed', a lógica do docChanges já lida.
        // O método 'docChanges' é mais eficiente.
        
        snapshot.docChanges().forEach(async (change) => {
            const item = change.doc.data();
            const itemId = change.doc.id;
            const itemNameDisplay = item.nome.charAt(0).toUpperCase() + item.nome.slice(1);
            
            if (change.type === 'added' || change.type === 'modified') {
                // 1. Encontra o melhor preço no histórico (Coleção 'produtos')
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
                    // Atualiza o item existente
                    existingLi.querySelector('.item-name').textContent = itemNameDisplay;
                    existingLi.querySelector('.price-hint').textContent = bestPriceHint;
                    // O botão de compra pode precisar ser redefinido se o nome do item for a única coisa que muda
                    existingLi.querySelector('.buy-button').setAttribute('onclick', `markAsBought('${itemId}', '${item.nome}')`);
                    existingLi.querySelector('.delete-button').setAttribute('onclick', `deleteItem('${itemId}')`);
                } else {
                    // Adiciona um novo item
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
