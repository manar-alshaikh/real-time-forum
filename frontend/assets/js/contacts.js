import { $, $$, apiGet, apiPost, emit, socket, timeAgo, escapeHTML } from './utils.js';
import privateChatManager from './private_chat.js';

class ContactsManager {
    constructor() {
        this.contacts = new Map();
        this.currentUser = null;
        this.currentUserId = null;
        this.currentFilter = 'all';
        this.activeChat = null;
        this.isInitialized = false;
        this.pendingContacts = [];
        this.unreadCounts = new Map();
        this.setupMessageActivityListener();
        this.setupUserChangeHandler();
        this.init();
    }

    setupUserChangeHandler() {
        
        document.addEventListener('userLoggedIn', () => {
            this.handleUserChange();
        });
        
        document.addEventListener('userLoggedOut', () => {
            this.handleUserChange();
        });
    }

    handleUserChange() {
        console.log('ContactsManager: User changed, reinitializing...');
        this.cleanup();
        
        
        setTimeout(() => {
            this.initializeUserAndContacts();
        }, 100);
    }

    cleanup() {
        console.log('ContactsManager: Cleaning up all data');
        
        this.contacts.clear();
        this.currentUser = null;
        this.currentUserId = null;
        this.activeChat = null;
        this.isInitialized = false;
        this.unreadCounts.clear();
        this.saveUnreadCounts();
        
        
        const contactsContainer = $('.private-messages-scroll');
        if (contactsContainer) {
            contactsContainer.innerHTML = '';
        }
        
        
        this.removeActiveContactHighlight();
        
        
        this.pendingContacts = [];
    }

    async init() {
        this.setupWebSocketHandlers();
        this.setupFilterHandlers();
        this.setupChatToggleHandlers();
        
        
        this.loadPersistedUnreadCounts();

        await this.initializeUserAndContacts();

        this.setupPeriodicRefresh();
    }

    loadPersistedUnreadCounts() {
        try {
            const stored = localStorage.getItem('privateChatUnreadCounts');
            if (stored) {
                const counts = JSON.parse(stored);
                this.unreadCounts = new Map(Object.entries(counts).map(([key, value]) => [parseInt(key), value]));
            }
        } catch (error) {
            console.error('Failed to load persisted unread counts:', error);
            this.unreadCounts = new Map();
        }
    }

    saveUnreadCounts() {
        try {
            const counts = Object.fromEntries(this.unreadCounts);
            localStorage.setItem('privateChatUnreadCounts', JSON.stringify(counts));
        } catch (error) {
            console.error('Failed to save unread counts:', error);
        }
    }

    getUnreadCount(userId) {
        return this.unreadCounts.get(userId) || 0;
    }

    setUnreadCount(userId, count) {
        if (count > 0) {
            this.unreadCounts.set(userId, count);
        } else {
            this.unreadCounts.delete(userId);
        }
        this.saveUnreadCounts();
        
        
        this.updateCounterBadge(userId);
    }

    incrementUnreadCount(userId) {
        const currentCount = this.getUnreadCount(userId);
        const newCount = currentCount + 1;
        this.setUnreadCount(userId, newCount);
        return newCount;
    }

    resetUnreadCount(userId) {
        this.setUnreadCount(userId, 0);
    }

    updateCounterBadge(userId) {
        const contactElement = $(`.contact[data-user-id="${userId}"]`);
        if (!contactElement) {
            setTimeout(() => this.updateCounterBadge(userId), 500);
            return;
        }

        this.removeCounterBadge(userId);

        const unreadCount = this.getUnreadCount(userId);
        if (unreadCount > 0) {
            const counter = document.createElement('span');
            counter.className = 'unread-counter';
            
            if (unreadCount < 10) {
                counter.classList.add('single-digit');
            } else if (unreadCount < 100) {
                counter.classList.add('double-digit');
            } else {
                counter.classList.add('triple-digit');
            }
            
            counter.textContent = unreadCount > 99 ? '99+' : unreadCount.toString();
            contactElement.style.position = 'relative';
            contactElement.appendChild(counter);
        }
    }

    removeCounterBadge(userId) {
        const contactElement = $(`.contact[data-user-id="${userId}"]`);
        if (!contactElement) return;

        const existingCounter = contactElement.querySelector('.unread-counter');
        if (existingCounter) {
            existingCounter.remove();
        }
    }

    refreshAllCounterBadges() {
        this.unreadCounts.forEach((count, userId) => {
            if (count > 0) {
                this.updateCounterBadge(userId);
            }
        });
    }

    setupMessageActivityListener() {
        document.addEventListener('messageActivity', (event) => {
            const { userId, timestamp } = event.detail;
            this.updateContactOrderAfterMessage(userId, timestamp);
        });
    }

    async initializeUserAndContacts() {
        try {
            
            this.cleanup();
            
            console.log('ContactsManager: Fetching current user...');
            const userFetched = await this.fetchCurrentUser();

            if (!userFetched) {
                console.log('ContactsManager: No user logged in, waiting...');
                setTimeout(() => this.initializeUserAndContacts(), 1000);
                return;
            }

            console.log('ContactsManager: Loading contacts for user:', this.currentUser);
            await this.loadContacts();
            this.isInitialized = true;

            
            document.dispatchEvent(new CustomEvent('contactsManagerReady', {
                detail: {
                    currentUserId: this.currentUserId,
                    currentUser: this.currentUser
                }
            }));

            console.log('ContactsManager: Initialization complete');

        } catch (error) {
            console.error('ContactsManager: Failed to initialize:', error);
            setTimeout(() => this.initializeUserAndContacts(), 2000);
        }
    }

    async fetchCurrentUser() {
        try {
            const data = await apiGet('/api/session');

            if (data.success && data.message) {
                this.currentUser = data.message;
                this.currentUserId = await this.getUserIdFromUsername(data.message);
                
                if (!this.currentUserId) {
                    console.error('ContactsManager: Failed to get user ID for:', this.currentUser);
                    return false;
                }

                window.currentUser = this.currentUser;
                window.currentUserId = this.currentUserId;
                
                console.log('ContactsManager: Current user set to:', this.currentUser, 'ID:', this.currentUserId);
                return true;
            } else {
                console.log('ContactsManager: No active session');
                this.currentUser = null;
                this.currentUserId = null;
                return false;
            }
        } catch (error) {
            console.error('ContactsManager: Failed to fetch current user:', error);
            this.currentUser = null;
            this.currentUserId = null;
            return false;
        }
    }

    async getUserIdFromUsername(username) {
        try {
            const data = await apiGet(`/api/user/id?username=${encodeURIComponent(username)}`);
            if (data && data.success) {
                return data.user_id;
            } else {
                return null;
            }
        } catch (error) {
            return null;
        }
    }

    async loadContacts() {
        try {
            console.log('ContactsManager: Loading contacts from API...');
            const data = await apiGet('/api/contacts');

            if (data.success && data.contacts && Array.isArray(data.contacts)) {
                console.log('ContactsManager: Received', data.contacts.length, 'contacts');

                const filteredContacts = this.filterOutCurrentUser(data.contacts);
                console.log('ContactsManager: After filtering current user:', filteredContacts.length, 'contacts');

                this.contacts.clear();
                filteredContacts.forEach(contact => {
                    this.contacts.set(contact.user_id, contact);
                });

                this.renderContacts(filteredContacts);
                
                
                this.refreshAllCounterBadges();

            } else {
                console.error('ContactsManager: Contacts API returned invalid data:', data);
                this.showErrorMessage('Failed to load contacts');
            }
        } catch (error) {
            console.error('ContactsManager: Failed to load contacts:', error);
            this.showErrorMessage('Failed to load contacts');
        }
    }

    filterOutCurrentUser(contacts) {
        if (!this.currentUser) {
            console.warn('⚠️ No current user available for filtering');
            return contacts;
        }

        const filtered = contacts.filter(contact => {
            const isCurrentUser = contact.username === this.currentUser;

            return !isCurrentUser;
        });

        const leakedCurrentUser = filtered.find(contact => contact.username === this.currentUser);
        if (leakedCurrentUser) {
            console.error('❌ CRITICAL: Current user leaked through filter!', leakedCurrentUser);
            return filtered.filter(contact => contact.username !== this.currentUser);
        }

        return filtered;
    }

    renderContacts(contacts) {
        const contactsContainer = $('.private-messages-scroll');
        if (!contactsContainer) {
            console.error('Contacts container not found!');
            return;
        }

        contactsContainer.innerHTML = '';

        if (contacts.length === 0) {
            this.showNoContactsMessage(contactsContainer);
            return;
        }

        const filteredContacts = this.applyCurrentFilter(contacts);
        const sortedContacts = this.sortContactsAlphabetically(filteredContacts);

        sortedContacts.forEach(contact => {
            const contactElement = this.createContactElement(contact);
            contactsContainer.appendChild(contactElement);
        });

        if (this.activeChat) {
            this.highlightActiveContact(this.activeChat.user_id);
        }

        
        this.refreshAllCounterBadges();
    }

    sortContactsAlphabetically(contacts) {
        return contacts.sort((a, b) => {
            const hasMessageA = a.last_message_time && a.last_message_time !== '';
            const hasMessageB = b.last_message_time && b.last_message_time !== '';
            
            if (hasMessageA && hasMessageB) {
                const timeA = new Date(a.last_message_time).getTime();
                const timeB = new Date(b.last_message_time).getTime();
                return timeB - timeA;
            }
            
            if (hasMessageA && !hasMessageB) {
                return -1;
            }
            
            if (!hasMessageA && hasMessageB) {
                return 1;
            }
            
            return a.username.localeCompare(b.username);
        });
    }

    applyCurrentFilter(contacts) {
        switch (this.currentFilter) {
            case 'online':
                return contacts.filter(contact => contact.is_online);
            case 'offline':
                return contacts.filter(contact => !contact.is_online);
            case 'all':
            default:
                return contacts;
        }
    }

    showNoContactsMessage(container) {
        let message = '';
        switch (this.currentFilter) {
            case 'online':
                message = 'No online contacts';
                break;
            case 'offline':
                message = 'No offline contacts';
                break;
            case 'all':
            default:
                message = 'No contacts found';
                break;
        }

        container.innerHTML = `<div class="no-contacts">${message}</div>`;
    }

    showErrorMessage(message) {
        const contactsContainer = $('.private-messages-scroll');
        if (contactsContainer) {
            contactsContainer.innerHTML = `<div class="error-message">${escapeHTML(message)}</div>`;
        }
    }

    createContactElement(contact) {
        const contactDiv = document.createElement('div');
        contactDiv.className = 'contact';
        contactDiv.dataset.userId = contact.user_id;

        const statusClass = contact.is_online ? 'status-online' : 'status-offline';
        const statusText = contact.is_online ? 'Online' : 'Offline';

        contactDiv.innerHTML = `
            <div class="contact-avatar">
                ${contact.profile_picture ?
                `<img src="${escapeHTML(contact.profile_picture)}" alt="${escapeHTML(contact.username)}">` :
                '<div class="default-avatar">👤</div>'
            }
                <span class="status-indicator ${statusClass}"></span>
            </div>
            <div class="contact-info">
                <div class="contact-username">${escapeHTML(contact.username)}</div>
                <div class="contact-status">${escapeHTML(statusText)}</div>
            </div>
        `;

        contactDiv.addEventListener('click', () => {
            this.handleContactClick(contact);
        });

        return contactDiv;
    }

    updateContactOrderAfterMessage(userId, timestamp) {
        const contact = this.contacts.get(userId);
        if (!contact) return;

        contact.last_message_time = timestamp;

        
        const currentContacts = Array.from(this.contacts.values());
        const sortedContacts = this.sortContactsAlphabetically(currentContacts);

        const contactsContainer = $('.private-messages-scroll');
        if (!contactsContainer) return;

        
        const contactElements = Array.from(contactsContainer.querySelectorAll('.contact'));
        
        
        contactElements.sort((a, b) => {
            const aUserId = parseInt(a.dataset.userId);
            const bUserId = parseInt(b.dataset.userId);
            
            const aIndex = sortedContacts.findIndex(contact => contact.user_id === aUserId);
            const bIndex = sortedContacts.findIndex(contact => contact.user_id === bUserId);
            
            return aIndex - bIndex;
        });

        
        contactElements.forEach(element => {
            contactsContainer.appendChild(element);
        });
    }

    setupWebSocketHandlers() {
        if (!socket) {
            console.error('WebSocket not available');
            return;
        }

        socket.addEventListener('message', (event) => {
            try {
                const data = JSON.parse(event.data);

                switch (data.type) {
                    case 'user_registered':
                        this.handleNewUser(data.data);
                        break;
                    case 'user_online_status':
                        this.handleUserOnlineStatus(data.data);
                        break;
                    case 'user_authenticated':
                        this.initializeUserAndContacts();
                        break;
                    case 'new_private_message':
                        
                        this.handlePrivateMessageForCurrentUser(data.data);
                        break;
                }
            } catch (error) {
                console.error('Error parsing WebSocket message:', error);
            }
        });
    }

    handlePrivateMessageForCurrentUser(messageData) {
        console.log('ContactsManager handling private message:', messageData);
        
        const isForCurrentUser = 
            messageData.to_user_id === this.currentUserId || 
            messageData.from_user_id === this.currentUserId;
        
        if (!isForCurrentUser) {
            return;
        }        
        
        this.handleNewPrivateMessage(messageData);
        
        
        if (messageData.to_user_id === this.currentUserId && 
            messageData.from_user_id !== this.currentUserId &&
            !this.isChatOpenWithUser(messageData.from_user_id)) {
            
            console.log('Dispatching notification event for message');
            document.dispatchEvent(new CustomEvent('newPrivateMessage', {
                detail: messageData
            }));
            
            this.incrementUnreadCount(messageData.from_user_id);
        }
    }

    
    isChatOpenWithUser(userId) {
        if (!this.activeChat) return false;
        return this.activeChat.user_id === userId;
    }

    handleNewPrivateMessage(messageData) {
        const otherUserId = messageData.from_user_id === this.currentUserId ?
            messageData.to_user_id : messageData.from_user_id;

        this.updateContactOrderAfterMessage(otherUserId, messageData.created_at);
    }

    setupFilterHandlers() {
        const allFilter = $('#allMessages');
        const onlineFilter = $('#onlineMessages');
        const offlineFilter = $('#offlineMessages');

        if (!allFilter || !onlineFilter || !offlineFilter) {
            console.error('Filter elements not found');
            return;
        }

        let lastClickTime = 0;
        let lastClickedFilter = null;

        const handleFilterClick = (filterType, event) => {
            const currentTime = Date.now();
            const isDoubleClick = (currentTime - lastClickTime < 300) && (lastClickedFilter === filterType);

            if (isDoubleClick) {
                this.currentFilter = 'all';
                allFilter.checked = true;
            } else {
                this.currentFilter = filterType;
            }

            lastClickTime = currentTime;
            lastClickedFilter = filterType;

            const currentContacts = Array.from(this.contacts.values());
            this.renderContacts(currentContacts);

            if (isDoubleClick) {
                event.preventDefault();
            }
        };

        allFilter.addEventListener('click', (e) => handleFilterClick('all', e));
        onlineFilter.addEventListener('click', (e) => handleFilterClick('online', e));
        offlineFilter.addEventListener('click', (e) => handleFilterClick('offline', e));
    }

    setupChatToggleHandlers() {
        const closeChatBtn = $('#closeChatBtn');
        if (closeChatBtn) {
            closeChatBtn.addEventListener('click', () => {
                this.closePrivateChat();
            });
        }

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && this.activeChat) {
                this.closePrivateChat();
            }
        });
    }

    handleContactClick(contact) {
        if (this.activeChat && this.activeChat.user_id === contact.user_id) {
            this.closePrivateChat();
        } else {
            this.startPrivateChat(contact);
        }
    }

    startPrivateChat(contact) {
        this.activeChat = contact;
        
        
        this.resetUnreadCount(contact.user_id);
        
        if (window.privateChatNotifications) {
            window.privateChatNotifications.handleChatOpened(contact.user_id);
        }
        
        
        document.dispatchEvent(new CustomEvent('chatOpened', {
            detail: { userId: contact.user_id }
        }));
        
        privateChatManager.openChat(contact);
        this.showChatSection(contact);
    }

    showChatSection(contact) {
        const postsSection = $('#postsSection');
        const chatSection = $('#privateChatSection');
        const chatContactName = $('#chatContactName');
        const chatContactAvatar = $('#chatContactAvatar');

        if (postsSection && chatSection && chatContactName && chatContactAvatar) {
            postsSection.style.display = 'none';
            chatSection.style.display = 'block';

            chatContactName.textContent = contact.username;
            chatContactName.style.color = 'white';

            if (contact.profile_picture) {
                chatContactAvatar.innerHTML = `<img src="${escapeHTML(contact.profile_picture)}" alt="${escapeHTML(contact.username)}" class="chat-avatar-img">`;
            } else {
                chatContactAvatar.innerHTML = `<div class="default-avatar">👤</div>`;
            }

            this.highlightActiveContact(contact.user_id);
        }
    }

    closePrivateChat() {
        if (this.activeChat) {
            
            document.dispatchEvent(new CustomEvent('chatClosed', {
                detail: { userId: this.activeChat.user_id }
            }));
        }
        
        this.activeChat = null;
        privateChatManager.closeChat();
        this.showPostsSection();
        this.removeActiveContactHighlight();
    }

    showPostsSection() {
        const postsSection = $('#postsSection');
        const chatSection = $('#privateChatSection');

        if (postsSection && chatSection) {
            postsSection.style.display = 'block';
            chatSection.style.display = 'none';
        }
    }

    highlightActiveContact(userId) {
        this.removeActiveContactHighlight();
        const activeContact = $(`.contact[data-user-id="${userId}"]`);
        if (activeContact) {
            activeContact.classList.add('active-contact');
        }
    }

    removeActiveContactHighlight() {
        const activeContacts = $$('.contact.active-contact');
        activeContacts.forEach(contact => {
            contact.classList.remove('active-contact');
        });
    }

    setupPeriodicRefresh() {
        setInterval(() => {
            if (this.isInitialized) {
                this.loadContacts();
            }
        }, 30000);
    }

    handleNewUser(newUser) {
        if (!this.currentUser || newUser.username === this.currentUser) {
            return;
        }

        this.contacts.set(newUser.user_id, newUser);
        const currentContacts = Array.from(this.contacts.values());
        this.renderContacts(currentContacts);
    }

    handleUserOnlineStatus(statusData) {
        if (!this.currentUser || statusData.username === this.currentUser) {
            return;
        }

        const contact = this.contacts.get(statusData.user_id);

        if (contact) {
            contact.is_online = statusData.is_online;
            const currentContacts = Array.from(this.contacts.values());
            this.renderContacts(currentContacts);
        } else {
            this.loadContacts();
        }
    }

    refreshContacts() {
        this.loadContacts();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.contactsManager = new ContactsManager();
});

export default ContactsManager;
