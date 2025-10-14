// Referências às coleções no Firestore
const PRODUCTS_COLLECTION = db.collection('produtos');
const SHOPPING_LIST_COLLECTION = db.collection('lista_atual');

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
        nome: itemName,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    });

    itemNameInput.value = '';
};

addButton.addEventListener('click', addItem);
itemNameInput.addEventListener('keyup', (event) => {
    if (event.key === 'Enter') addItem();
});

// =================================================================
// Lógica de Registro de Compra e Comparação de Preços (O Cérebro)
// =================================================================

const markAsBought = async (itemId, itemName) => {
    
    // Normaliza o nome ANTES de tudo para garantir a consistência no banco de dados
    const itemNameNormalized = itemName.toLowerCase();

    const pricePaidStr = prompt(`Quanto você pagou por "${itemName}"? (Ex: 4.50)`);
    if (!pricePaidStr) return; 

    const pricePaid = parseFloat(pricePaidStr.replace(',', '.'));
    if (isNaN(pricePaid) || pricePaid <= 0) {
        alert("Preço inválido.");
        return;
    }

    const market = prompt(`Em qual mercado você comprou o item?`);
    const isPromo = confirm(`O item estava em promoção?`);
    
    // 1. Remove o item da Lista de Compras Atual
    await SHOPPING_LIST_COLLECTION.doc(itemId).delete();

    // 2. Busca o produto mestre para comparação
    // Usa o nome normalizado na busca
    const productQuery = await PRODUCTS_COLLECTION.where('nome', '==', itemNameNormalized).limit(1).get();
    
    let productId;
    let bestPrice = Infinity;

    if (!productQuery.empty) {
        // Produto já existe, pega o ID e o melhor preço
        const doc = productQuery.docs[0];
        productId = doc.id;
        bestPrice = doc.data().melhorPreco || Infinity;
    } else {
        // Produto é novo, cria o registro mestre (com preço infinito para garantir que a primeira compra seja o 'melhor')
        const newProductRef = await PRODUCTS_COLLECTION.add({
            nome: itemNameNormalized, // Salva o nome normalizado
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
        alert(`NOVO RECORDE! O melhor preço de ${itemName} agora é R$ ${pricePaid.toFixed(2)}.`);
    } else {
        alert(`Compra registrada, mas o melhor preço continua sendo R$ ${bestPrice.toFixed(2)}.`);
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
        
        // Normaliza o nome para a busca do histórico
        const itemNameDisplay = item.nome; // Nome original para exibição
        const itemNameNormalized = item.nome.toLowerCase();

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
            <button class="buy-button" onclick="markAsBought('${itemId}', '${itemNameDisplay}')">Comprei!</button>
        `;
        
        shoppingListUI.appendChild(li);
    }
});

// =================================================================
// Lógica de Reutilização de Itens Comprados (Checkboxes)
// =================================================================

const productHistoryUI = document.getElementById('productHistoryArea');

// Função CORRIGIDA: Agora é assíncrona e para a propagação do evento
const addFromHistory = async (event, itemName) => {
    
    // CRUCIAL: Impede que o evento de clique se propague e dispare duas vezes
    event.stopPropagation();
    
    const checkbox = event.target;
    
    // Garante que só processamos a adição se a caixa foi marcada
    if (checkbox.checked) {
        
        // Desativa o checkbox para evitar cliques duplos enquanto o Firebase processa
        checkbox.disabled = true;

        try {
            await SHOPPING_LIST_COLLECTION.add({
                nome: itemName,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            });
            
        } catch (error) {
            console.error("Erro ao adicionar item do histórico:", error);
            alert("Erro ao adicionar item.");
            // Se falhar, mantemos a caixa marcada e reativamos (ou desmarcamos)
            checkbox.checked = true; 
        } finally {
             // O item foi adicionado. Desmarca o checkbox para um novo uso e reativa.
             checkbox.checked = false;
             checkbox.disabled = false;
        }
    }
};

// Listener que monitora o histórico de produtos
PRODUCTS_COLLECTION.orderBy('nome').onSnapshot((snapshot) => {
    productHistoryUI.innerHTML = '';
    
    snapshot.forEach((doc) => {
        const product = doc.data();
        
        const tag = document.createElement('label');
        tag.className = 'product-tag';
        
        const displayName = product.nome.charAt(0).toUpperCase() + product.nome.slice(1);
        
        // O onclick está no input e a função é assíncrona
        tag.innerHTML = `
            <input type="checkbox" onclick="addFromHistory(event, '${product.nome}')">
            ${displayName}
        `;
        
        productHistoryUI.appendChild(tag);
    });
});
