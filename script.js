// script.js (Versão Limpa e Comentada com Correção de Duplicação)

// 1. IMPORTAÇÕES DO FIREBASE (Define as referências e funções de acesso ao banco)
import {
    PRODUCTS_COLLECTION, SHOPPING_LIST_COLLECTION, MARKETS_COLLECTION,
    doc, onSnapshot, query, orderBy, where, limit,
    addDoc, updateDoc, deleteDoc, serverTimestamp, getDocs
} from './firebase.js';

// =================================================================
// 2. VARIÁVEIS DE ESTADO E REFERÊNCIAS DOM
// =================================================================

// Cache para armazenar o histórico de produtos e evitar múltiplas chamadas ao Firestore
const productCache = new Map();

// Variável para armazenar o estado mais recente dos itens na lista de compras (para controle do histórico e duplicação)
let activeShoppingItems = new Set();

// Variável para rastrear o mercado selecionado no modal (novo controle para os checkboxes)
let selectedMarket = null;

// Referências da Interface (DOM)
const shoppingListUI = document.getElementById('shoppingList');
const itemNameInput = document.getElementById('itemNameInput');
const addButton = document.getElementById('addButton');
const productHistoryUI = document.getElementById('productHistoryArea');

// Referências do Modal de Compra
const buyModal = document.getElementById('buyModal');
const modalItemName = document.getElementById('modalItemName');
const priceInput = document.getElementById('priceInput');
const marketCheckboxesUI = document.getElementById('marketCheckboxes'); // Container dos novos checkboxes
const promoCheckbox = document.getElementById('promoCheckbox');
const confirmBuyButton = document.getElementById('confirmBuy');
const closeButton = document.querySelector('.close-button');

// Referências para o campo de novo mercado
const newMarketArea = document.getElementById('newMarketArea');
const newMarketInput = document.getElementById('newMarketInput');
const addNewMarketBtn = document.getElementById('addNewMarketBtn'); // Botão para revelar o campo

let currentItemId = null; // ID do item sendo comprado
let currentItemName = null; // Nome do item sendo comprado
let unsubscribeShoppingList = null; // Função para desativar o listener do Firestore

// =================================================================
// 3. FUNÇÕES AUXILIARES
// =================================================================

/**
 * Capitaliza a primeira letra de uma string.
 * @param {string} s - A string a ser capitalizada.
 */
const capitalize = (s) => {
    if (!s) return '';
    return s.charAt(0).toUpperCase() + s.slice(1);
};

/**
 * Formata as dicas de melhor preço (Regular e Promoção) do histórico.
 * @param {object} productData - Dados do produto do Firestore.
 * @returns {string} - HTML formatado com as dicas de preço.
 */
const formatPriceHint = (productData) => {
    let regularHint = '';
    let promoHint = '';
    const currency = 'CAD$';

    if (productData) {
        // Lógica de Preço Regular
        const regularPrice = productData.melhorPrecoRegular;
        const regularMarket = productData.melhorMercadoRegular;
        if (regularPrice !== undefined && regularPrice !== null && regularPrice !== Infinity) {
            const formattedPrice = regularPrice.toFixed(2);
            regularHint = `Regular: ${currency} ${formattedPrice} (${capitalize(regularMarket)})`;
        }

        // Lógica de Preço Promoção
        const promoPrice = productData.melhorPrecoPromo;
        const promoMarket = productData.melhorMercadoPromo;
        if (promoPrice !== undefined && promoPrice !== null && promoPrice !== Infinity) {
            const formattedPrice = promoPrice.toFixed(2);
            promoHint = `Promoção: ${currency} ${formattedPrice} (${capitalize(promoMarket)})`;
        }
    }

    let bestPriceHint = '';
    
    if (regularHint) {
        bestPriceHint += regularHint;
    }
    
    // Adiciona quebra de linha se ambos os preços existirem
    if (regularHint && promoHint) {
        bestPriceHint += '<br>';
    }
    
    if (promoHint) {
        bestPriceHint += promoHint;
    }

    return bestPriceHint || 'Novo item. Sem histórico de preço.';
};

/**
 * Fecha e limpa o modal de compra.
 */
const closeBuyModal = () => {
    buyModal.style.display = 'none';
    currentItemId = null;
    currentItemName = null;
    priceInput.value = '';
    marketCheckboxesUI.innerHTML = ''; // Limpa os checkboxes
    selectedMarket = null; // Reseta o mercado selecionado
    promoCheckbox.checked = false;
    
    // Reseta e oculta o campo de novo mercado
    newMarketArea.style.display = 'none';
    newMarketInput.value = '';
    addNewMarketBtn.style.display = 'block'; // Mostra o botão 'Adicionar Novo Mercado'
};

// =================================================================
// 4. FUNÇÕES DE MANIPULAÇÃO DO FIREBASE
// =================================================================

/**
 * Deleta um item do histórico de produtos (coleção PRODUCTS_COLLECTION).
 * @param {string} productName - Nome do produto a ser deletado.
 */
const deleteProductFromHistory = async (productName) => {
    if (!confirm(`Tem certeza que deseja excluir '${capitalize(productName)}' permanentemente do histórico de preços?`)) {
        return;
    }

    try {
        // Busca a referência do documento pelo nome
        const q = query(PRODUCTS_COLLECTION, where('nome', '==', productName), limit(1));
        const itemSnapshot = await getDocs(q);

        if (!itemSnapshot.empty) {
            const docRef = doc(PRODUCTS_COLLECTION, itemSnapshot.docs[0].id);
            await deleteDoc(docRef);
            alert(`'${capitalize(productName)}' excluído do histórico com sucesso.`);
        } else {
            alert("Item não encontrado no histórico.");
        }
    } catch (error) {
        console.error("Erro ao deletar item do histórico:", error);
        alert("Não foi possível excluir o item do histórico.");
    }
};

/**
 * Abre o modal de compra e carrega os mercados.
 * @param {string} itemId - ID do item na lista de compras.
 * @param {string} itemName - Nome do item.
 */
const openBuyModal = async (itemId, itemName) => {
    currentItemId = itemId;
    currentItemName = itemName;
    modalItemName.textContent = `Registrar compra de: ${capitalize(itemName)}`;

    await loadMarketsToSelect(); // Carrega os mercados como checkboxes

    // Reseta os campos do modal
    priceInput.value = '';
    promoCheckbox.checked = false;
    newMarketArea.style.display = 'none';
    addNewMarketBtn.style.display = 'block';
    selectedMarket = null;

    buyModal.style.display = 'block';
};

/**
 * Deleta um item da lista de compras (coleção SHOPPING_LIST_COLLECTION).
 * @param {string} itemId - ID do item na lista de compras.
 */
const deleteItem = async (itemId) => {
    try {
        const itemRef = doc(SHOPPING_LIST_COLLECTION, itemId);
        await deleteDoc(itemRef);
    } catch (error) {
        console.error("Erro ao deletar item:", error);
        alert("Não foi possível deletar o item.");
    }
};

/**
 * Adiciona um item à lista de compras principal, prevenindo duplicação.
 */
const addItem = async () => {
    const itemName = itemNameInput.value.trim();
    if (!itemName) return;

    const normalizedName = itemName.toLowerCase();

    // === LÓGICA DE PREVENÇÃO DE DUPLICAÇÃO ===
    // Verifica se o item (pelo nome normalizado) já está na lista ativa (activeShoppingItems é um Set)
    if (activeShoppingItems.has(normalizedName)) {
        alert(`O item '${capitalize(normalizedName)}' já está na sua lista de compras.`);
        itemNameInput.value = '';
        return; // Sai da função, impedindo a adição ao Firestore
    }
    // =========================================

    try {
        await addDoc(SHOPPING_LIST_COLLECTION, {
            nome: normalizedName,
            timestamp: serverTimestamp(),
        });
        itemNameInput.value = '';
    } catch (error) {
        console.error("Erro ao adicionar item:", error);
        alert("Não foi possível adicionar o item à lista.");
    }
};

/**
 * Adiciona um item do histórico (productName) de volta para a lista de compras.
 * @param {string} productName - Nome do produto a ser adicionado.
 */
const addFromHistory = async (productName) => {
    // A verificação de duplicação para histórico é feita em 'renderProductHistory'
    try {
        await addDoc(SHOPPING_LIST_COLLECTION, {
            nome: productName,
            timestamp: serverTimestamp(),
        });
        return true; // Sucesso
    } catch (error) {
        console.error("Erro ao adicionar do histórico:", error);
        alert("Não foi possível adicionar o item do histórico. Verifique sua conexão.");
        return false; // Falha
    }
};

/**
 * Carrega os mercados do Firestore e os renderiza como checkboxes de seleção única.
 */
const loadMarketsToSelect = async () => {
    marketCheckboxesUI.innerHTML = ''; // Limpa o container
    selectedMarket = null; // Reseta o estado de seleção
    
    try {
        const q = query(MARKETS_COLLECTION, orderBy('nome'));
        const marketSnapshot = await getDocs(q);

        marketSnapshot.forEach((doc) => {
            const market = doc.data();
            const marketName = market.nome;
            const marketId = `market-${doc.id}`;

            // Cria o wrapper para estilos CSS
            const wrapper = document.createElement('div');
            wrapper.className = 'market-checkbox-wrapper';

            // Cria o elemento input (checkbox)
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = marketId;
            checkbox.value = marketName;
            checkbox.className = 'market-checkbox-input';

            // Cria o label
            const label = document.createElement('label');
            label.htmlFor = marketId;
            label.textContent = capitalize(marketName);
            label.className = 'market-checkbox-label';

            // Lógica de seleção única (Radio-like Checkbox)
            checkbox.addEventListener('change', (e) => {
                if (e.target.checked) {
                    selectedMarket = marketName;
                    // Desmarca todos os outros checkboxes
                    marketCheckboxesUI.querySelectorAll('.market-checkbox-input').forEach(cb => {
                        if (cb !== checkbox) {
                            cb.checked = false;
                        }
                    });
                    // Oculta área de novo mercado (se o usuário selecionou um existente)
                    newMarketArea.style.display = 'none';
                    addNewMarketBtn.style.display = 'block';
                    newMarketInput.value = '';
                } else {
                    selectedMarket = null; // Se desmarcar, zera o mercado
                }
            });

            wrapper.appendChild(checkbox);
            wrapper.appendChild(label);
            marketCheckboxesUI.appendChild(wrapper);
        });
    } catch (error) {
        console.error("Erro ao carregar mercados:", error);
    }
};

/**
 * Processa a confirmação de compra, registra o preço/mercado e remove o item da lista.
 */
const confirmBuyHandler = async () => {
    const pricePaidStr = priceInput.value;
    const isPromo = promoCheckbox.checked;
    const pricePaid = parseFloat(pricePaidStr.replace(',', '.'));

    if (!pricePaid || pricePaid <= 0) {
        alert("Por favor, insira um preço válido.");
        return;
    }

    let marketName = selectedMarket;

    // 1. Lógica para NOVO MERCADO
    if (newMarketArea.style.display === 'block') {
        let newMarketInputTrimmed = newMarketInput.value.trim();
        
        if (!newMarketInputTrimmed) {
            alert("Por favor, insira o nome do novo mercado.");
            return;
        }

        marketName = newMarketInputTrimmed.toLowerCase();
        
        // Adiciona o novo mercado ao Firestore
        try {
            await addDoc(MARKETS_COLLECTION, {
                nome: marketName,
                timestamp: serverTimestamp(),
            });
        } catch (error) {
            console.error("Erro ao adicionar novo mercado:", error);
            alert("Não foi possível adicionar o novo mercado. Tente novamente.");
            return;
        }

    } else if (!marketName) { // 2. Verifica se algum mercado (existente) foi selecionado
        alert("Por favor, selecione ou adicione um mercado.");
        return;
    }
    
    // 3. REGISTRO DA COMPRA NO HISTÓRICO (PRODUCTS_COLLECTION)
    try {
        const itemRefQuery = query(PRODUCTS_COLLECTION, where('nome', '==', currentItemName), limit(1));
        const itemSnapshot = await getDocs(itemRefQuery);
        let updateFields = { ultimaCompra: serverTimestamp() };

        if (!itemSnapshot.empty) {
            const productDocRef = doc(PRODUCTS_COLLECTION, itemSnapshot.docs[0].id);
            const productData = itemSnapshot.docs[0].data();
            
            // Atualização de Preço Promoção
            const currentPromoPrice = productData.melhorPrecoPromo || Infinity;
            if (isPromo && pricePaid < currentPromoPrice) {
                updateFields.melhorPrecoPromo = pricePaid;
                updateFields.melhorMercadoPromo = marketName;
            }

            // Atualização de Preço Regular
            const currentRegularPrice = productData.melhorPrecoRegular || Infinity;
            if (!isPromo && pricePaid < currentRegularPrice) {
                updateFields.melhorPrecoRegular = pricePaid;
                updateFields.melhorMercadoRegular = marketName;
            }

            await updateDoc(productDocRef, updateFields);
        } else {
            // Cria um novo registro de produto
            const productData = {
                nome: currentItemName,
                melhorPrecoPromo: isPromo ? pricePaid : null,
                melhorMercadoPromo: isPromo ? marketName : null,
                melhorPrecoRegular: !isPromo ? pricePaid : null,
                melhorMercadoRegular: !isPromo ? marketName : null,
                ultimaCompra: serverTimestamp()
            };
            await addDoc(PRODUCTS_COLLECTION, productData);
        }

        // 4. REMOVE ITEM DA LISTA DE COMPRAS ATUAL
        if (currentItemId) {
            const shoppingItemRef = doc(SHOPPING_LIST_COLLECTION, currentItemId);
            await deleteDoc(shoppingItemRef);
        }

        priceInput.blur();
        closeBuyModal();
    } catch (error) {
        console.error("Erro ao registrar compra:", error);
        alert("Não foi possível registrar a compra. Verifique sua conexão.");
    }
};

// =================================================================
// 5. FUNÇÕES DE RENDERIZAÇÃO E LISTENERS (FIREBASE & UI)
// =================================================================

/**
 * Renderiza os itens do histórico de produtos na UI.
 * @param {Set<string>} activeItems - Nomes dos itens que estão atualmente na lista de compras.
 */
const renderProductHistory = (activeItems) => {
    
    productHistoryUI.innerHTML = '';
    
    // Ordena os produtos do cache alfabeticamente
    const sortedProducts = Array.from(productCache.values()).sort((a, b) => a.nome.localeCompare(b.nome));

    sortedProducts.forEach((product) => {
        const productName = product.nome;
        const isItemActive = activeItems.has(productName);

        // Cria a tag e o label com o checkbox
        const tag = document.createElement('div');
        tag.className = 'product-tag-wrapper';
        
        const label = document.createElement('label');
        label.className = 'product-tag';

        if (isItemActive) {
            label.classList.add('disabled-tag');
        }

        const displayName = capitalize(productName);
        const checkboxDisabledAttr = isItemActive ? 'disabled' : '';
        const checkboxCheckedAttr = isItemActive ? 'checked' : '';

        label.innerHTML = `
            <input type="checkbox" ${checkboxDisabledAttr} ${checkboxCheckedAttr}>
            <span>${displayName}</span>
        `;
        
        // Listener para adicionar o item do histórico à lista de compras
        label.addEventListener('click', async (e) => {
            if (e.target.closest('.delete-history-btn')) {
                return; // Ignora o clique se for no botão de delete
            }

            e.preventDefault(); // Impede a alternância imediata do checkbox

            const checkbox = label.querySelector('input[type="checkbox"]');
            
            if (checkbox.disabled || checkbox.checked) {
                return; // Se já está na lista ou marcado, ignora
            }
            
            // Inicia o feedback visual e chama a função assíncrona
            checkbox.checked = true;
            checkbox.disabled = true;
            
            const success = await addFromHistory(productName);
            
            if (!success) {
                checkbox.checked = false;
                checkbox.disabled = false;
            }
            // A atualização do Firestore fará a re-renderização completa via onSnapshot
        });
        
        // Botão para excluir o item do histórico de preços
        const deleteButton = document.createElement('button');
        deleteButton.className = 'delete-history-btn';
        deleteButton.innerHTML = '🗑️';
        deleteButton.title = `Excluir '${displayName}' do histórico de preços`;
        deleteButton.onclick = (e) => {
            e.stopPropagation();
            deleteProductFromHistory(productName);
        };
        
        tag.appendChild(label);
        tag.appendChild(deleteButton);
        productHistoryUI.appendChild(tag);
    });
};

/**
 * Configura o listener do Firestore para o Histórico de Produtos (PRODUCTS_COLLECTION).
 */
const setupProductHistoryListener = () => {
    const q = query(PRODUCTS_COLLECTION, orderBy('nome'));
    
    onSnapshot(q, (snapshot) => {
        productCache.clear();
        snapshot.forEach(doc => {
            const product = { ...doc.data(), id: doc.id };
            productCache.set(product.nome, product);
        });
        
        renderProductHistory(activeShoppingItems); // Renderiza o histórico com os itens ativos atuais

    }, (error) => {
        console.error("Erro no Listener do Histórico de Produtos:", error);
    });
};


/**
 * Configura o listener principal do Firestore para a Lista de Compras Atual (SHOPPING_LIST_COLLECTION).
 */
const setupShoppingListListener = () => {
    if (unsubscribeShoppingList) {
        unsubscribeShoppingList(); // Limpa o listener anterior, se houver
    }

    const q = query(SHOPPING_LIST_COLLECTION, orderBy('timestamp', 'desc'));

    unsubscribeShoppingList = onSnapshot(q, (snapshot) => {

        // 1. ATUALIZA O ESTADO DOS ITENS ATIVOS
        // Esta é a chave para o anti-duplicação: mantém o Set atualizado com o que está no Firestore
        const currentActiveItems = new Set();
        snapshot.docs.forEach(doc => currentActiveItems.add(doc.data().nome));
        activeShoppingItems = currentActiveItems; // Variável global 'activeShoppingItems' atualizada

        // 2. RE-RENDERIZA O HISTÓRICO (para desabilitar/habilitar corretamente)
        renderProductHistory(activeShoppingItems);

        // 3. PROCESSA MUDANÇAS NA LISTA DE COMPRAS
        snapshot.docChanges().forEach((change) => {
            const itemId = change.doc.id;
            const item = change.doc.data();
            const itemName = item.nome;
            const itemNameDisplay = capitalize(itemName);
            
            const productData = productCache.get(itemName);
            const bestPriceHint = formatPriceHint(productData);

            if (change.type === 'added' || change.type === 'modified') {
                let existingLi = document.getElementById(`item-${itemId}`);

                const newLiHtml = `
                    <div class="item-info">
                        <span class="item-name">${itemNameDisplay}</span>
                        <span class="price-hint">${bestPriceHint}</span>
                    </div>
                    <button class="delete-button" onclick="deleteItem('${itemId}')">Remover / Comprei</button>
                    <button class="buy-button" onclick="markAsBought('${itemId}', '${itemName}')">Ajustar</button>
                `;

                if (change.type === 'added') {
                    const li = document.createElement('li');
                    li.id = `item-${itemId}`;
                    li.className = 'shopping-item';
                    li.innerHTML = newLiHtml;

                    // Adiciona o novo item no topo
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

        if (snapshot.docs.length === 0) {
            shoppingListUI.innerHTML = '';
        }

    }, (error) => {
        console.error("Erro no Listener principal do Firestore:", error);
        shoppingListUI.innerHTML = `<li style="color: red;">Erro ao carregar a lista de compras.</li>`;
    });
};

// =================================================================
// 6. CONFIGURAÇÃO DOS EVENT LISTENERS INICIAIS
// =================================================================

// Expõe funções globais para serem usadas nos atributos 'onclick' do HTML
window.markAsBought = openBuyModal;
window.deleteItem = deleteItem;

// Garante que os listeners sejam configurados apenas uma vez
if (!window.isShoppingListInitialized) {

    // Listeners para Adicionar Item
    addButton.addEventListener('click', addItem);
    itemNameInput.addEventListener('keyup', (event) => {
        if (event.key === 'Enter') addItem();
    });

    // Listeners do Modal
    confirmBuyButton.addEventListener('click', confirmBuyHandler);
    closeButton.addEventListener('click', closeBuyModal);
    window.addEventListener('click', (event) => {
        if (event.target === buyModal) {
            closeBuyModal();
        }
    });

    // Listener para o botão de 'Adicionar Novo Mercado' (Lógica de Interface)
    addNewMarketBtn.addEventListener('click', () => {
        newMarketArea.style.display = 'block';
        addNewMarketBtn.style.display = 'none'; // Esconde o botão após clicar
        newMarketInput.focus();
        
        // Limpa a seleção de qualquer checkbox existente ao focar no novo campo
        marketCheckboxesUI.querySelectorAll('.market-checkbox-input').forEach(cb => {
            cb.checked = false;
        });
        selectedMarket = null;
    });

    // Inicialização dos Listeners do Firestore
    setupProductHistoryListener();
    setupShoppingListListener();
    window.isShoppingListInitialized = true;

} else {
    console.warn("Inicialização de listeners bloqueada.");
}
