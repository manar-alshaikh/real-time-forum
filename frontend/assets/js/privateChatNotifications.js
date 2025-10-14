import { $, escapeHTML } from './utils.js';

class PrivateChatNotifications {
    constructor() {
        this.notifications = new Map();
        this.unreadCounts = new Map(); 
        this.currentUserId = null;
        this.setupStyles();
        this.setupGlobalHandlers();
        this.setupUserChangeHandler();
        console.log('PrivateChatNotifications initialized');
    }

    setupUserChangeHandler() {
        
        document.addEventListener('userLoggedIn', () => {
            this.handleUserChange();
        });
        
        document.addEventListener('userLoggedOut', () => {
            this.handleUserChange();
        });
        
        document.addEventListener('contactsManagerReady', (event) => {
            this.currentUserId = event.detail.currentUserId;
            console.log('Notifications: User ID updated to', this.currentUserId);
        });
    }

    handleUserChange() {
        console.log('Notifications: User changed, clearing all data');
        this.cleanup();
        
        
        if (window.contactsManager && window.contactsManager.currentUserId) {
            this.currentUserId = window.contactsManager.currentUserId;
        } else {
            this.currentUserId = null;
        }
    }

    setupStyles() {
        const styles = `
            .private-chat-notification {
                position: fixed;
                bottom: 20px;
                right: 20px;
                width: 300px;
                background: linear-gradient(135deg, #1a1a1a, #2d1b69);
                border: 1px solid #7e22ce;
                border-radius: 12px;
                padding: 15px;
                box-shadow: 0 4px 20px rgba(126, 34, 206, 0.3);
                z-index: 10000;
                animation: slideInRight 0.3s ease-out;
                backdrop-filter: blur(10px);
                cursor: pointer;
            }

            .notification-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 10px;
                padding-bottom: 8px;
                border-bottom: 1px solid #333;
            }

            .notification-title {
                font-weight: bold;
                color: #e6ebf3;
                font-size: 14px;
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .notification-close {
                background: none;
                border: none;
                color: #e6ebf3;
                font-size: 18px;
                cursor: pointer;
                padding: 0;
                width: 20px;
                height: 20px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 50%;
                transition: background-color 0.2s;
            }

            .notification-close:hover {
                background-color: rgba(255, 255, 255, 0.1);
            }

            .notification-content {
                color: #e6ebf3;
                font-size: 13px;
                line-height: 1.4;
                margin-bottom: 10px;
                word-wrap: break-word;
            }

            .notification-sender {
                color: #a855f7;
                font-weight: 600;
            }

            .notification-time {
                font-size: 11px;
                color: #888;
                text-align: right;
            }

            .notification-avatar {
                width: 20px;
                height: 20px;
                border-radius: 50%;
                object-fit: cover;
            }

            .default-avatar-small {
                width: 20px;
                height: 20px;
                border-radius: 50%;
                background: linear-gradient(135deg, #7e22ce, #3b0764);
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 10px;
                color: white;
            }

            @keyframes slideInRight {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }

            @keyframes slideOutRight {
                from {
                    transform: translateX(0);
                    opacity: 1;
                }
                to {
                    transform: translateX(100%);
                    opacity: 0;
                }
            }

            .notification-exit {
                animation: slideOutRight 0.3s ease-in forwards;
            }

            .unread-counter {
                position: absolute;
                top: -5px;
                right: -5px;
                min-width: 20px;
                height: 20px;
                background: linear-gradient(135deg, #3b82f6, #1d4ed8);
                border-radius: 10px;
                border: 2px solid #1a1a1a;
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-size: 11px;
                font-weight: bold;
                padding: 0 6px;
                animation: pulse 2s infinite;
                box-shadow: 0 2px 8px rgba(59, 130, 246, 0.4);
            }

            .unread-counter.single-digit {
                min-width: 20px;
            }

            .unread-counter.double-digit {
                min-width: 24px;
            }

            .unread-counter.triple-digit {
                min-width: 28px;
                font-size: 10px;
            }

            @keyframes pulse {
                0% {
                    transform: scale(1);
                    box-shadow: 0 2px 8px rgba(59, 130, 246, 0.4);
                }
                50% {
                    transform: scale(1.05);
                    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.6);
                }
                100% {
                    transform: scale(1);
                    box-shadow: 0 2px 8px rgba(59, 130, 246, 0.4);
                }
            }
        `;

        const styleSheet = document.createElement('style');
        styleSheet.textContent = styles;
        document.head.appendChild(styleSheet);
    }

    setupGlobalHandlers() {
        
        if (window.socket) {
            window.socket.addEventListener('message', (event) => {
                try {
                    const data = JSON.parse(event.data);
                    console.log('Notification WebSocket message:', data);
                    if (data.type === 'new_private_message') {
                        this.handleNewMessage(data.data);
                    }
                } catch (error) {
                    console.error('Error in notification WebSocket handler:', error);
                }
            });
        }

        
        document.addEventListener('newPrivateMessage', (event) => {
            console.log('Notification received custom event:', event.detail);
            this.handleNewMessage(event.detail);
        });

        
        document.addEventListener('chatOpened', (event) => {
            console.log('Chat opened with user:', event.detail.userId);
            this.handleChatOpened(event.detail.userId);
        });

        document.addEventListener('chatClosed', () => {
            console.log('Chat closed');
        });
    }

    isChatOpenWithUser(userId) {
        if (!this.currentUserId) return false;
        
        
        const chatSection = $('#privateChatSection');
        if (!chatSection) return false;
        
        const isVisible = chatSection.style.display !== 'none' && 
                         getComputedStyle(chatSection).display !== 'none';
        
        if (!isVisible) return false;

        
        if (window.contactsManager && window.contactsManager.activeChat) {
            return window.contactsManager.activeChat.user_id === userId;
        }

        return false;
    }

    getUnreadCount(userId) {
        return this.unreadCounts.get(userId) || 0;
    }

    incrementUnreadCount(userId) {
        const currentCount = this.getUnreadCount(userId);
        const newCount = currentCount + 1;
        this.unreadCounts.set(userId, newCount);
        return newCount;
    }

    resetUnreadCount(userId) {
        this.unreadCounts.set(userId, 0);
        this.updateCounterBadge(userId);
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

    calculateNotificationPosition() {
        const existingNotifications = Array.from(document.querySelectorAll('.private-chat-notification'));
        const bottomMargin = 20; 
        const spacing = 10; 
        
        if (existingNotifications.length === 0) {
            return bottomMargin;
        }
        
        return bottomMargin;
    }

    repositionAllNotifications() {
        const existingNotifications = Array.from(document.querySelectorAll('.private-chat-notification'));
        const bottomMargin = 20;
        const spacing = 10;
        
        const sortedNotifications = existingNotifications.sort((a, b) => {
            const aTime = parseInt(a.id.split('-').pop());
            const bTime = parseInt(b.id.split('-').pop());
            return aTime - bTime; 
        });
        
        sortedNotifications.forEach((notification, index) => {
            let position = bottomMargin;
            
            for (let i = index + 1; i < sortedNotifications.length; i++) {
                position += sortedNotifications[i].offsetHeight + spacing;
            }
            
            notification.style.bottom = `${position}px`;
        });
    }

    showNotification(messageData) {
        console.log('Attempting to show notification for:', messageData);
        
        const { from_user_id, username, content, profile_picture } = messageData;

        
        if (this.isChatOpenWithUser(from_user_id)) {
            console.log('❌ Chat is open with this user - NO notifications will be shown');
            return null;
        }

        
        const currentUserId = this.currentUserId || window.contactsManager?.currentUserId;
        if (from_user_id === currentUserId) {
            console.log('Our own message, skipping notification');
            return null;
        }

        
        const newCount = this.incrementUnreadCount(from_user_id);
        this.updateCounterBadge(from_user_id);

        const notificationId = `notification-${from_user_id}-${Date.now()}`;

        const notification = document.createElement('div');
        notification.className = 'private-chat-notification';
        notification.id = notificationId;

        const getUserInitial = (name) => {
            if (!name) return '?';
            return name.charAt(0).toUpperCase();
        };

        notification.innerHTML = `
            <div class="notification-header">
                <div class="notification-title">
                    ${profile_picture ?
                        `<img src="${escapeHTML(profile_picture)}" alt="${escapeHTML(username)}" class="notification-avatar">` :
                        `<div class="default-avatar-small">${getUserInitial(username)}</div>`
                    }
                    New Message ${newCount > 1 ? `(${newCount})` : ''}
                </div>
                <button class="notification-close" data-notification-id="${notificationId}">×</button>
            </div>
            <div class="notification-content">
                From: <span class="notification-sender">${escapeHTML(username)}</span>
            </div>
            <div class="notification-content">
                ${escapeHTML(content.length > 100 ? content.substring(0, 100) + '...' : content)}
            </div>
            <div class="notification-time">
                ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
        `;

        
        const closeButton = notification.querySelector('.notification-close');
        closeButton.addEventListener('click', (e) => {
            e.stopPropagation();
            this.closeNotification(notificationId);
        });

        
        notification.addEventListener('click', () => {
            this.openChatWithUser(from_user_id);
            this.closeNotification(notificationId);
        });

        document.body.appendChild(notification);
        this.notifications.set(notificationId, notification);

        console.log('✅ POPUP NOTIFICATION SHOWN:', notificationId);

        this.repositionAllNotifications();

        
        const autoRemoveTimeout = setTimeout(() => {
            this.closeNotification(notificationId);
        }, 5000);

        notification.dataset.timeoutId = autoRemoveTimeout;

        return notificationId;
    }

    closeNotification(notificationId) {
        const notification = this.notifications.get(notificationId);
        if (!notification) return;

        if (notification.dataset.timeoutId) {
            clearTimeout(parseInt(notification.dataset.timeoutId));
        }

        notification.classList.add('notification-exit');

        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
            this.notifications.delete(notificationId);
            
            this.repositionAllNotifications();
        }, 300);
    }

    closeAllNotificationsForUser(userId) {
        const notificationIds = Array.from(this.notifications.keys()).filter(id => 
            id.includes(`notification-${userId}-`)
        );
        
        notificationIds.forEach(notificationId => {
            this.closeNotification(notificationId);
        });
    }

    openChatWithUser(userId) {
        console.log('Opening chat with user from notification:', userId);
        if (!window.contactsManager) {
            console.error('Contacts manager not available');
            return;
        }

        const contact = window.contactsManager.contacts.get(userId);
        if (contact) {
            window.contactsManager.startPrivateChat(contact);
        } else {
            console.error('Contact not found for user ID:', userId);
            window.contactsManager.loadContacts().then(() => {
                const contactAfterLoad = window.contactsManager.contacts.get(userId);
                if (contactAfterLoad) {
                    window.contactsManager.startPrivateChat(contactAfterLoad);
                }
            });
        }
    }

    handleNewMessage(messageData) {
        console.log('Notification handler received message:', messageData);
        
        const currentUserId = this.currentUserId || window.contactsManager?.currentUserId;
        const isForCurrentUser = messageData.to_user_id === currentUserId;
        const isNotOurMessage = messageData.from_user_id !== currentUserId;
        
        if (isForCurrentUser && isNotOurMessage) {
            
            if (this.isChatOpenWithUser(messageData.from_user_id)) {
                console.log('❌ Chat is open with this user - NO notifications will be shown and NO unread count will be updated');
                return;
            }
            
            console.log('✅ Conditions met - showing POPUP NOTIFICATION and updating unread count for user:', messageData.from_user_id);
            this.showNotification(messageData);
        } else {
            console.log('❌ Not showing notification - conditions not met:', {
                isForCurrentUser,
                isNotOurMessage,
                currentUserId,
                to_user_id: messageData.to_user_id,
                from_user_id: messageData.from_user_id
            });
        }
    }

    handleChatOpened(userId) {        
        console.log('🔄 Handling chat opened - resetting unread count and closing notifications for user:', userId);
        
        
        this.resetUnreadCount(userId);
        
        
        this.closeAllNotificationsForUser(userId);
        
        console.log('✅ Chat opened cleanup completed for user:', userId);
    }

    cleanup() {
        console.log('Notifications: Cleaning up all data');
        
        
        this.notifications.forEach((notification, id) => {
            this.closeNotification(id);
        });
        this.notifications.clear();
        
        
        this.unreadCounts.clear();
        
        
        this.removeAllCounterBadges();
        
        this.currentUserId = null;
    }

    removeAllCounterBadges() {
        const counters = document.querySelectorAll('.unread-counter');
        counters.forEach(counter => counter.remove());
    }

    
    testNotification() {
        
        const chatSection = $('#privateChatSection');
        const isChatOpen = chatSection && (chatSection.style.display !== 'none' || getComputedStyle(chatSection).display !== 'none');
        
        if (isChatOpen) {
            console.log('❌ Cannot test notification - chat is currently open');
            alert('Close the chat first to test notifications!');
            return;
        }

        const testMessage = {
            from_user_id: 999,
            to_user_id: this.currentUserId || window.contactsManager?.currentUserId || 1,
            username: 'Test User',
            content: 'This is a test POPUP notification message! Click me to open chat!',
            profile_picture: ''
        };
        this.showNotification(testMessage);
    }
}

const privateChatNotifications = new PrivateChatNotifications();
window.privateChatNotifications = privateChatNotifications;

window.testNotification = () => {
    privateChatNotifications.testNotification();
};

console.log('PrivateChatNotifications fully loaded with POPUP notifications');

export default privateChatNotifications;
