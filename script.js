// Referências às coleções no Firestore
const PRODUCTS_COLLECTION = db.collection('produtos');
const SHOPPING_LIST_COLLECTION = db.collection('lista_atual');
const MARKETS_COLLECTION = db.collection('mercados');
const shoppingListUI = document.getElementById('shoppingList');
const itemNameInput = document.getElementById('itemNameInput');
const addButton = document.getElementById('addButton'); 


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
// Lógica de Registro de Compra e Comparação de Preços (Com Seleção de Mercado)
// =================================================================

const markAsBought = async (itemId, itemName) => {
    
    const itemNameNormalized = itemName.toLowerCase();

    const pricePaidStr = prompt(`Quanto você pagou por "${itemName}"? (Ex: 4.50)`);
    if (!pricePaidStr) return; 

    const pricePaid = parseFloat(pricePaidStr.replace(',', '.'));
    if (isNaN(pricePaid) || pricePaid <= 0) {
        alert("Preço inválido.");
        return;
    }

    // --- LÓGICA DE SELEÇÃO DE MERCADO ---
    const marketsSnapshot = await MARKETS_COLLECTION.orderBy('nome').get();
    const availableMarkets = [];
    let promptMessage = "Selecione o mercado (digite o número):\n\n";

    marketsSnapshot.forEach((doc, index) => {
        const marketName = doc.data().nome;
        availableMarkets.push(marketName);
        promptMessage += `${index + 1}. ${marketName}\n`;
    });
    
    promptMessage += `\nOu digite o nome de um NOVO mercado:`;

    let marketChoice = prompt(promptMessage);
    if (!marketChoice) return;

    let market;
    const choiceIndex = parseInt(marketChoice.trim());

    if (!isNaN(choiceIndex) && choiceIndex > 0 && choiceIndex <= availableMarkets.length) {
        // Selecionou um mercado existente
        market = availableMarkets[choiceIndex - 1];
    } else {
        // Digitou um novo mercado
        market = marketChoice.trim();
        if (market) {
            // Cadastra o novo mercado
            await MARKETS_COLLECTION.add({ nome: market, timestamp: firebase.firestore.FieldValue.serverTimestamp() });
        } else {
            alert("Nome de mercado inválido.");
            return;
        }
    }
    // --- FIM DA LÓGICA DE SELEÇÃO DE MERCADO ---

    const isPromo = confirm(`O item estava em promoção?`);
    
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
    // CORREÇÃO (Problema 2): Limpa a lista antes de reconstruir para evitar duplicação.
    shoppingListUI.innerHTML = ''; 
    
    for (const doc of snapshot.docs) {
        const item = doc.data();
        const itemId = doc.id;
        
        // Normaliza o nome para a busca do histórico
        const itemNameDisplay = item.nome.charAt(0).toUpperCase() + item.nome.slice(1); // Primeira letra maiúscula
        const itemNameNormalized = item.nome; // Já está em minúsculo

        // 1. Busca o recorde de preço para exibir (informação histórica)
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
    
    // IMPORTANTE: Recarrega o histórico após a lista principal ser atualizada
    // Isso garante que os checkboxes sejam desativados/ativados corretamente.
    loadProductHistory(); 
});


// =================================================================
// Lógica de Reutilização de Itens Comprados (Checkboxes)
// =================================================================

const productHistoryUI = document.getElementById('productHistoryArea');

// Função para buscar a lista atual (para verificar se o item já existe)
const getActiveShoppingList = async () => {
    const snapshot = await SHOPPING_LIST_COLLECTION.get();
    
    const activeItems = new Set();
    snapshot.forEach(doc => {
        activeItems.add(doc.data().nome);
    });
    return activeItems;
}

// Função CORRIGIDA (Problema 1): Lógica de Desativação Rápida
const addFromHistory = async (event, itemName) => {
    
    event.stopPropagation();
    
    const checkbox = event.target;
    
    if (checkbox.checked) {
        // Desativa o checkbox IMEDIATAMENTE antes de começar o trabalho no Firebase.
        checkbox.disabled = true;

        try {
            await SHOPPING_LIST_COLLECTION.add({
                nome: itemName,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            });
            
        } catch (error) {
            console.error("Erro ao adicionar item do histórico:", error);
            alert("Erro ao adicionar item.");
            // Se falhar, reativa o checkbox
            checkbox.checked = true; 
            checkbox.disabled = false;
        } finally {
            // Após a adição bem-sucedida, o Listener da Lista Principal (onSnapshot)
            // será acionado e chamará o loadProductHistory(), que desativará o item.
            // Apenas desmarca para limpar a UI.
            checkbox.checked = false;
        }
    } else {
        // Se for desmarcado, reative.
        checkbox.disabled = false;
    }
};


// Função para carregar o histórico de produtos
const loadProductHistory = async () => {
    try {
        const productSnapshot = await PRODUCTS_COLLECTION.orderBy('nome').get();
        // Obtém os nomes dos itens que JÁ estão na lista de compras
        const activeItems = await getActiveShoppingList(); 
        
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

// ... (Chama a função para carregar o histórico quando o script for iniciado)
loadProductHistory();
