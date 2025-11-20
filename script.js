// script.js (Versão Final: Detalhes Salvos no Histórico de Preços e Correção de Duplicação)

// =================================================================
// 1. IMPORTAÇÕES DO FIREBASE
// =================================================================

// Importa todas as funções e constantes necessárias do arquivo 'firebase.js'.
// Isso permite que o código interaja com o banco de dados Firestore.
import {
    // Referências às coleções (tabelas) no banco de dados.
    PRODUCTS_COLLECTION, SHOPPING_LIST_COLLECTION, MARKETS_COLLECTION,
    // Funções do Firestore usadas para buscar, criar, atualizar e monitorar dados.
    doc, onSnapshot, query, orderBy, where, limit,
    addDoc, updateDoc, deleteDoc, serverTimestamp, getDocs
} from './firebase.js';

// =================================================================
// 2. VARIÁVEIS DE ESTADO E REFERÊNCIAS DOM
// =================================================================

// 'Map' é um objeto para armazenar o histórico de preços dos produtos (cache). 
// Chave: nome do item (minúsculo), Valor: dados do preço.
const productCache = new Map();
// Array para armazenar a lista de todos os mercados disponíveis.
let marketListCache = []; 

// 'Set' é um objeto que armazena apenas valores únicos. 
// Usado para rastrear rapidamente quais itens estão ativos na lista de compras (prevenir duplicação).
let activeShoppingItems = new Set();
// Variável para armazenar o nome do mercado que o usuário seleciona no modal de compra.
let selectedMarket = null; 

// Variável que armazena o filtro de mercado atualmente ativo na lista principal. 'TODOS' é o padrão.
let currentFilterMarket = 'TODOS'; 

// --- Referências da Interface (DOM) ---
// Obtém os elementos HTML pelo seu 'id' para que o JavaScript possa manipulá-los.
const shoppingListUI = document.getElementById('shoppingList');
const itemNameInput = document.getElementById('itemNameInput');
const addButton = document.getElementById('addButton');
const productHistoryUI = document.getElementById('productHistoryArea');
const marketFilterAreaUI = document.getElementById('marketFilterArea'); // Área de filtro

// --- Referências do Modal de Compra ---
const buyModal = document.getElementById('buyModal');
const modalItemName = document.getElementById('modalItemName');
const priceInput = document.getElementById('priceInput');
const marketCheckboxesUI = document.getElementById('marketCheckboxes'); 
const promoCheckbox = document.getElementById('promoCheckbox');
const confirmBuyButton = document.getElementById('confirmBuy');
const closeButton = document.querySelector('.close-button'); // Usa 'querySelector' para encontrar o primeiro elemento com essa classe.
const newMarketArea = document.getElementById('newMarketArea');
const newMarketInput = document.getElementById('newMarketInput');
const addNewMarketBtn = document.getElementById('addNewMarketBtn'); 
const purchaseDetailsInput = document.getElementById('purchaseDetailsInput'); // Campo de Detalhes da Compra no Modal

// Variáveis de estado do modal: armazena o ID e o nome do item que está sendo comprado.
let currentItemId = null;
let currentItemName = null;
// Variáveis para armazenar as funções de 'unsubscribe' dos listeners do Firebase. 
// Isso permite parar de monitorar as coleções quando necessário (bom para performance).
let unsubscribeShoppingList = null;
let unsubscribeMarkets = null;


// =================================================================
// 3. FUNÇÕES AUXILIARES
// =================================================================

/**
 * Capitaliza a primeira letra de uma string.
 * @param {string} s - A string a ser capitalizada.
 */
const capitalize = (s) => {
    // Se a string for nula ou vazia, retorna vazio.
    if (!s) return '';
    // Pega a primeira letra, transforma em maiúscula, e junta com o resto da string (do segundo caractere em diante).
    return s.charAt(0).toUpperCase() + s.slice(1);
};

/**
 * Retorna o nome do melhor mercado regular de um item.
 * @param {string} itemName - Nome do item.
 * @returns {string} - Nome do mercado (em minúsculo) ou 'SEM_MERCADO'.
 */
const getBestRegularMarket = (itemName) => {
    // Busca os dados do item no cache local.
    const productData = productCache.get(itemName);
    // Retorna o nome do melhor mercado regular ou 'SEM_MERCADO' se o item não tiver histórico.
    return productData?.melhorMercadoRegular || 'SEM_MERCADO'; 
};

/**
 * Formata as dicas de melhor preço (Regular e Promoção) do histórico para exibição.
 * Inclui os detalhes da compra (quantidade/peso) para contexto.
 * @param {object} productData - Dados do produto do Firestore.
 * @returns {string} - HTML formatado com as dicas de preço.
 */
const formatPriceHint = (productData) => {
    let regularHint = '';
    let promoHint = '';
    const currency = 'CAD$'; // Define a moeda.

    if (productData) {
        // --- Lógica de Preço Regular ---
        const regularPrice = productData.melhorPrecoRegular;
        const regularMarket = productData.melhorMercadoRegular;
        const regularDetail = productData.melhorDetalheRegular; // Novo: Detalhe da compra regular.
        
        // Verifica se existe um preço regular válido (não nulo, não infinito).
        if (regularPrice !== undefined && regularPrice !== null && regularPrice !== Infinity) {
            const formattedPrice = regularPrice.toFixed(2); // Formata o preço com 2 casas decimais.
            const detailText = regularDetail ? ` (${regularDetail})` : ''; // Adiciona o detalhe se existir.
            regularHint = `Regular: ${currency} ${formattedPrice}${detailText} (${capitalize(regularMarket)})`;
        }

        // --- Lógica de Preço Promoção ---
        const promoPrice = productData.melhorPrecoPromo;
        const promoMarket = productData.melhorMercadoPromo;
        const promoDetail = productData.melhorDetalhePromo; // Novo: Detalhe da compra em promoção.
        
        // Verifica se existe um preço de promoção válido.
        if (promoPrice !== undefined && promoPrice !== null && promoPrice !== Infinity) {
            const formattedPrice = promoPrice.toFixed(2);
            const detailText = promoDetail ? ` (${promoDetail})` : ''; // Adiciona o detalhe se existir.
            promoHint = `Promoção: ${currency} ${formattedPrice}${detailText} (${capitalize(promoMarket)})`;
        }
    }

    let bestPriceHint = '';
    
    // Constrói a string final de dica de preço.
    if (regularHint) {
        bestPriceHint += regularHint;
    }
    
    // Adiciona uma quebra de linha HTML (<br>) se houver os dois tipos de preço.
    if (regularHint && promoHint) {
        bestPriceHint += '<br>';
    }
    
    if (promoHint) {
        bestPriceHint += promoHint;
    }

    // Adiciona um aviso se não houver histórico de preço regular.
    if (!regularHint) {
        bestPriceHint += (bestPriceHint ? '<br>' : '') + 'Sem histórico regular.';
    }

    return bestPriceHint;
};

/**
 * Fecha e limpa o modal de compra (janela pop-up).
 */
const closeBuyModal = () => {
    buyModal.style.display = 'none'; // Esconde o modal.
    // Limpa todas as variáveis de estado e campos do formulário do modal.
    currentItemId = null;
    currentItemName = null;
    priceInput.value = '';
    marketCheckboxesUI.innerHTML = '';
    selectedMarket = null;
    promoCheckbox.checked = false;
    purchaseDetailsInput.value = ''; // NOVO: Limpa o campo de detalhes da compra.
    
    newMarketArea.style.display = 'none';
    newMarketInput.value = '';
    addNewMarketBtn.style.display = 'block'; // Garante que o botão 'Adicionar Novo Mercado' reapareça.
};

// =================================================================
// 4. FUNÇÕES DE MANIPULAÇÃO DO FIREBASE
// =================================================================

/**
 * Deleta um item do histórico de produtos (coleção PRODUCTS_COLLECTION).
 * @param {string} productName - Nome do produto a ser deletado.
 */
const deleteProductFromHistory = async (productName) => {
    // Pede uma confirmação ao usuário antes de deletar.
    if (!confirm(`Tem certeza que deseja excluir '${capitalize(productName)}' permanentemente do histórico de preços?`)) {
        return; // Sai da função se o usuário cancelar.
    }

    try {
        // Cria uma consulta para encontrar o documento do produto pelo nome.
        const q = query(PRODUCTS_COLLECTION, where('nome', '==', productName), limit(1));
        const itemSnapshot = await getDocs(q); // Executa a consulta.

        if (!itemSnapshot.empty) {
            // Se o item for encontrado, obtém a referência do documento e o deleta.
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
 * @param {string} itemId - ID do item na lista de compras (SHOPPING_LIST_COLLECTION).
 * @param {string} itemName - Nome do item.
 */
const openBuyModal = async (itemId, itemName) => {
    // Armazena o ID e o nome do item que será processado no modal.
    currentItemId = itemId;
    currentItemName = itemName;
    modalItemName.textContent = `Registrar compra de: ${capitalize(itemName)}`;

    await loadMarketsToSelect(); // Chama a função para renderizar os checkboxes de mercado.

    // Limpa e reseta todos os campos do modal.
    priceInput.value = '';
    promoCheckbox.checked = false;
    purchaseDetailsInput.value = ''; // NOVO: Garante que os detalhes estejam limpos.
    
    newMarketArea.style.display = 'none';
    addNewMarketBtn.style.display = 'block';
    selectedMarket = null;

    buyModal.style.display = 'block'; // Mostra o modal.
};

/**
 * Deleta um item da lista de compras (SHOPPING_LIST_COLLECTION).
 * @param {string} itemId - ID do item na lista de compras.
 */
const deleteItem = async (itemId) => {
    try {
        const itemRef = doc(SHOPPING_LIST_COLLECTION, itemId); // Obtém a referência do documento.
        await deleteDoc(itemRef); // Deleta o documento do Firestore.
    } catch (error) {
        console.error("Erro ao deletar item:", error);
        alert("Não foi possível deletar o item.");
    }
};

/**
 * Adiciona um item à lista de compras principal, prevenindo duplicação.
 */
const addItem = async () => {
    const itemName = itemNameInput.value.trim(); // Pega o nome do item e remove espaços extras.
    if (!itemName) return; // Se o campo estiver vazio, para a função.

    const normalizedName = itemName.toLowerCase(); // Normaliza o nome (tudo em minúsculo) para comparação e salvamento.

    // Verifica se o item JÁ existe na lista usando o Set (activeShoppingItems).
    if (activeShoppingItems.has(normalizedName)) {
        alert(`O item '${capitalize(normalizedName)}' já está na sua lista de compras.`);
        itemNameInput.value = '';
        return;
    }

    try {
        // Adiciona um novo documento na coleção da lista de compras.
        await addDoc(SHOPPING_LIST_COLLECTION, {
            nome: normalizedName,
            timestamp: serverTimestamp(), // Usa o timestamp do servidor para ordenação e registro.
        });
        itemNameInput.value = ''; // Limpa o campo de input.
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
    // CORREÇÃO: Verifica se o item JÁ está ativo para prevenir duplicação caso o usuário clique rápido.
    if (activeShoppingItems.has(productName)) {
        console.warn(`Item '${capitalize(productName)}' já está na lista. Adição cancelada.`);
        return false;
    }

    try {
        // Adiciona um novo item à lista de compras.
        await addDoc(SHOPPING_LIST_COLLECTION, {
            nome: productName, // O nome já está normalizado (minúsculo) ao ser pego do histórico.
            timestamp: serverTimestamp(),
        });
        return true;
    } catch (error) {
        console.error("Erro ao adicionar do histórico:", error);
        alert("Não foi possível adicionar o item do histórico. Verifique sua conexão.");
        return false;
    }
};

/**
 * Carrega os mercados do Firestore e os renderiza como checkboxes de seleção única no modal.
 */
const loadMarketsToSelect = async () => {
    marketCheckboxesUI.innerHTML = ''; // Limpa os checkboxes antigos.
    selectedMarket = null; // Reseta o mercado selecionado.
    
    // Itera sobre a lista de mercados armazenada em cache.
    marketListCache.forEach((marketName) => {
        // Cria um ID único para o checkbox.
        const marketId = `market-${marketName.replace(/\s/g, '-')}`;

        // Cria o wrapper (div) para organizar o checkbox e o label.
        const wrapper = document.createElement('div');
        wrapper.className = 'market-checkbox-wrapper';

        // Cria o elemento input (checkbox).
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = marketId;
        checkbox.value = marketName;
        checkbox.className = 'market-checkbox-input';

        // Cria o elemento label.
        const label = document.createElement('label');
        label.htmlFor = marketId;
        label.textContent = capitalize(marketName);
        label.className = 'market-checkbox-label';

        // Lógica de seleção única:
        checkbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                selectedMarket = marketName; // Armazena o mercado selecionado.
                // Itera sobre TODOS os checkboxes e desmarca todos, exceto o que foi clicado.
                marketCheckboxesUI.querySelectorAll('.market-checkbox-input').forEach(cb => {
                    if (cb !== checkbox) {
                        cb.checked = false;
                    }
                });
                // Esconde a área de "Adicionar Novo Mercado".
                newMarketArea.style.display = 'none';
                addNewMarketBtn.style.display = 'block';
                newMarketInput.value = '';
            } else {
                selectedMarket = null; // Se desmarcar o único selecionado, reseta.
            }
        });

        // Adiciona o checkbox e o label ao wrapper, e o wrapper à área de checkboxes.
        wrapper.appendChild(checkbox);
        wrapper.appendChild(label);
        marketCheckboxesUI.appendChild(wrapper);
    });
};

/**
 * Processa a confirmação de compra, registra o preço/mercado/detalhe e remove o item da lista.
 */
const confirmBuyHandler = async () => {
    const pricePaidStr = priceInput.value;
    const isPromo = promoCheckbox.checked;
    // Converte o preço para número, trocando ',' por '.' para garantir o parse correto.
    const pricePaid = parseFloat(pricePaidStr.replace(',', '.')); 
    // Obtém o detalhe da compra do campo de input (Ex: '2kg', '10un').
    const purchaseDetails = purchaseDetailsInput.value.trim(); 

    if (!pricePaid || pricePaid <= 0) {
        alert("Por favor, insira um preço válido.");
        return;
    }

    let marketName = selectedMarket; // Começa assumindo que um mercado existente foi selecionado.

    // 1. Lógica para NOVO MERCADO
    if (newMarketArea.style.display === 'block') {
        let newMarketInputTrimmed = newMarketInput.value.trim();
        
        if (!newMarketInputTrimmed) {
            alert("Por favor, insira o nome do novo mercado.");
            return;
        }

        marketName = newMarketInputTrimmed.toLowerCase(); // Normaliza o nome do novo mercado.
        
        try {
            // Adiciona o novo mercado à coleção de mercados.
            await addDoc(MARKETS_COLLECTION, {
                nome: marketName,
                timestamp: serverTimestamp(),
            });
            // O listener de mercados irá automaticamente atualizar o cache e os filtros.
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
        // Consulta o histórico para ver se o produto já existe.
        const itemRefQuery = query(PRODUCTS_COLLECTION, where('nome', '==', currentItemName), limit(1));
        const itemSnapshot = await getDocs(itemRefQuery);
        // Cria um objeto para armazenar os campos a serem atualizados.
        let updateFields = { ultimaCompra: serverTimestamp() };

        if (!itemSnapshot.empty) {
            // O produto já existe no histórico: ATUALIZAÇÃO.
            const productDocRef = doc(PRODUCTS_COLLECTION, itemSnapshot.docs[0].id);
            const productData = itemSnapshot.docs[0].data();
            
            // Se for promoção e o preço pago for MENOR que o melhor preço de promoção atual:
            const currentPromoPrice = productData.melhorPrecoPromo || Infinity;
            if (isPromo && pricePaid < currentPromoPrice) {
                updateFields.melhorPrecoPromo = pricePaid;
                updateFields.melhorMercadoPromo = marketName;
                updateFields.melhorDetalhePromo = purchaseDetails; // NOVO: Salva o detalhe da compra.
            }

            // Se for preço regular e o preço pago for MENOR que o melhor preço regular atual:
            const currentRegularPrice = productData.melhorPrecoRegular || Infinity;
            if (!isPromo && pricePaid < currentRegularPrice) {
                updateFields.melhorPrecoRegular = pricePaid;
                updateFields.melhorMercadoRegular = marketName;
                updateFields.melhorDetalheRegular = purchaseDetails; // NOVO: Salva o detalhe da compra.
            }

            await updateDoc(productDocRef, updateFields); // Executa a atualização no Firestore.
        } else {
            // O produto não existe no histórico: CRIAÇÃO.
            const productData = {
                nome: currentItemName,
                // Define os campos com base se é promoção ou não.
                melhorPrecoPromo: isPromo ? pricePaid : null,
                melhorMercadoPromo: isPromo ? marketName : null,
                melhorDetalhePromo: isPromo ? purchaseDetails : null, // NOVO: Detalhe
                melhorPrecoRegular: !isPromo ? pricePaid : null,
                melhorMercadoRegular: !isPromo ? marketName : null,
                melhorDetalheRegular: !isPromo ? purchaseDetails : null, // NOVO: Detalhe
                ultimaCompra: serverTimestamp()
            };
            await addDoc(PRODUCTS_COLLECTION, productData); // Adiciona o novo registro.
        }

        // 4. REMOVE ITEM DA LISTA DE COMPRAS ATUAL
        if (currentItemId) {
            const shoppingItemRef = doc(SHOPPING_LIST_COLLECTION, currentItemId);
            await deleteDoc(shoppingItemRef); // Deleta o item da lista (foi comprado!).
        }

        priceInput.blur(); // Remove o foco do input.
        closeBuyModal(); // Fecha o modal.
    } catch (error) {
        console.error("Erro ao registrar compra:", error);
        alert("Não foi possível registrar a compra. Verifique sua conexão.");
    }
};

// =================================================================
// 5. FUNÇÕES DE RENDERIZAÇÃO E LISTENERS (FIREBASE & UI)
// =================================================================

/**
 * Renderiza os botões/tags de filtro de mercado.
 */
const renderMarketFilters = () => {
    marketFilterAreaUI.innerHTML = ''; // Limpa os filtros existentes.
    
    // Cria uma lista de todos os mercados, começando com a opção 'TODOS'.
    let allMarkets = ['TODOS', ...marketListCache]; 
    
    allMarkets.forEach(market => {
        // Ignora a chave interna 'SEM_MERCADO' na interface (o usuário não precisa ver isso).
        if (market === 'SEM_MERCADO') return;

        const tag = document.createElement('div');
        tag.className = 'filter-market-tag';
        tag.textContent = capitalize(market).replace('_', ' '); // Exibe o nome capitalizado.
        tag.dataset.market = market; // Armazena o valor do filtro como um atributo de dado.

        // Adiciona a classe 'active' se este for o filtro selecionado.
        if (market === currentFilterMarket) {
            tag.classList.add('active');
        }

        tag.addEventListener('click', () => {
            // Se o mercado clicado for diferente do atual:
            if (currentFilterMarket !== market) {
                currentFilterMarket = market; // Define o novo filtro.
                // Dispara a re-renderização da lista de compras para aplicar o novo filtro.
                setupShoppingListListener(); 
            }
            // Re-renderiza os próprios filtros para atualizar o estado 'active' (cor de fundo).
            renderMarketFilters();
        });

        marketFilterAreaUI.appendChild(tag);
    });
};

/**
 * Configura o listener do Firestore para os Mercados (MARKETS_COLLECTION).
 */
const setupMarketsListener = () => {
    // Se já houver um listener ativo, o cancela.
    if (unsubscribeMarkets) {
        unsubscribeMarkets();
    }

    // Cria uma consulta que ordena os mercados por nome.
    const q = query(MARKETS_COLLECTION, orderBy('nome'));
    
    // onSnapshot: Monitora a coleção em tempo real.
    unsubscribeMarkets = onSnapshot(q, (snapshot) => {
        marketListCache = []; // Limpa o cache.
        snapshot.forEach(doc => {
            // Adiciona o nome de cada mercado ao cache.
            marketListCache.push(doc.data().nome);
        });
        
        // Renderiza os botões de filtro na interface.
        renderMarketFilters(); 

    }, (error) => {
        console.error("Erro no Listener de Mercados:", error);
    });
};

/**
 * Configura o listener do Firestore para o Histórico de Produtos (PRODUCTS_COLLECTION).
 */
const setupProductHistoryListener = () => {
    // Consulta o histórico de produtos ordenado por nome.
    const q = query(PRODUCTS_COLLECTION, orderBy('nome'));
    
    // onSnapshot: Monitora a coleção em tempo real.
    onSnapshot(q, (snapshot) => {
        productCache.clear(); // Limpa o cache de produtos.
        snapshot.forEach(doc => {
            const product = { ...doc.data(), id: doc.id };
            // Armazena cada produto no cache usando o nome como chave.
            productCache.set(product.nome, product);
        });
        
        // Dispara a re-renderização de outras partes que dependem do histórico.
        renderProductHistory(activeShoppingItems); 
        setupShoppingListListener(); // Garante que a lista principal reflita os novos preços.
        renderMarketFilters(); // Garante que filtros sejam atualizados.
        

    }, (error) => {
        console.error("Erro no Listener do Histórico de Produtos:", error);
    });
};

/**
 * Renderiza os itens do histórico de produtos na UI.
 * @param {Set<string>} activeItems - Nomes dos itens que estão atualmente na lista de compras.
 */
const renderProductHistory = (activeItems) => {
    
    productHistoryUI.innerHTML = ''; // Limpa a área do histórico.
    
    // Converte o Map de cache para um Array e o ordena alfabeticamente.
    const sortedProducts = Array.from(productCache.values()).sort((a, b) => a.nome.localeCompare(b.nome));

    sortedProducts.forEach((product) => {
        const productName = product.nome;
        // Verifica se o item do histórico já está na lista ativa.
        const isItemActive = activeItems.has(productName);

        // Cria a estrutura HTML (wrapper, label/tag, e botão de exclusão).
        const tag = document.createElement('div');
        tag.className = 'product-tag-wrapper';
        
        const label = document.createElement('label');
        label.className = 'product-tag';

        // Desabilita a tag (muda a cor) se o item já estiver na lista.
        if (isItemActive) {
            label.classList.add('disabled-tag');
        }

        const displayName = capitalize(productName);
        const checkboxDisabledAttr = isItemActive ? 'disabled' : '';
        const checkboxCheckedAttr = isItemActive ? 'checked' : '';

        // Monta o HTML interno do label (checkbox + nome).
        label.innerHTML = `
            <input type="checkbox" ${checkboxDisabledAttr} ${checkboxCheckedAttr}>
            <span>${displayName}</span>
        `;
        
        // Listener de clique para adicionar o item à lista.
        label.addEventListener('click', async (e) => {
            // Se o clique foi no botão de exclusão, ignora esta função.
            if (e.target.closest('.delete-history-btn')) {
                return;
            }

            e.preventDefault(); // Impede o comportamento padrão do label/checkbox (que pode causar problemas).
            
            // Verifica o estado ATUAL antes de tentar adicionar.
            if (activeItems.has(productName)) {
                return; 
            }
            
            // Tenta adicionar o item.
            await addFromHistory(productName);
            // O listener do Firestore cuidará de desabilitar o checkbox após a confirmação do banco.
        });
        
        // Cria o botão de exclusão do histórico.
        const deleteButton = document.createElement('button');
        deleteButton.className = 'delete-history-btn';
        deleteButton.innerHTML = '🗑️';
        deleteButton.title = `Excluir '${displayName}' do histórico de preços`;
        deleteButton.onclick = (e) => {
            e.stopPropagation(); // Impede que o clique no botão de excluir ative a função de clique do label (acima).
            deleteProductFromHistory(productName);
        };
        
        // Adiciona os elementos à área do histórico.
        tag.appendChild(label);
        tag.appendChild(deleteButton);
        productHistoryUI.appendChild(tag);
    });
};


/**
 * Configura o listener principal do Firestore para a Lista de Compras Atual (SHOPPING_LIST_COLLECTION).
 * Aplica o filtro e ordena no lado do cliente.
 */
const setupShoppingListListener = () => {
    // Cancela o listener anterior, se houver.
    if (unsubscribeShoppingList) {
        unsubscribeShoppingList(); 
    }

    // Consulta básica para a coleção da lista de compras (sem filtros iniciais no Firestore).
    const q = query(SHOPPING_LIST_COLLECTION); 

    // onSnapshot: Monitora a coleção em tempo real.
    unsubscribeShoppingList = onSnapshot(q, (snapshot) => {

        let shoppingItems = [];
        const currentActiveItems = new Set();
        
        // Processa todos os documentos da lista de compras.
        snapshot.docs.forEach(doc => {
            const item = { ...doc.data(), id: doc.id }; // Cria um objeto com os dados do item e seu ID.
            shoppingItems.push(item);
            currentActiveItems.add(item.nome); // Adiciona o nome ao Set de itens ativos.
        });
        activeShoppingItems = currentActiveItems; // Atualiza o estado global de itens ativos.

        // 1. FILTRAGEM (Lógica de Filtro no Cliente)
        if (currentFilterMarket !== 'TODOS') {
             shoppingItems = shoppingItems.filter(item => {
                const bestMarket = getBestRegularMarket(item.nome);
                
                // Define as condições para que o item apareça:
                const isCurrentMarket = bestMarket === currentFilterMarket;
                const isNoMarketItem = bestMarket === 'SEM_MERCADO';

                // O item aparece se for do mercado selecionado OU se não tiver mercado/histórico.
                return isCurrentMarket || isNoMarketItem;
             });
        }
        
        // 2. ORDENAÇÃO POR MELHOR MERCADO REGULAR
        shoppingItems.sort((a, b) => {
            const marketA = getBestRegularMarket(a.nome);
            const marketB = getBestRegularMarket(b.nome);
            
            // Prioridade 1: SEM MERCADO vai para o final.
            if (marketA === 'SEM_MERCADO' && marketB !== 'SEM_MERCADO') return 1;
            if (marketA !== 'SEM_MERCADO' && marketB === 'SEM_MERCADO') return -1;
            
            // Prioridade 2: Ordem Alfabética por nome do Mercado.
            if (marketA < marketB) return -1;
            if (marketA > marketB) return 1;

            // Prioridade 3: Ordem Alfabética por Nome do Item (para itens no mesmo mercado).
            if (a.nome < b.nome) return -1;
            if (a.nome > b.nome) return 1;

            return 0; // Se forem iguais, mantém a ordem.
        });


        // 3. RENDERIZAÇÃO DA LISTA FILTRADA E ORDENADA
        shoppingListUI.innerHTML = ''; // Limpa a lista na interface.
        
        if (shoppingItems.length === 0) {
            // Caso especial: Lista vazia após filtragem.
            const message = document.createElement('li');
            message.className = 'shopping-item';
            
            if (currentFilterMarket === 'TODOS') {
                message.innerHTML = `<div class="item-info"><span class="item-name">🎉 Lista vazia! Que tal adicionar algo?</span></div>`;
            } else {
                 message.innerHTML = `<div class="item-info"><span class="item-name">✅ Nada para comprar no ${capitalize(currentFilterMarket)}.</span></div>`;
            }
            shoppingListUI.appendChild(message);
        } else {
             // Itera sobre a lista de itens filtrada e ordenada.
             shoppingItems.forEach((item) => {
                const itemId = item.id;
                const itemName = item.nome;
                const itemNameDisplay = capitalize(itemName);
                
                const productData = productCache.get(itemName);
                const bestPriceHint = formatPriceHint(productData); // Obtém a dica de preço (agora inclui os detalhes).
                const bestMarket = getBestRegularMarket(itemName);

                const li = document.createElement('li');
                li.id = `item-${itemId}`;
                li.className = 'shopping-item';
                
                // Adiciona uma classe especial para estilização (marcação visual) de itens sem histórico.
                if (bestMarket === 'SEM_MERCADO') {
                     li.classList.add('no-market-item');
                }

                // Monta a estrutura HTML do item da lista.
                li.innerHTML = `
                    <div class="item-info">
                        <span class="item-name">${itemNameDisplay}</span>
                        <span class="price-hint">${bestPriceHint}</span>
                    </div>
                    <button class="delete-button" onclick="deleteItem('${itemId}')">Remover / Comprei</button>
                    <button class="buy-button" onclick="markAsBought('${itemId}', '${itemName}')">Ajustar</button>
                `;

                shoppingListUI.appendChild(li);
            });
        }
        
        // É crucial re-renderizar o histórico aqui para garantir que os checkboxes
        // de itens recém-adicionados fiquem desabilitados (status "ativo/desabilitado").
        renderProductHistory(activeShoppingItems);

    }, (error) => {
        console.error("Erro no Listener principal do Firestore:", error);
        shoppingListUI.innerHTML = `<li style="color: red;">Erro ao carregar a lista de compras.</li>`;
    });
};

// =================================================================
// 6. CONFIGURAÇÃO DOS EVENT LISTENERS INICIAIS
// =================================================================

// Expõe funções globais: permite que as funções JavaScript sejam chamadas
// diretamente a partir dos atributos 'onclick="..."' no código HTML.
window.markAsBought = openBuyModal;
window.deleteItem = deleteItem;

// Garante que o bloco de inicialização seja executado apenas uma vez.
if (!window.isShoppingListInitialized) {

    // --- Listeners para Adicionar Item ---
    // Ouve o clique no botão "Adicionar à Lista".
    addButton.addEventListener('click', addItem);
    // Ouve a tecla 'Enter' no campo de nome e chama a função de adicionar.
    itemNameInput.addEventListener('keyup', (event) => {
        if (event.key === 'Enter') addItem();
    });

    // --- Listeners do Modal ---
    // Ouve o clique no botão "Confirmar" do modal.
    confirmBuyButton.addEventListener('click', confirmBuyHandler);
    // Ouve o clique no botão "X" de fechar.
    closeButton.addEventListener('click', closeBuyModal);
    // Ouve o clique em qualquer lugar da janela. Se o clique for no fundo (fora do modal), fecha o modal.
    window.addEventListener('click', (event) => {
        if (event.target === buyModal) {
            closeBuyModal();
        }
    });

    // --- Listener para o botão de 'Adicionar Novo Mercado' ---
    addNewMarketBtn.addEventListener('click', () => {
        newMarketArea.style.display = 'block'; // Mostra o campo de novo mercado.
        addNewMarketBtn.style.display = 'none'; // Esconde o botão.
        newMarketInput.focus(); // Coloca o cursor no novo campo.
        
        // Desmarca todos os checkboxes existentes.
        marketCheckboxesUI.querySelectorAll('.market-checkbox-input').forEach(cb => {
            cb.checked = false;
        });
        selectedMarket = null; // Reseta o mercado selecionado.
    });

    // --- Inicialização dos Listeners do Firebase ---
    // Inicia a escuta dos mercados.
    setupMarketsListener(); 
    // Inicia a escuta do histórico de produtos (que por sua vez, inicia a lista de compras).
    setupProductHistoryListener(); 
    
    // Marca a inicialização como concluída.
    window.isShoppingListInitialized = true;

} else {
    // Mensagem de aviso se o código tentar inicializar duas vezes.
    console.warn("Inicialização de listeners bloqueada.");
}
