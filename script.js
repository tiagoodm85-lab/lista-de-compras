// firebase.js (Versão Final - Modularizada com Firebase v9)
// Este arquivo é o centro de controle que configura a conexão da sua aplicação
// com o serviço de back-end do Google, especificamente:
// 1. O Firebase (o ecossistema de serviços).
// 2. O Firestore (o banco de dados onde seus dados são salvos).

// =================================================================
// 1. IMPORTAÇÕES NECESSÁRIAS DO FIREBASE V9
// =================================================================

// -----------------------------------------------------------------
// MÓDULO PRINCIPAL: firebase-app
// -----------------------------------------------------------------
// 'import' é o comando usado para trazer funções de outros arquivos ou bibliotecas.
// Este import traz a função necessária para ligar o seu código ao seu projeto no Google.
import { 
    initializeApp // Função que inicia a conexão com o Firebase, como ligar o motor.
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";

// -----------------------------------------------------------------
// MÓDULO DE BANCO DE DADOS: firebase-firestore (Firestore)
// -----------------------------------------------------------------
// Este import traz todas as ferramentas necessárias para LER, ESCREVER e MONITORAR
// os dados no banco de dados Firestore.
import { 
    getFirestore,         // Função principal para obter o acesso ao banco de dados.
    collection,           // Usado para apontar para uma 'coleção' (como uma "tabela" de dados).
    doc,                  // Usado para apontar para um 'documento' (um registro ou item específico dentro de uma coleção).
    onSnapshot,           // FUNÇÃO CHAVE: Cria um "ouvinte" em tempo real. Quando um dado muda, sua aplicação é notificada imediatamente.
    query,                // Usado para montar buscas complexas (filtros, ordenação).
    orderBy,              // Uma opção de 'query' para dizer como os resultados devem ser classificados (ex: A-Z).
    where,                // Uma opção de 'query' para aplicar filtros (ex: apenas itens onde o 'mercado' é 'Carrefour').
    limit,                // Uma opção de 'query' para limitar quantos resultados são retornados.
    addDoc,               // Comando para adicionar um NOVO documento (item) a uma coleção.
    updateDoc,            // Comando para modificar campos de um documento que já existe.
    deleteDoc,            // Comando para remover um documento.
    serverTimestamp,      // Um valor especial que garante que o horário registrado é o do servidor do Google (preciso).
    getDocs               // Comando para fazer uma busca única (sem monitoramento em tempo real).
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";


// =================================================================
// 2. CONFIGURAÇÕES (AS CHAVES DO SEU PROJETO)
// =================================================================
// Este objeto (um tipo de variável que armazena informações com nomes)
// contém as credenciais públicas que identificam seu projeto Firebase.
const firebaseConfig = {
    apiKey: "AIzaSyC5vHvRVvhtOOZjXfanQyibodcN4z8NYrE", // Chave de API (como uma senha pública).
    authDomain: "lista-de-compras-399c7.firebaseapp.com",
    projectId: "lista-de-compras-399c7", // ID único do seu projeto.
    storageBucket: "lista-de-compras-399c7.firebasestorage.app",
    messagingSenderId: "255177223099",
    appId: "1:255177223099:web:ce583b7412fe7dddceb29e" 
};

// =================================================================
// 3. INICIALIZAÇÃO
// =================================================================
// 1. Inicializa o aplicativo Firebase com as configurações. O resultado é armazenado em 'app'.
const app = initializeApp(firebaseConfig);
// 2. Usa o aplicativo inicializado ('app') para obter uma referência ao banco de dados Firestore.
// O resultado, armazenado em 'db', será usado para todas as operações de leitura/escrita.
const db = getFirestore(app);

// =================================================================
// 4. REFERÊNCIAS DE COLEÇÕES (EXPORTÁVEIS)
// =================================================================
// 'export' significa que estas variáveis podem ser usadas por outros arquivos (como 'script.js').
// Aqui, criamos referências fáceis de usar para cada "tabela" do nosso banco de dados.

// Coleção para armazenar o histórico de preços dos produtos.
export const PRODUCTS_COLLECTION = collection(db, 'produtos');
// Coleção para armazenar os itens que estão ATUALMENTE na lista de compras.
export const SHOPPING_LIST_COLLECTION = collection(db, 'lista_atual');
// Coleção para armazenar a lista de mercados que o usuário cadastrou.
export const MARKETS_COLLECTION = collection(db, 'mercados');

// =================================================================
// 5. FUNÇÕES DO FIRESTORE (EXPORTÁVEIS)
// =================================================================
// Isso é uma prática para organizar o código: em vez de importar várias funções
// no 'script.js' de módulos diferentes, o 'script.js' importa APENAS o 'firebase.js'
// e já recebe todas as funções que precisa para trabalhar com o banco de dados.
export { 
    doc,
    onSnapshot, 
    query, 
    orderBy, 
    where, 
    limit, 
    addDoc, 
    updateDoc, 
    deleteDoc, 
    serverTimestamp, 
    getDocs 
};
