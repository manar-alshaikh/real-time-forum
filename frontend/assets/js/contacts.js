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
        this.setupMessageActivityListener();
    this.init();
}

// Add this method
setupMessageActivityListener() {
    document.addEventListener('messageActivity', (event) => {
        const { userId, timestamp } = event.detail;
        console.log('Message activity event received for user:', userId);
        this.updateContactOrderAfterMessage(userId, timestamp);
    });
}

    async init() {
        console.log('ContactsManager initializing...');

        // Set up handlers first
        this.setupWebSocketHandlers();
        this.setupFilterHandlers();
        this.setupChatToggleHandlers();

        // Then load data in sequence
        await this.initializeUserAndContacts();

        this.setupPeriodicRefresh();
    }

// In ContactsManager class, after successful initialization

async initializeUserAndContacts() {
    try {
        // Step 1: Get current user first
        await this.fetchCurrentUser();

        if (!this.currentUser) {
            setTimeout(() => this.initializeUserAndContacts(), 1000);
            return;
        }

        console.log('Current user confirmed:', this.currentUser);

        // Step 2: Now load contacts with current user available
        await this.loadContacts();

        this.isInitialized = true;
        console.log('ContactsManager fully initialized');

        // ✅ EMIT READY EVENT
        document.dispatchEvent(new CustomEvent('contactsManagerReady', {
            detail: {
                currentUserId: this.currentUserId,
                currentUser: this.currentUser
            }
        }));
        console.log('📢 ContactsManager ready event dispatched');

    } catch (error) {
        console.error('Failed to initialize contacts manager:', error);
        setTimeout(() => this.initializeUserAndContacts(), 2000);
    }
}

async fetchCurrentUser() {
    try {
        console.log('Fetching current user from session...');
        const data = await apiGet('/api/session');
        console.log('Session API response:', data);

        if (data.success && data.message) {
            this.currentUser = data.message;
            
            // Get user ID using the fixed endpoint
            this.currentUserId = await this.getUserIdFromUsername(data.message);
            
            if (!this.currentUserId) {
                console.error('❌ Failed to get user ID for current user');
                return false;
            }

            // Store globally for other modules
            window.currentUser = this.currentUser;
            window.currentUserId = this.currentUserId;

            console.log('✅ Current user set:', this.currentUser, 'ID:', this.currentUserId);
            return true;
        } else {
            console.error('❌ No user in session or API returned failure');
            return false;
        }
    } catch (error) {
        console.error('Failed to fetch current user:', error);
        return false;
    }
}

   async getUserIdFromUsername(username) {
    try {
        const data = await apiGet(`/api/user/id?username=${encodeURIComponent(username)}`);
        if (data && data.success) {
            console.log('✅ Got user ID for', username, ':', data.user_id);
            return data.user_id;
        } else {
            console.error('❌ Failed to get user ID for', username);
            return null;
        }
    } catch (error) {
        console.error('Failed to get user ID:', error);
        return null;
    }
}

    async loadContacts() {
        try {
            console.log('Loading contacts...');
            const data = await apiGet('/api/contacts');
            console.log('Contacts API raw data:', data);

            if (data.success && data.contacts && Array.isArray(data.contacts)) {
                console.log(`📞 Raw contacts from API: ${data.contacts.length}`);

                // Immediately filter out current user
                const filteredContacts = this.filterOutCurrentUser(data.contacts);
                console.log(`✅ Contacts after filtering: ${filteredContacts.length}`);

                // Clear and store contacts
                this.contacts.clear();
                filteredContacts.forEach(contact => {
                    this.contacts.set(contact.user_id, contact);
                });

                // Render immediately
                this.renderContacts(filteredContacts);

            } else {
                console.error('Contacts API returned invalid data');
                this.showErrorMessage('Failed to load contacts');
            }
        } catch (error) {
            console.error('Failed to load contacts:', error);
            this.showErrorMessage('Failed to load contacts');
        }
    }

    filterOutCurrentUser(contacts) {
        if (!this.currentUser) {
            console.warn('⚠️ No current user available for filtering');
            return contacts; // Return all if no current user (shouldn't happen)
        }

        const filtered = contacts.filter(contact => {
            const isCurrentUser = contact.username === this.currentUser;
            if (isCurrentUser) {
                console.log(`🚫 Filtering out current user: ${contact.username}`);
            }
            return !isCurrentUser;
        });

        // Safety check
        const leakedCurrentUser = filtered.find(contact => contact.username === this.currentUser);
        if (leakedCurrentUser) {
            console.error('❌ CRITICAL: Current user leaked through filter!', leakedCurrentUser);
            // Force remove
            return filtered.filter(contact => contact.username !== this.currentUser);
        }

        console.log(`✅ Successfully filtered contacts. Before: ${contacts.length}, After: ${filtered.length}`);
        return filtered;
    }

    renderContacts(contacts) {
        const contactsContainer = $('.private-messages-scroll');
        if (!contactsContainer) {
            console.error('Contacts container not found!');
            return;
        }

        console.log(`🎨 Rendering ${contacts.length} contacts with filter: ${this.currentFilter}`);

        // Clear container
        contactsContainer.innerHTML = '';

        if (contacts.length === 0) {
            this.showNoContactsMessage(contactsContainer);
            return;
        }

        // Apply filter and sort
        const filteredContacts = this.applyCurrentFilter(contacts);
        const sortedContacts = this.sortContactsAlphabetically(filteredContacts);

        console.log(`📋 Final contacts to render: ${sortedContacts.length}`);

        // Render each contact
        sortedContacts.forEach(contact => {
            const contactElement = this.createContactElement(contact);
            contactsContainer.appendChild(contactElement);
        });

        // Update active contact highlighting
        if (this.activeChat) {
            this.highlightActiveContact(this.activeChat.user_id);
        }

        console.log('✅ Contacts rendered successfully');
    }

sortContactsAlphabetically(contacts) {
    return contacts.sort((a, b) => {
        const hasMessageA = a.last_message_time && a.last_message_time !== '';
        const hasMessageB = b.last_message_time && b.last_message_time !== '';
        
        // If both contacts have messages, sort by most recent message
        if (hasMessageA && hasMessageB) {
            const timeA = new Date(a.last_message_time).getTime();
            const timeB = new Date(b.last_message_time).getTime();
            return timeB - timeA; // Most recent first (descending order)
        }
        
        // If only A has messages, A comes first
        if (hasMessageA && !hasMessageB) {
            return -1;
        }
        
        // If only B has messages, B comes first
        if (!hasMessageA && hasMessageB) {
            return 1;
        }
        
        // If neither has messages, sort alphabetically
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
  console.log('Updating contact order for user:', userId, 'with timestamp:', timestamp);

  const contact = this.contacts.get(userId);
  if (!contact) return;

  // bump last activity so sorter moves it up
  contact.last_message_time = timestamp;

  // re-render using your existing flow (sorting happens inside renderContacts)
  const currentContacts = Array.from(this.contacts.values());
  this.renderContacts(currentContacts);

  const container = document.querySelector('.private-messages-scroll');
  const first = container && container.querySelector('.contact');
  if (first && Number(first.dataset.userId) === Number(userId)) {
    // prevent stacking if multiple messages land quickly
    // const existing = first.querySelector(':scope > .pm-red-dot');
    if (existing) existing.remove();

    // const dot = document.createElement('span');
    // dot.className = 'pm-red-dot';
    // first.appendChild(dot);

    // auto remove
    // setTimeout(() => dot.remove(), 1500);
  }

  console.log('✅ Contact order updated for:', contact.username);
}


    // Update the WebSocket handler to listen for new messages
    setupWebSocketHandlers() {
        if (!socket) {
            console.error('WebSocket not available');
            return;
        }

        console.log('Setting up WebSocket handlers...');

        socket.addEventListener('message', (event) => {
            try {
                const data = JSON.parse(event.data);
                console.log('WebSocket message:', data);

                switch (data.type) {
                    case 'user_registered':
                        this.handleNewUser(data.data);
                        break;
                    case 'user_online_status':
                        this.handleUserOnlineStatus(data.data);
                        break;
                    case 'user_authenticated':
                        console.log('User authenticated via WebSocket, reloading contacts...');
                        this.initializeUserAndContacts();
                        break;
                    case 'new_private_message':
                        this.handleNewPrivateMessage(data.data);
                        break;
                }
            } catch (error) {
                console.error('Error parsing WebSocket message:', error);
            }
        });
    }
    handleNewPrivateMessage(messageData) {
        console.log('New private message received for contact ordering:', messageData);

        // Determine which contact this message is from/to
        const otherUserId = messageData.from_user_id === this.currentUserId ?
            messageData.to_user_id : messageData.from_user_id;

        // Update the contact order with the new message timestamp
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
                console.log('Double click: Reset to all contacts');
            } else {
                this.currentFilter = filterType;
                console.log(`Filter changed to: ${filterType}`);
            }

            lastClickTime = currentTime;
            lastClickedFilter = filterType;

            // Re-render with current contacts
            const currentContacts = Array.from(this.contacts.values());
            this.renderContacts(currentContacts);

            if (isDoubleClick) {
                event.preventDefault();
            }
        };

        allFilter.addEventListener('click', (e) => handleFilterClick('all', e));
        onlineFilter.addEventListener('click', (e) => handleFilterClick('online', e));
        offlineFilter.addEventListener('click', (e) => handleFilterClick('offline', e));

        console.log('Filter handlers setup complete');
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
        console.log('Opening chat with:', contact.username);
        this.activeChat = contact;
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

        // ✅ Update contact name
        chatContactName.textContent = contact.username;
        chatContactName.style.color = 'white';

        // ✅ Update contact avatar
        if (contact.profile_picture) {
            chatContactAvatar.innerHTML = `<img src="${escapeHTML(contact.profile_picture)}" alt="${escapeHTML(contact.username)}" class="chat-avatar-img">`;
        } else {
            chatContactAvatar.innerHTML = `<div class="default-avatar">👤</div>`;
        }

        this.highlightActiveContact(contact.user_id);
    }
    }

    closePrivateChat() {
        console.log('Closing private chat');
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
        // Refresh contacts every 30 seconds
        setInterval(() => {
            if (this.isInitialized) {
                console.log('Periodic contacts refresh...');
                this.loadContacts();
            }
        }, 30000);
    }

    handleNewUser(newUser) {
        if (!this.currentUser || newUser.username === this.currentUser) {
            console.log('Ignoring new user event for current user');
            return;
        }

        console.log('New user registered:', newUser.username);
        this.contacts.set(newUser.user_id, newUser);
        const currentContacts = Array.from(this.contacts.values());
        this.renderContacts(currentContacts);
    }

    handleUserOnlineStatus(statusData) {
        if (!this.currentUser || statusData.username === this.currentUser) {
            console.log('Ignoring status update for current user');
            return;
        }

        console.log('User status update:', statusData);
        const contact = this.contacts.get(statusData.user_id);

        if (contact) {
            contact.is_online = statusData.is_online;
            const currentContacts = Array.from(this.contacts.values());
            this.renderContacts(currentContacts);
        } else {
            // Contact not found, reload all contacts
            this.loadContacts();
        }
    }

    // Public method to force refresh contacts (can be called from other modules)
    refreshContacts() {
        console.log('Manual contacts refresh requested');
        this.loadContacts();
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 DOM loaded, starting ContactsManager...');
    window.contactsManager = new ContactsManager(); // Make it globally accessible
});

export default ContactsManager;