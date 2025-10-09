import { $, $$, apiGet, apiPost, emit, socket, escapeHTML } from './utils.js';
import { EmojiPicker } from './emojiPicker.js';

const INITIAL_MESSAGES_COUNT = 20;
const MESSAGES_PER_LOAD = 15;

class PrivateChatManager {
    constructor() {
        this.currentChat = null;
        this.messages = [];
        this.currentPage = 1;
        this.hasMoreMessages = true;
        this.isLoading = false;
        this.isLoadingOlderMessages = false;
        this.typingUsers = new Set();
        this.typingTimeout = null;
        this.pendingMessageIds = new Set();
        this.currentUserId = null;
        this.typingActivationTimeout = null;
        this.typingInactivityTimeout = null;
        this.typingKeepAliveInterval = null;
        this.isCurrentlyTyping = false;
        this.emojiPicker = new EmojiPicker();
        this.init();
    }

    init() {
        console.log('PrivateChatManager initializing...');
        this.setCurrentUserId();
        this.setupEventListeners();
        this.setupWebSocketHandlers();
        this.setupScrollListener();
        this.setupEmojiPicker();
    }

    setCurrentUserId() {
        try {
            this.currentUserId = window.currentUser?.id || localStorage.getItem('currentUserId');
            console.log('Current user ID:', this.currentUserId);
        } catch (error) {
            console.error('Failed to get current user ID:', error);
        }
    }

    setupEventListeners() {
        const messageInput = $('#chatMessageInput');
        const sendButton = $('#sendMessageBtn');
        const closeButton = $('#closeChatBtn');

        if (messageInput) {
            messageInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendMessage();
                }
            });

            messageInput.addEventListener('input', (e) => {
                this.resizeTextarea(messageInput);
                if (e.inputType !== 'deleteContentBackward' && e.inputType !== 'deleteContentForward') {
                    this.handleUserInputActivity();
                }
            });

            messageInput.addEventListener('keydown', (e) => {
                if (e.key !== 'Backspace' && e.key !== 'Delete') {
                    this.handleUserInputActivity();
                }

                if (e.key === 'Escape') {
                    this.handleTypingStop();
                    this.emojiPicker.hideEmojiPicker();
                }
            });

            messageInput.addEventListener('blur', () => {
                this.handleTypingStop();
            });

            messageInput.addEventListener('paste', () => {
                this.handleUserInputActivity();
            });
        }

        if (sendButton) {
            sendButton.addEventListener('click', () => this.sendMessage());
        }

        if (closeButton) {
            closeButton.addEventListener('click', () => {
                this.closeChat();
                this.hideChat();
            });
        }
    }

    setupEmojiPicker() {
        this.emojiPicker.setupEmojiPicker((emoji) => {
            this.insertEmoji(emoji);
        });
    }

    insertEmoji(emoji) {
        const messageInput = $('#chatMessageInput');
        if (!messageInput) return;

        const startPos = messageInput.selectionStart;
        const endPos = messageInput.selectionEnd;

        messageInput.value = messageInput.value.substring(0, startPos) +
            emoji +
            messageInput.value.substring(endPos);

        messageInput.selectionStart = messageInput.selectionEnd = startPos + emoji.length;
        messageInput.focus();

        this.handleUserInputActivity();
    }

handleUserInputActivity() {
    if (!this.currentChat || !this.currentChat.is_online) return;

    // Clear existing timeouts
    if (this.typingActivationTimeout) {
        clearTimeout(this.typingActivationTimeout);
    }
    if (this.typingInactivityTimeout) {
        clearTimeout(this.typingInactivityTimeout);
    }

    // Start typing immediately on first input
    if (!this.isCurrentlyTyping) {
        this.handleTypingStart();
    }

    // Reset the inactivity timer
    this.typingInactivityTimeout = setTimeout(() => {
        this.handleTypingStop();
    }, 1000); // Stop typing after 1 second of inactivity
}

handleTypingStart() {
    if (this.isCurrentlyTyping) return;

    this.isCurrentlyTyping = true;
    
    // Send typing start immediately
    apiPost('/api/typing/start', { to_user_id: this.currentChat.user_id })
        .catch(error => console.error('Failed to send typing start:', error));
    
    // Also send a periodic typing indicator every 3 seconds while user is typing
    this.typingKeepAliveInterval = setInterval(() => {
        if (this.isCurrentlyTyping) {
            apiPost('/api/typing/start', { to_user_id: this.currentChat.user_id })
                .catch(error => console.error('Failed to send typing keep-alive:', error));
        }
    }, 3000);
}

handleTypingStop() {
    if (this.typingActivationTimeout) {
        clearTimeout(this.typingActivationTimeout);
        this.typingActivationTimeout = null;
    }
    if (this.typingInactivityTimeout) {
        clearTimeout(this.typingInactivityTimeout);
        this.typingInactivityTimeout = null;
    }
    if (this.typingKeepAliveInterval) {
        clearInterval(this.typingKeepAliveInterval);
        this.typingKeepAliveInterval = null;
    }

    if (this.isCurrentlyTyping) {
        this.isCurrentlyTyping = false;
        apiPost('/api/typing/stop', { to_user_id: this.currentChat.user_id })
            .catch(error => console.error('Failed to send typing stop:', error));
    }
}

    setupScrollListener() {
        const chatMessages = $('#chatMessages');
        if (chatMessages) {
            chatMessages.addEventListener('scroll', () => {
                this.handleMessagesScroll();
            });
        }
    }

    async handleMessagesScroll() {
        const chatMessages = $('#chatMessages');
        if (!chatMessages || !this.currentChat || this.isLoadingOlderMessages || !this.hasMoreMessages) {
            return;
        }

        const scrollTop = chatMessages.scrollTop;
        if (scrollTop <= 100) {
            await this.loadOlderMessages();
        }
    }

    async loadOlderMessages() {
        if (this.isLoadingOlderMessages || !this.hasMoreMessages) return;

        this.isLoadingOlderMessages = true;
        this.showOlderMessagesLoading();

        try {
            const nextPage = this.currentPage + 1;
            const data = await apiGet(
                `/api/private-messages?target_user_id=${this.currentChat.user_id}&page=${nextPage}&limit=${MESSAGES_PER_LOAD}`
            );

            if (data?.success) {
                if (data.messages?.length > 0) {
                    const chatMessages = $('#chatMessages');
                    const scrollPositionBefore = chatMessages.scrollHeight - chatMessages.scrollTop;

                    const olderMessages = data.messages;
                    this.messages = [...olderMessages, ...this.messages];
                    this.currentPage = nextPage;
                    this.hasMoreMessages = data.hasMore;

                    this.prependOlderMessages(olderMessages);

                    requestAnimationFrame(() => {
                        const newScrollHeight = chatMessages.scrollHeight;
                        chatMessages.scrollTop = newScrollHeight - scrollPositionBefore;
                    });

                    this.updateLoadMoreButton();
                } else {
                    this.hasMoreMessages = false;
                    this.hideLoadMoreButton();
                }
            }
        } catch (error) {
            console.error('Failed to load older messages:', error);
            this.showLoadError();
        } finally {
            this.isLoadingOlderMessages = false;
            this.hideOlderMessagesLoading();
        }
    }

    updateLoadMoreButton() {
        const loadMoreIndicator = $('#loadMoreIndicator');
        if (loadMoreIndicator) {
            if (this.hasMoreMessages) {
                loadMoreIndicator.style.display = 'block';
                loadMoreIndicator.innerHTML = `
                    <div class="load-more-content">
                        <button class="load-more-btn" onclick="privateChatManager.loadOlderMessages()">
                            Load older messages
                        </button>
                    </div>
                `;
            } else {
                loadMoreIndicator.style.display = 'none';
            }
        }
    }

    prependOlderMessages(olderMessages) {
        const chatMessages = $('#chatMessages');
        if (!chatMessages) return;

        const loadMoreIndicator = $('#loadMoreIndicator');
        const firstMessage = chatMessages.querySelector('.message');

        olderMessages.forEach(message => {
            const messageElement = this.createMessageElement(message);
            if (firstMessage) {
                chatMessages.insertBefore(messageElement, firstMessage);
            } else if (loadMoreIndicator) {
                chatMessages.insertBefore(messageElement, loadMoreIndicator.nextSibling);
            } else {
                chatMessages.appendChild(messageElement);
            }
        });
    }

    showOlderMessagesLoading() {
        let loadMoreIndicator = $('#loadMoreIndicator');
        if (!loadMoreIndicator) {
            loadMoreIndicator = document.createElement('div');
            loadMoreIndicator.id = 'loadMoreIndicator';
            loadMoreIndicator.className = 'load-more-indicator';
            const chatMessages = $('#chatMessages');
            if (chatMessages.firstChild) {
                chatMessages.insertBefore(loadMoreIndicator, chatMessages.firstChild);
            } else {
                chatMessages.appendChild(loadMoreIndicator);
            }
        }
        loadMoreIndicator.innerHTML = `
            <div class="load-more-content">
                <div class="loading-spinner-small"></div>
                <span>Loading older messages...</span>
            </div>
        `;
    }

    hideOlderMessagesLoading() {
        const loadMoreIndicator = $('#loadMoreIndicator');
        if (loadMoreIndicator && this.hasMoreMessages) {
            loadMoreIndicator.innerHTML = `
                <div class="load-more-content">
                    <button class="load-more-btn" onclick="privateChatManager.loadOlderMessages()">
                        Load older messages
                    </button>
                </div>
            `;
        }
    }

    showLoadError() {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'load-error';
        errorDiv.innerHTML = `
            <div class="load-error-content">
                Failed to load messages. <button onclick="privateChatManager.loadOlderMessages()">Try again</button>
            </div>
        `;

        const chatMessages = $('#chatMessages');
        const loadMoreIndicator = $('#loadMoreIndicator');
        if (loadMoreIndicator) {
            chatMessages.insertBefore(errorDiv, loadMoreIndicator.nextSibling);
        }

        setTimeout(() => errorDiv.remove(), 5000);
    }

    hideLoadMoreButton() {
        const loadMoreIndicator = $('#loadMoreIndicator');
        if (loadMoreIndicator) {
            loadMoreIndicator.style.display = 'none';
        }
    }

    resizeTextarea(textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    }

    setupWebSocketHandlers() {
        if (!socket) {
            console.error('WebSocket not available for private chat');
            return;
        }

        socket.addEventListener('message', (event) => {
            try {
                const data = JSON.parse(event.data);
                switch (data.type) {
                    case 'new_private_message':
                        // QUICK FIX: Ignore our own messages from WebSocket to prevent duplicates
                        if (data.data.from_user_id !== this.currentUserId) {
                            this.handleNewMessage(data.data);
                        }
                        break;
                    case 'user_typing':
                        this.handleUserTyping(data.data);
                        break;
                    case 'user_online_status':
                        this.handleUserOnlineStatus(data.data);
                        break;
                }
            } catch (error) {
                console.error('Error parsing WebSocket message:', error);
            }
        });
    }

    async openChat(contact) {
        this.currentChat = contact;
        this.messages = [];
        this.currentPage = 1;
        this.hasMoreMessages = true;
        this.pendingMessageIds.clear();
        this.isLoadingOlderMessages = false;

        this.updateChatHeader(contact);
        this.clearMessages();
        this.showLoadingIndicator();

        await this.loadInitialMessages();
        this.hideLoadingIndicator();
        this.scrollToBottom();

        this.updateInputFieldStatus(contact.is_online);

        const messageInput = $('#chatMessageInput');
        if (messageInput && contact.is_online) {
            setTimeout(() => messageInput.focus(), 100);
        }

        this.showChat();
    }

    async loadInitialMessages() {
        if (!this.currentChat) return;

        this.isLoading = true;
        try {
            const data = await apiGet(
                `/api/private-messages?target_user_id=${this.currentChat.user_id}&page=1&limit=${INITIAL_MESSAGES_COUNT}`
            );

            if (data?.success) {
                this.messages = data.messages || [];
                this.hasMoreMessages = data.hasMore;
                this.renderInitialMessages();
            } else {
                this.showErrorMessage('Failed to load messages');
            }
        } catch (error) {
            console.error('Failed to load messages:', error);
            this.showErrorMessage('Failed to load messages');
        } finally {
            this.isLoading = false;
            this.hideLoadingIndicator();
        }
    }

    renderInitialMessages() {
        const chatMessages = $('#chatMessages');
        if (!chatMessages) return;

        chatMessages.innerHTML = '';

        if (this.messages.length === 0) {
            this.showNoMessages();
            return;
        }

        if (this.hasMoreMessages) {
            const loadMoreDiv = document.createElement('div');
            loadMoreDiv.id = 'loadMoreIndicator';
            loadMoreDiv.className = 'load-more-indicator';
            loadMoreDiv.innerHTML = `
                <div class="load-more-content">
                    <button class="load-more-btn" onclick="privateChatManager.loadOlderMessages()">
                        Load older messages
                    </button>
                </div>
            `;
            chatMessages.appendChild(loadMoreDiv);
        }

        this.messages.forEach(message => {
            const messageElement = this.createMessageElement(message);
            chatMessages.appendChild(messageElement);
        });

        this.renderTypingIndicator();

        this.scrollToBottom();
    }

    createMessageElement(message) {
        const messageDiv = document.createElement('div');
        const isOwnMessage = message.from_user_id === this.currentUserId;

        messageDiv.className = `message ${isOwnMessage ? 'message-own' : 'message-theirs'}`;
        messageDiv.dataset.messageId = message.id;

        const messageTime = this.formatTime(message.created_at);
        const senderName = message.username || 'Unknown User';

        if (isOwnMessage) {
            messageDiv.innerHTML = `
                <div class="message-content">
                    <div class="message-header">
                        <span class="message-time">${messageTime}</span>
                        <span class="message-sender">You</span>
                    </div>
                    <div class="message-text">${escapeHTML(message.content)}</div>
                </div>
                <div class="message-avatar">
                    ${message.profile_picture ?
                    `<img src="${escapeHTML(message.profile_picture)}" alt="You">` :
                    '<div class="default-avatar">👤</div>'
                }
                </div>
            `;
        } else {
            messageDiv.innerHTML = `
                <div class="message-avatar">
                    ${message.profile_picture ?
                    `<img src="${escapeHTML(message.profile_picture)}" alt="${escapeHTML(senderName)}">` :
                    '<div class="default-avatar">👤</div>'
                }
                </div>
                <div class="message-content">
                    <div class="message-header">
                        <span class="message-sender">${escapeHTML(senderName)}</span>
                        <span class="message-time">${messageTime}</span>
                    </div>
                    <div class="message-text">${escapeHTML(message.content)}</div>
                </div>
            `;
        }

        return messageDiv;
    }

    async sendMessage() {
        const messageInput = $('#chatMessageInput');
        if (!messageInput || !this.currentChat) return;

        if (!this.currentChat.is_online) {
            alert('Cannot send message: User is offline');
            return;
        }

        const content = messageInput.value.trim();
        if (!content) return;

        this.handleTypingStop();

        const tempMessage = {
            id: Date.now(),
            from_user_id: this.currentUserId,
            to_user_id: this.currentChat.user_id,
            content: content,
            message_type: 'text',
            is_read: true,
            created_at: new Date().toISOString(),
            username: 'You'
        };

        // Add the temporary message ID to pending set immediately
        this.pendingMessageIds.add(tempMessage.id);

        this.appendNewMessage(tempMessage);
        messageInput.value = '';
        this.resizeTextarea(messageInput);
        this.scrollToBottom();

        try {
            const data = await apiPost('/api/private-messages/send', {
                to_user_id: this.currentChat.user_id,
                content: content,
                message_type: 'text'
            });

            if (data?.success && data.message) {
                // Remove the temporary message immediately since we'll get it from WebSocket
                this.pendingMessageIds.delete(tempMessage.id);
                this.removeMessageById(tempMessage.id);

                // Add the real message ID to pending set to prevent WebSocket duplication
                this.pendingMessageIds.add(data.message.id);

                // Don't add the message here - wait for WebSocket to deliver it
                // This ensures consistent behavior for all messages
            } else {
                throw new Error('Failed to send message');
            }
        } catch (error) {
            console.error('Error sending message:', error);
            // Remove the temporary message and its ID from pending set
            this.pendingMessageIds.delete(tempMessage.id);
            this.removeMessageById(tempMessage.id);
            alert('Failed to send message. Please try again.');
        }
    }

    appendNewMessage(message) {
        const chatMessages = $('#chatMessages');
        if (!chatMessages) return;

        const messageElement = this.createMessageElement(message);
        chatMessages.appendChild(messageElement);
        this.messages.push(message);

        this.scrollToBottom();
    }

    replaceTempMessage(tempId, realMessage) {
        const chatMessages = $('#chatMessages');
        if (!chatMessages) return;

        const tempElement = chatMessages.querySelector(`[data-message-id="${tempId}"]`);
        if (tempElement) {
            const newElement = this.createMessageElement(realMessage);
            tempElement.replaceWith(newElement);
        }

        const messageIndex = this.messages.findIndex(m => m.id === tempId);
        if (messageIndex !== -1) {
            this.messages[messageIndex] = realMessage;
        }
    }

    removeMessageById(messageId) {
        const chatMessages = $('#chatMessages');
        if (!chatMessages) return;

        const messageElement = chatMessages.querySelector(`[data-message-id="${messageId}"]`);
        if (messageElement) {
            messageElement.remove();
        }

        this.messages = this.messages.filter(m => m.id !== messageId);
    }

    handleNewMessage(message) {
        if (!this.currentChat ||
            (message.from_user_id !== this.currentChat.user_id && message.to_user_id !== this.currentChat.user_id)) {
            return;
        }

        // If this is our own message coming from WebSocket, check if we already processed it
        const isOwnMessage = message.from_user_id === this.currentUserId;

        // Check if this is a pending message (we've already handled it via API response)
        const isPending = this.pendingMessageIds.has(message.id);

        // Check if message already exists in our local messages
        const messageExists = this.messages.some(msg => msg.id === message.id);

        if (isPending) {
            // Remove from pending set and don't display - we've already handled this message
            this.pendingMessageIds.delete(message.id);
            return;
        }

        if (messageExists) {
            // Message already exists, don't add it again
            return;
        }

        this.appendNewMessage(message);

        if (window.contactsManager && message.from_user_id !== this.currentUserId) {
            window.contactsManager.updateContactOrderAfterMessage(
                message.from_user_id,
                message.created_at
            );
        }
    }

    updateInputFieldStatus(isOnline) {
        const messageInput = $('#chatMessageInput');
        const sendButton = $('#sendMessageBtn');

        if (messageInput && sendButton) {
            if (isOnline) {
                messageInput.disabled = false;
                messageInput.placeholder = "Type a message...";
                sendButton.disabled = false;
                messageInput.style.backgroundColor = '#000000ff';
                messageInput.style.color = '#e6ebf3';
                sendButton.style.opacity = '1';
            } else {
                messageInput.disabled = true;
                messageInput.placeholder = "User is offline - cannot send messages";
                sendButton.disabled = true;
                messageInput.style.backgroundColor = '#000000ff';
                 messageInput.style.color = '#e6ebf3';
                sendButton.style.opacity = '0.6';
            }
        }

        this.emojiPicker.updateEmojiButtonStatus(isOnline);
    }

    showChat() {
        const chatSection = $('#privateChatSection');
        const postsSection = $('#postsSection');

        if (chatSection && postsSection) {
            chatSection.classList.add('active');
            postsSection.style.display = 'none';
        }
    }

    hideChat() {
        const chatSection = $('#privateChatSection');
        const postsSection = $('#postsSection');

        if (chatSection && postsSection) {
            chatSection.classList.remove('active');
            postsSection.style.display = 'flex';
        }
    }

    handleUserOnlineStatus(statusData) {
        if (this.currentChat && this.currentChat.user_id === statusData.user_id) {
            this.currentChat.is_online = statusData.is_online;
            this.updateInputFieldStatus(statusData.is_online);
            this.showStatusNotification(statusData.is_online);
        }
    }

    showStatusNotification(isOnline) {
        const chatMessages = $('#chatMessages');
        if (!chatMessages) return;

        const notification = document.createElement('div');
        notification.className = 'status-notification';
        notification.innerHTML = `
            <div class="status-notification-content">
                User is now ${isOnline ? 'online' : 'offline'}
            </div>
        `;

        chatMessages.appendChild(notification);
        setTimeout(() => notification.remove(), 3000);
        this.scrollToBottom();
    }

    handleUserTyping(data) {
        if (!this.currentChat || data.from_user_id !== this.currentChat.user_id) return;

        if (data.is_typing) {
            this.typingUsers.add(data.username);
        } else {
            this.typingUsers.delete(data.username);
        }
        this.renderTypingIndicator();
    }

    renderTypingIndicator() {
        const chatMessages = $('#chatMessages');
        if (!chatMessages) return;

        const existingIndicator = chatMessages.querySelector('.typing-indicator');
        if (existingIndicator) existingIndicator.remove();

        if (this.typingUsers.size > 0 && this.currentChat?.is_online) {
            const typingNames = Array.from(this.typingUsers).join(', ');
            const indicator = document.createElement('div');
            indicator.className = 'typing-indicator message-theirs';
            indicator.innerHTML = `
                <div class="message-avatar">
                    <div class="default-avatar">👤</div>
                </div>
                <div class="typing-content">
                    <div class="typing-text">${typingNames} is typing...</div>
                    <div class="typing-dots">
                        <span></span>
                        <span></span>
                        <span></span>
                    </div>
                </div>
            `;
            chatMessages.appendChild(indicator);
            this.scrollToBottom();
        }
    }

    scrollToBottom() {
        const chatMessages = $('#chatMessages');
        if (chatMessages) {
            setTimeout(() => {
                chatMessages.scrollTop = chatMessages.scrollHeight;
            }, 100);
        }
    }

    updateChatHeader(contact) {
        const chatContactName = $('#chatContactName');
        if (chatContactName) {
            chatContactName.textContent = contact.username;
        }
    }

    clearMessages() {
        const chatMessages = $('#chatMessages');
        if (chatMessages) {
            chatMessages.innerHTML = '';
        }
    }

    showNoMessages() {
        const chatMessages = $('#chatMessages');
        if (chatMessages) {
            chatMessages.innerHTML = `
                <div class="no-messages">
                    <div class="no-messages-icon">💬</div>
                    <div class="no-messages-text">No messages yet</div>
                    <div class="no-messages-subtext">Start the conversation!</div>
                </div>
            `;
        }
    }

    showErrorMessage(message) {
        const chatMessages = $('#chatMessages');
        if (chatMessages) {
            chatMessages.innerHTML = `
                <div class="error-message">
                    <div class="error-icon">⚠️</div>
                    <div class="error-text">${escapeHTML(message)}</div>
                </div>
            `;
        }
    }

    showLoadingIndicator() {
        const chatMessages = $('#chatMessages');
        if (chatMessages) {
            const loadingDiv = document.createElement('div');
            loadingDiv.className = 'loading-indicator';
            loadingDiv.innerHTML = 'Loading messages...';
            chatMessages.appendChild(loadingDiv);
        }
    }

    hideLoadingIndicator() {
        const loadingIndicator = $('#chatMessages .loading-indicator');
        if (loadingIndicator) loadingIndicator.remove();
    }

    formatTime(timestamp) {
        try {
            const date = new Date(timestamp);
            if (isNaN(date.getTime())) return 'Unknown';
            return date.toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
            });
        } catch (error) {
            return 'Unknown';
        }
    }

    closeChat() {
        this.currentChat = null;
        this.messages = [];
        this.typingUsers.clear();
        this.pendingMessageIds.clear();
        this.currentPage = 1;
        this.hasMoreMessages = true;
        this.isLoadingOlderMessages = false;

        this.handleTypingStop();
        this.emojiPicker.close();

        const messageInput = $('#chatMessageInput');
        if (messageInput) {
            messageInput.value = '';
            this.resizeTextarea(messageInput);
        }
    }

    handleMessageSent(message) {
        if (this.currentChat) {
            const event = new CustomEvent('messageActivity', {
                detail: {
                    userId: this.currentChat.user_id,
                    timestamp: message.created_at || new Date().toISOString()
                }
            });
            document.dispatchEvent(event);

            if (window.contactsManager) {
                window.contactsManager.updateContactOrderAfterMessage(
                    this.currentChat.user_id,
                    message.created_at || new Date().toISOString()
                );
            }
        }
    }
}

const privateChatManager = new PrivateChatManager();
export default privateChatManager;