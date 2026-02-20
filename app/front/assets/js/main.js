// Inteiramente feito com o cursor somente para estudo de como integrar o chatbot, banco de dados e frontend. 

// // ============================================
// // CONFIGURAÇÃO DO BACKEND
// // ============================================
// const API_BASE_URL = 'http://localhost:3000'; // Ajuste conforme backend

// // ============================================
// // ESTADO DA APLICAÇÃO
// // ============================================
// let currentChatId = null; // ID da conversa atual
// let currentMessages = []; // Mensagens da conversa atual

// // ============================================
// // ELEMENTOS DO DOM
// // ============================================
// const chatMessages = document.getElementById('chatMessages');
// const userInput = document.getElementById('userInput');
// const sendBtn = document.getElementById('sendBtn');
// const newChatBtn = document.querySelector('.new-chat-btn');
// const historyList = document.getElementById('historyList');
// const chatTitle = document.getElementById('chatTitle');

// // ============================================
// // INICIALIZAÇÃO
// // ============================================
// document.addEventListener('DOMContentLoaded', () => {
//     loadChatHistory();
//     setupEventListeners();
//     createNewChat();
// });

// // ============================================
// // EVENT LISTENERS
// // ============================================
// function setupEventListeners() {
//     // Enviar mensagem
//     sendBtn.addEventListener('click', handleSendMessage);
//     userInput.addEventListener('keypress', (e) => {
//         if (e.key === 'Enter' && !e.shiftKey) {
//             e.preventDefault();
//             handleSendMessage();
//         }
//     });

//     // Novo chat
//     newChatBtn.addEventListener('click', createNewChat);
// }

// // ============================================
// // GERENCIAMENTO DE CHAT
// // ============================================

// /**
//  * Cria uma nova conversa
//  */
// async function createNewChat() {
//     try {
//         // Limpa a interface
//     currentChatId = null;
//     currentMessages = [];
//     chatMessages.innerHTML = '';
//     chatTitle.textContent = 'Novo Planejamento';
//     userInput.value = '';
//     userInput.focus();

//     // Cria nova conversa no backend
//     const response = await fetch(`${API_BASE_URL}/api/chats`, {
//         method: 'POST',
//         headers: {
//             'Content-Type': 'application/json',
//         },
//         body: JSON.stringify({
//             title: 'Novo Planejamento',
//             createdAt: new Date().toISOString()
//         })
//     });

//     if (response.ok) {
//         const data = await response.json();
//         currentChatId = data.chatId || data.id;
//         chatTitle.textContent = data.title || 'Novo Planejamento';
        
//         // Recarrega histórico
//         loadChatHistory();
//     } else {
//         console.warn('Erro ao criar chat no backend, usando modo local');
//         // Fallback: cria ID local temporário
//         currentChatId = `local_${Date.now()}`;
//     }
//     } catch (error) {
//         console.error('Erro ao criar novo chat:', error);
//         // Fallback: cria ID local temporário
//         currentChatId = `local_${Date.now()}`;
//     }
// }

// /**
//  * Carrega uma conversa específica do histórico
//  */
// async function loadChat(chatId) {
//     try {
//         const response = await fetch(`${API_BASE_URL}/api/chats/${chatId}`);
        
//         if (!response.ok) {
//             throw new Error('Chat não encontrado');
//         }

//         const chatData = await response.json();
        
//         // Atualiza estado
//         currentChatId = chatData.id || chatData.chatId;
//         currentMessages = chatData.messages || [];
//         chatTitle.textContent = chatData.title || 'Planejamento';

//         // Renderiza mensagens
//         renderMessages(currentMessages);

//         // Atualiza histórico
//         loadChatHistory();
//     } catch (error) {
//         console.error('Erro ao carregar chat:', error);
//         alert('Erro ao carregar conversa. Tente novamente.');
//     }
// }

// /**
//  * Salva mensagem no backend
//  */
// async function saveMessage(sender, content) {
//     if (!currentChatId) {
//         // Se não tem chatId, cria um novo chat primeiro
//         await createNewChat();
//     }

//     const message = {
//         sender: sender, // 'user' ou 'ai'
//         content: content,
//         timestamp: new Date().toISOString()
//     };

//     try {
//         const response = await fetch(`${API_BASE_URL}/api/chats/${currentChatId}/messages`, {
//             method: 'POST',
//             headers: {
//                 'Content-Type': 'application/json',
//             },
//             body: JSON.stringify(message)
//         });

//         if (response.ok) {
//             const data = await response.json();
//             return data;
//         } else {
//             console.warn('Erro ao salvar mensagem no backend');
//             // Fallback: salva localmente
//             saveMessageLocally(message);
//         }
//     } catch (error) {
//         console.error('Erro ao salvar mensagem:', error);
//         // Fallback: salva localmente
//         saveMessageLocally(message);
//     }
// }

// /**
//  * Fallback: salva mensagem no localStorage
//  */
// function saveMessageLocally(message) {
//     const localChats = JSON.parse(localStorage.getItem('agroChats') || '{}');
//     if (!localChats[currentChatId]) {
//         localChats[currentChatId] = {
//             id: currentChatId,
//             title: chatTitle.textContent,
//             messages: [],
//             createdAt: new Date().toISOString()
//         };
//     }
//     localChats[currentChatId].messages.push(message);
//     localStorage.setItem('agroChats', JSON.stringify(localChats));
// }

// // ============================================
// // ENVIO DE MENSAGENS
// // ============================================

// async function handleSendMessage() {
//     const messageText = userInput.value.trim();
//     if (!messageText) return;

//     // Adiciona mensagem do usuário na interface
//     addMessageToUI('user', messageText);
//     userInput.value = '';
//     userInput.focus();

//     // Salva mensagem do usuário
//     await saveMessage('user', messageText);

//     // Atualiza título se for primeira mensagem
//     if (currentMessages.length === 0) {
//         const newTitle = messageText.length > 30 
//             ? messageText.substring(0, 30) + '...' 
//             : messageText;
//         chatTitle.textContent = newTitle;
        
//         // Atualiza título no backend
//         await updateChatTitle(currentChatId, newTitle);
//     }

//     // Mostra indicador de digitação
//     showTypingIndicator();

//     try {
//         // Envia para o backend/IA
//         const response = await fetch(`${API_BASE_URL}/api/chat`, {
//             method: 'POST',
//             headers: {
//                 'Content-Type': 'application/json',
//             },
//             body: JSON.stringify({
//                 message: messageText,
//                 chatId: currentChatId,
//                 history: currentMessages.slice(-10) // Últimas 10 mensagens para contexto
//             })
//         });

//         hideTypingIndicator();

//         if (response.ok) {
//             const data = await response.json();
//             const aiResponse = data.reply || data.message || 'Não consegui processar sua mensagem.';
            
//             // Adiciona resposta da IA
//             addMessageToUI('ai', aiResponse);
//             await saveMessage('ai', aiResponse);
//         } else {
//             throw new Error('Erro na resposta do servidor');
//         }
//     } catch (error) {
//         hideTypingIndicator();
//         console.error('Erro ao enviar mensagem:', error);
//         const errorMsg = 'Erro ao conectar com o servidor. Verifique sua conexão.';
//         addMessageToUI('ai', errorMsg);
//     }
// }

// // ============================================
// // INTERFACE DO CHAT
// // ============================================

// function addMessageToUI(sender, content) {
//     const message = {
//         sender: sender,
//         content: content,
//         timestamp: new Date()
//     };

//     currentMessages.push(message);
//     renderMessage(message);
//     scrollToBottom();
// }

// function renderMessages(messages) {
//     chatMessages.innerHTML = '';
//     messages.forEach(msg => renderMessage(msg));
//     scrollToBottom();
// }

// function renderMessage(message) {
//     const messageRow = document.createElement('div');
//     messageRow.className = `message-row ${message.sender}`;

//     const messageContent = document.createElement('div');
//     messageContent.className = 'message-content';

//     // Avatar
//     const avatar = document.createElement('div');
//     avatar.className = `avatar ${message.sender === 'user' ? 'user-av' : 'ai-av'}`;
    
//     if (message.sender === 'user') {
//         avatar.textContent = 'X';
//     } else {
//         const avatarAi = document.createElement('div');
//         avatarAi.className = 'avatar-ai';
//         const img = document.createElement('img');
//         img.src = 'assets/img/avatar_ai.png';
//         img.alt = 'AgroIA';
//         avatarAi.appendChild(img);
//         avatar.appendChild(avatarAi);
//     }

//     // Texto
//     const textDiv = document.createElement('div');
//     textDiv.className = 'text';
    
//     // Se o conteúdo tiver múltiplas linhas (parágrafos)
//     const paragraphs = message.content.split('\n');
//     paragraphs.forEach(para => {
//         if (para.trim()) {
//             const p = document.createElement('p');
//             p.textContent = para.trim();
//             textDiv.appendChild(p);
//         }
//     });

//     messageContent.appendChild(avatar);
//     messageContent.appendChild(textDiv);
//     messageRow.appendChild(messageContent);
//     chatMessages.appendChild(messageRow);
// }

// function showTypingIndicator() {
//     const typingRow = document.createElement('div');
//     typingRow.className = 'message-row ai';
//     typingRow.id = 'typing-indicator';
    
//     const messageContent = document.createElement('div');
//     messageContent.className = 'message-content';
    
//     const avatar = document.createElement('div');
//     avatar.className = 'avatar ai-av';
//     const avatarAi = document.createElement('div');
//     avatarAi.className = 'avatar-ai';
//     const img = document.createElement('img');
//     img.src = 'assets/img/avatar_ai.png';
//     avatarAi.appendChild(img);
//     avatar.appendChild(avatarAi);
    
//     const textDiv = document.createElement('div');
//     textDiv.className = 'text';
//     textDiv.innerHTML = '<p>AgroIA está digitando<span class="typing-dots">...</span></p>';
    
//     messageContent.appendChild(avatar);
//     messageContent.appendChild(textDiv);
//     typingRow.appendChild(messageContent);
//     chatMessages.appendChild(typingRow);
//     scrollToBottom();
// }

// function hideTypingIndicator() {
//     const indicator = document.getElementById('typing-indicator');
//     if (indicator) {
//         indicator.remove();
//     }
// }

// function scrollToBottom() {
//     chatMessages.scrollTop = chatMessages.scrollHeight;
// }

// // ============================================
// // HISTÓRICO DE CONVERSAS
// // ============================================

// /**
//  * Carrega histórico de conversas do backend
//  */
// async function loadChatHistory() {
//     try {
//         const response = await fetch(`${API_BASE_URL}/api/chats`);
        
//         if (response.ok) {
//             const chats = await response.json();
//             renderChatHistory(chats);
//         } else {
//             throw new Error('Erro ao carregar histórico');
//         }
//     } catch (error) {
//         console.error('Erro ao carregar histórico do backend:', error);
//         // Fallback: carrega do localStorage
//         loadChatHistoryFromLocal();
//     }
// }

// /**
//  * Fallback: carrega histórico do localStorage
//  */
// function loadChatHistoryFromLocal() {
//     const localChats = JSON.parse(localStorage.getItem('agroChats') || '{}');
//     const chats = Object.values(localChats).sort((a, b) => 
//         new Date(b.createdAt || b.updatedAt) - new Date(a.createdAt || a.updatedAt)
//     );
//     renderChatHistory(chats);
// }

// /**
//  * Renderiza o histórico na sidebar
//  */
// function renderChatHistory(chats) {
//     if (!chats || chats.length === 0) {
//         historyList.innerHTML = '<p style="padding: 20px; text-align: center; color: var(--text-secondary);">Nenhuma conversa ainda</p>';
//         return;
//     }

//     // Agrupa conversas por data
//     const grouped = groupChatsByDate(chats);
    
//     historyList.innerHTML = '';

//     // Renderiza por grupos de data
//     Object.keys(grouped).forEach(dateLabel => {
//         const label = document.createElement('p');
//         label.className = 'history-label';
//         label.textContent = dateLabel;
//         historyList.appendChild(label);

//         grouped[dateLabel].forEach(chat => {
//             const item = createHistoryItem(chat);
//             historyList.appendChild(item);
//         });
//     });
// }

// /**
//  * Agrupa conversas por data (Hoje, Ontem, ou data específica)
//  */
// function groupChatsByDate(chats) {
//     const today = new Date();
//     today.setHours(0, 0, 0, 0);
    
//     const yesterday = new Date(today);
//     yesterday.setDate(yesterday.getDate() - 1);

//     const grouped = {};

//     chats.forEach(chat => {
//         const chatDate = new Date(chat.createdAt || chat.updatedAt || Date.now());
//         chatDate.setHours(0, 0, 0, 0);

//         let label;
//         if (chatDate.getTime() === today.getTime()) {
//             label = 'Hoje';
//         } else if (chatDate.getTime() === yesterday.getTime()) {
//             label = 'Ontem';
//         } else {
//             // Formata data: "12 de fevereiro"
//             label = chatDate.toLocaleDateString('pt-BR', {
//                 day: 'numeric',
//                 month: 'long'
//             });
//         }

//         if (!grouped[label]) {
//             grouped[label] = [];
//         }
//         grouped[label].push(chat);
//     });

//     return grouped;
// }

// /**
//  * Cria um item do histórico
//  */
// function createHistoryItem(chat) {
//     const item = document.createElement('div');
//     item.className = 'history-item';
//     item.dataset.chatId = chat.id || chat.chatId;
    
//     // Título da conversa (primeira mensagem ou título salvo)
//     const title = chat.title || 
//                   (chat.messages && chat.messages.length > 0 
//                    ? chat.messages[0].content.substring(0, 30) + '...' 
//                    : 'Sem título');
    
//     item.textContent = title;
//     item.title = title; // Tooltip com título completo

//     // Destaque se for a conversa atual
//     if (chat.id === currentChatId || chat.chatId === currentChatId) {
//         item.classList.add('active');
//     }

//     // Event listener para carregar conversa
//     item.addEventListener('click', () => {
//         loadChat(chat.id || chat.chatId);
//     });

//     return item;
// }

// /**
//  * Atualiza título da conversa no backend
//  */
// async function updateChatTitle(chatId, title) {
//     try {
//         await fetch(`${API_BASE_URL}/api/chats/${chatId}`, {
//             method: 'PATCH',
//             headers: {
//                 'Content-Type': 'application/json',
//             },
//             body: JSON.stringify({ title })
//         });
//     } catch (error) {
//         console.error('Erro ao atualizar título:', error);
//     }
// }
