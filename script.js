// Referências às coleções no Firestore
const PRODUCTS_COLLECTION = db.collection('produtos');
const SHOPPING_LIST_COLLECTION = db.collection('lista_atual');

const shoppingListUI = document.getElementById('shoppingList');
const itemNameInput = document.getElementById('itemNameInput');
const addButton = document.getElementById('addButton');

// =================================================================
// Lógica de Adicionar Item (Simplificada para a Lista Atual)
// A lógica complexa de busca e cadastro é tratada pelo Firestore
// =================================================================

const addItem = async () => {
    const itemName = itemNameInput.value.trim();
    if (!itemName) return;

    // A. Adiciona o item à Lista de Compras Atual
    await SHOPPING_LIST_COLLECTION.add({
        nome: itemName,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        // Para fins deste exemplo, usaremos o nome como ID temporário
        // A checagem de preço acontecerá quando o item for comprado.
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
    // Pede ao usuário os dados da compra atual (substituir por um modal/popup mais tarde)
    const pricePaidStr = prompt(`Quanto você pagou por "${itemName}"? (Ex: 4.50)`);
    if (!pricePaidStr) return; 

    const pricePaid = parseFloat(pricePaidStr.replace(',', '.'));
    if (isNaN(pricePaid) || pricePaid <= 0) {
        alert("Preço inválido.");
        return;
    }

    const market = prompt(`Em qual mercado você comprou o item?`);
    const isPromo = confirm(`O item estava em promoção?`);
    
    // 1. Remove o item da Lista de Compras Atual (Fluxo 2, Passo 6)
    await SHOPPING_LIST_COLLECTION.doc(itemId).delete();

    // 2. Busca o produto mestre para comparação
    // A complexidade de buscar/criar o produto mestre é simplificada aqui
    const productQuery = await PRODUCTS_COLLECTION.where('nome', '==', itemName).limit(1).get();
    
    let productId;
    let bestPrice = Infinity;

    if (!productQuery.empty) {
        // Produto já existe, pega o ID e o melhor preço
        const doc = productQuery.docs[0];
        productId = doc.id;
        bestPrice = doc.data().melhorPreco || Infinity;
    } else {
        // Produto é novo, cria o registro mestre
        const newProductRef = await PRODUCTS_COLLECTION.add({
            nome: itemName,
            melhorPreco: Infinity, // Será atualizado logo em seguida
            melhorMercado: '',
            emPromocao: false,
        });
        productId = newProductRef.id;
    }

    // 3. Lógica Inteligente: Compara o preço e atualiza o Recorde (Fluxo 3)
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
        
        const li = document.createElement('li');
        li.className = 'shopping-item';

        // 1. Busca o recorde de preço para exibir (informação histórica)
        const productQuery = await PRODUCTS_COLLECTION.where('nome', '==', item.nome).limit(1).get();
        let bestPriceHint = 'Novo item. Sem histórico de preço.';

        if (!productQuery.empty) {
            const productData = productQuery.docs[0].data();
            if (productData.melhorPreco && productData.melhorPreco !== Infinity) {
                const promo = productData.emPromocao ? ' (PROMO)' : '';
                bestPriceHint = `Melhor Preço: R$ ${productData.melhorPreco.toFixed(2)} em ${productData.melhorMercado}${promo}`;
            }
        }

        li.innerHTML = `
            <div class="item-info">
                <span class="item-name">${item.nome}</span>
                <span class="price-hint">${bestPriceHint}</span>
            </div>
            <button class="buy-button" onclick="markAsBought('${itemId}', '${item.nome}')">Comprei!</button>
        `;
        
        shoppingListUI.appendChild(li);
    }
});