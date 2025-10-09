import { $, escapeHTML } from './utils.js';

class PrivateChatNotifications {
    constructor() {
        this.notifications = new Map();
        this.unreadCounts = new Map(); // Track unread counts per user
        this.setupStyles();
    }

    setupStyles() {
        // Create and inject CSS styles
        const styles = `
            .private-chat-notification {
                position: fixed;
                right: 20px;
                width: 300px;
                background: linear-gradient(135deg, #1a1a1a, #2d1b69);
                border: 1px solid #7e22ce;
                border-radius: 12px;
                padding: 15px;
                box-shadow: 0 4px 20px rgba(126, 34, 206, 0.3);
                z-index: 10000;
                animation: slideInUp 0.3s ease-out;
                backdrop-filter: blur(10px);
                transition: bottom 0.3s ease-out;
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
                padding-left: 110px;
                width: 20px;
                height: 20px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 50%;
                transition: background-color 0.2s;
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

            @keyframes slideInUp {
                from {
                    transform: translateY(100px);
                    opacity: 0;
                }
                to {
                    transform: translateY(0);
                    opacity: 1;
                }
            }

            @keyframes slideOutDown {
                from {
                    transform: translateY(0);
                    opacity: 1;
                }
                to {
                    transform: translateY(100px);
                    opacity: 0;
                }
            }

            .notification-exit {
                animation: slideOutDown 0.3s ease-in forwards;
            }

            /* Blue counter badge for contacts */
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

    // Check if chat is currently open with this user
    isChatOpenWithUser(userId) {
        const chatSection = $('#privateChatSection');
        if (!chatSection) return false;
        
        // Check if chat section is visible
        const isChatVisible = chatSection.classList.contains('active') || 
                             getComputedStyle(chatSection).display === 'block';
        
        if (!isChatVisible) return false;
        
        // Get current chat user from contacts manager
        if (window.contactsManager && window.contactsManager.activeChat) {
            const isSameUser = window.contactsManager.activeChat.user_id === userId;
            console.log(`Chat with user ${userId} is ${isSameUser ? 'OPEN' : 'NOT OPEN'}`);
            return isSameUser;
        }
        
        return false;
    }

    // Get current unread count for a user
    getUnreadCount(userId) {
        return this.unreadCounts.get(userId) || 0;
    }

    // Increment unread count for a user
    incrementUnreadCount(userId) {
        const currentCount = this.getUnreadCount(userId);
        const newCount = currentCount + 1;
        this.unreadCounts.set(userId, newCount);
        return newCount;
    }

    // Reset unread count for a user (when chat is opened)
    resetUnreadCount(userId) {
        this.unreadCounts.set(userId, 0);
    }

    // Update counter badge for contact
    updateCounterBadge(userId) {
        const contactElement = $(`.contact[data-user-id="${userId}"]`);
        if (!contactElement) {
            console.log('Contact element not found for user:', userId, 'retrying...');
            setTimeout(() => this.updateCounterBadge(userId), 500);
            return;
        }

        // Remove existing counter if any
        this.removeCounterBadge(userId);

        const unreadCount = this.getUnreadCount(userId);
        if (unreadCount > 0) {
            const counter = document.createElement('span');
            counter.className = 'unread-counter';
            
            // Add size class based on digit count
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
            console.log('✅ Counter badge updated for user:', userId, 'Count:', unreadCount);
        }
    }

    // Remove counter badge from contact
    removeCounterBadge(userId) {
        const contactElement = $(`.contact[data-user-id="${userId}"]`);
        if (!contactElement) return;

        const existingCounter = contactElement.querySelector('.unread-counter');
        if (existingCounter) {
            existingCounter.remove();
            console.log('✅ Counter badge removed from contact:', userId);
        }
    }

    // Refresh all counter badges
    refreshAllCounterBadges() {
        console.log('🔄 Refreshing all counter badges...');
        this.unreadCounts.forEach((count, userId) => {
            if (count > 0) {
                this.updateCounterBadge(userId);
            }
        });
    }

// Calculate the vertical position for a new notification (newest at bottom)
calculateNotificationPosition() {
    const existingNotifications = Array.from(document.querySelectorAll('.private-chat-notification'));
    const bottomMargin = 20; // Base margin from bottom
    const spacing = 10; // Space between notifications
    
    if (existingNotifications.length === 0) {
        return bottomMargin;
    }
    
    // For the newest notification, always place it at the bottom
    // Older notifications will be positioned above it
    return bottomMargin;
}

// Reposition all notifications when a new one is added or one is removed
repositionAllNotifications() {
    const existingNotifications = Array.from(document.querySelectorAll('.private-chat-notification'));
    const bottomMargin = 20;
    const spacing = 10;
    
    // Sort notifications by their creation time (oldest first)
    const sortedNotifications = existingNotifications.sort((a, b) => {
        const aTime = parseInt(a.id.split('-').pop());
        const bTime = parseInt(b.id.split('-').pop());
        return aTime - bTime; // Oldest first
    });
    
    // Position notifications from bottom to top (newest at bottom)
    sortedNotifications.forEach((notification, index) => {
        let position = bottomMargin;
        
        // Calculate position based on all newer notifications (those with higher indexes)
        for (let i = index + 1; i < sortedNotifications.length; i++) {
            position += sortedNotifications[i].offsetHeight + spacing;
        }
        
        notification.style.bottom = `${position}px`;
    });
}

// Show notification for new message
showNotification(messageData) {
    const { from_user_id, username, content, profile_picture } = messageData;

    console.log('🎯 Checking if should show notification for message from:', username);

    // Don't show notification if chat is currently open with this user
    if (this.isChatOpenWithUser(from_user_id)) {
        console.log('❌ Chat is open with this user, skipping notification');
        return;
    }

    console.log('✅ Showing notification for message from:', username);

    // Increment unread count and update badge
    const newCount = this.incrementUnreadCount(from_user_id);
    this.updateCounterBadge(from_user_id);

    // Generate unique ID for this notification
    const notificationId = `notification-${from_user_id}-${Date.now()}`;

    // Create notification element
    const notification = document.createElement('div');
    notification.className = 'private-chat-notification';
    notification.id = notificationId;

    // Get user initial for default avatar
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

    // Add event listener for close button
    const closeButton = notification.querySelector('.notification-close');
    closeButton.addEventListener('click', () => {
        this.closeNotification(notificationId);
    });

    // Add to document
    document.body.appendChild(notification);
    this.notifications.set(notificationId, notification);

    // Reposition ALL notifications (this will put the new one at the bottom)
    this.repositionAllNotifications();

    // Auto-remove after 5 seconds
    const autoRemoveTimeout = setTimeout(() => {
        this.closeNotification(notificationId);
    }, 5000);

    // Store timeout reference
    notification.dataset.timeoutId = autoRemoveTimeout;

    return notificationId;
}

// Close notification
closeNotification(notificationId) {
    const notification = this.notifications.get(notificationId);
    if (!notification) return;

    // Clear auto-remove timeout
    if (notification.dataset.timeoutId) {
        clearTimeout(parseInt(notification.dataset.timeoutId));
    }

    // Add exit animation
    notification.classList.add('notification-exit');

    // Remove after animation completes
    setTimeout(() => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
        this.notifications.delete(notificationId);
        
        // Recalculate positions for remaining notifications
        this.repositionAllNotifications();
    }, 300);
}

    // Close all notifications for a specific user
    closeAllNotificationsForUser(userId) {
        const notificationIds = Array.from(this.notifications.keys()).filter(id => 
            id.includes(`notification-${userId}-`)
        );
        
        notificationIds.forEach(notificationId => {
            this.closeNotification(notificationId);
        });
    }

    // Handle new message received
    handleNewMessage(messageData) {
        console.log('🔔 Notification system received message:', messageData);
        
        // Double-check: Only show notification if we are the recipient AND it's not our own message
        const isRecipient = messageData.to_user_id === window.contactsManager.currentUserId;
        const isNotOurMessage = messageData.from_user_id !== window.contactsManager.currentUserId;
        
        if (isRecipient && isNotOurMessage) {
            console.log('✅ This is a message TO us from someone else, showing notification');
            this.showNotification(messageData);
        } else {
            console.log('❌ Ignoring message - we are sender or not the recipient');
        }
    }

    // Handle chat opened (to be called when user opens a chat)
    handleChatOpened(userId) {
        console.log('💬 Chat opened with user:', userId);
        
        // Reset unread count and remove counter badge when chat is opened
        this.resetUnreadCount(userId);
        this.removeCounterBadge(userId);
        
        // Close any active notifications for this user
        this.closeAllNotificationsForUser(userId);
    }

    // Clean up all notifications and counters
    cleanup() {
        this.notifications.forEach((notification, id) => {
            this.closeNotification(id);
        });
        this.notifications.clear();
        this.unreadCounts.clear();
    }
}

// Create global instance
const privateChatNotifications = new PrivateChatNotifications();
window.privateChatNotifications = privateChatNotifications;
export default privateChatNotifications;         