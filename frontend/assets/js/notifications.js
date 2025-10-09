import { $ } from './utils.js';

class NotificationManager {
    constructor() {
        this.notificationPanel = $('.notification-panel');
        this.maxNotifications = 5;
        this.init();
    }

    init() {
        console.log('🔔 Simple notifications ready');
        this.setupPanel();
        this.setupWebSocket();
    }

    setupPanel() {
        if (!this.notificationPanel) return;
        
        this.notificationPanel.innerHTML = `
            <div class="notification-tabs" id="notificationTabs"></div>
        `;
    }

    setupWebSocket() {
        if (!window.socket) {
            setTimeout(() => this.setupWebSocket(), 1000);
            return;
        }

        window.socket.addEventListener('message', (event) => {
            try {
                const data = JSON.parse(event.data);
                
                switch (data.type) {
                    case 'user_registered':
                        this.showNotification(`🎉 ${data.data.username} just joined!`, 'user_registered');
                        break;
                    case 'user_logged_in':
                        this.showNotification(`🟢 ${data.data.username} is now online`, 'user_login');
                        break;
                    case 'user_logged_out':
                        this.showNotification(`⚫ ${data.data.username} went offline`, 'user_logout');
                        break;
                    case 'new_private_message':
                        if (data.data.from_user_id !== window.currentUser?.id) {
                            this.showNotification(`💬 New message from ${data.data.username}`, 'new_message');
                        }
                        break;
                }
            } catch (error) {
                console.log('Notification error:', error);
            }
        });
    }

    showNotification(message, type) {
        const notificationTabs = $('#notificationTabs');
        if (!notificationTabs) return;

        // Remove oldest if too many
        const tabs = notificationTabs.querySelectorAll('.notification-tab');
        if (tabs.length >= this.maxNotifications) {
            tabs[0].remove();
        }

        // Create simple tab
        const tab = document.createElement('div');
        tab.className = `notification-tab notification-${type}`;
        tab.innerHTML = `
            <div class="tab-content">
                <div class="tab-message">${message}</div>
            </div>
        `;

        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (tab.parentElement) {
                tab.remove();
            }
        }, 5000);

        notificationTabs.appendChild(tab);
    }
}

const notificationManager = new NotificationManager();
export default notificationManager;