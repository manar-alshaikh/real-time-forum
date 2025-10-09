import { $, escapeHTML } from './utils.js';

class PrivateChatNotifications {
    constructor() {
        this.notifications = new Map();
        this.setupStyles();
    }

    setupStyles() {
        // Create and inject CSS styles
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
                animation: slideInUp 0.3s ease-out;
                backdrop-filter: blur(10px);
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

            /* Red dot indicator for contacts */
            .pm-red-dot {
                position: absolute;
                top: -2px;
                right: -2px;
                width: 8px;
                height: 8px;
                background-color: #ef4444;
                border-radius: 50%;
                border: 2px solid #1a1a1a;
                animation: pulse 2s infinite;
            }

            @keyframes pulse {
                0% {
                    transform: scale(1);
                    opacity: 1;
                }
                50% {
                    transform: scale(1.2);
                    opacity: 0.7;
                }
                100% {
                    transform: scale(1);
                    opacity: 1;
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
        const chatContactName = $('#chatContactName');
        
        if (!chatSection || !chatContactName) return false;
        
        // Check if chat section is visible and active
        const isChatVisible = chatSection.classList.contains('active') || 
                             chatSection.style.display === 'block';
        
        if (!isChatVisible) return false;
        
        // Get current chat user from contacts manager
        if (window.contactsManager && window.contactsManager.activeChat) {
            return window.contactsManager.activeChat.user_id === userId;
        }
        
        return false;
    }

    // Check if user has unread messages (for red dot)
    hasUnreadMessages(userId) {
        const contactElement = $(`.contact[data-user-id="${userId}"]`);
        if (!contactElement) return false;
        
        return contactElement.querySelector('.pm-red-dot') !== null;
    }

    // Add red dot to contact
    addRedDotToContact(userId) {
        const contactElement = $(`.contact[data-user-id="${userId}"]`);
        if (!contactElement) return;

        // Remove existing red dot if any
        this.removeRedDotFromContact(userId);

        const redDot = document.createElement('span');
        redDot.className = 'pm-red-dot';
        contactElement.style.position = 'relative';
        contactElement.appendChild(redDot);
    }

    // Remove red dot from contact
    removeRedDotFromContact(userId) {
        const contactElement = $(`.contact[data-user-id="${userId}"]`);
        if (!contactElement) return;

        const existingRedDot = contactElement.querySelector('.pm-red-dot');
        if (existingRedDot) {
            existingRedDot.remove();
        }
    }

    // Show notification for new message
    showNotification(messageData) {
        const { from_user_id, username, content, profile_picture } = messageData;

        // Don't show notification if chat is currently open with this user
        if (this.isChatOpenWithUser(from_user_id)) {
            console.log('Chat is open with this user, skipping notification');
            return;
        }

        // Add red dot to contact
        this.addRedDotToContact(from_user_id);

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
                    New Message
                </div>
                <button class="notification-close" onclick="privateChatNotifications.closeNotification('${notificationId}')">×</button>
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

        // Add to document
        document.body.appendChild(notification);
        this.notifications.set(notificationId, notification);

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

    // Handle new message received (to be called from private chat manager)
    handleNewMessage(messageData) {
        // Only show notification if it's not our own message
        if (window.contactsManager && 
            messageData.from_user_id !== window.contactsManager.currentUserId) {
            this.showNotification(messageData);
        }
    }

    // Handle chat opened (to be called when user opens a chat)
    handleChatOpened(userId) {
        // Remove red dot when chat is opened
        this.removeRedDotFromContact(userId);
        
        // Close any active notifications for this user
        this.closeAllNotificationsForUser(userId);
    }

    // Clean up all notifications
    cleanup() {
        this.notifications.forEach((notification, id) => {
            this.closeNotification(id);
        });
        this.notifications.clear();
    }
}

// Create global instance
const privateChatNotifications = new PrivateChatNotifications();
export default privateChatNotifications;