//import { runInThisContext } from "vm";

export class NotificationManager {
    constructor(){
        this.container = this.createContainer();
        this.setupStyles();
    }

    createContainer() {
        let container = document.getElementById('notification-container');
        if(!container) {
            container = document.createElement('div');
            container.id = 'notification-container';
            container.className = 'notification-container';
            document.body.appendChild(container);
        }
        return container;
    }

    setupStyles() {
    }

    show(message, type = 'success', duration = 4000) {
        const notification = document.createElement( 'div');
        notification.className = `notification ${type}`;

        const icons = {
            success: '✓',
            error: '✗',
            warning: '⚠',
        };

        notification.innerHTML = `
        <div class="notification-content">
            <span class="notification-icon">${icons[type] || icons.success}</span>
            <span class="notification-message">${message}</span>
            </div>
            <button class="notification-close" onclick="this.parentElement.remove()">×</button>
        `;

        this.container.appendChild(notification);

        //Auto remove despues del tiempo
        if (duration > 0) {
            setTimeout(() => {
                this.hide(notification);
            }, duration);
        }
        return notification;
    }

    hide(notification) {
        if (notification && notification.parentElement) {
            notification.classList.add('hiding');
            setTimeout(() =>{
                if (notification.parentElement) {
                    notification.parentElement.removeChild(notification);
                }
            }, 300);
        }
    }

    showLoading(message = 'Cargando...') {
        this.hideLoading();

        const overlay = document.createElement('div');
            overlay.className = 'loading-overlay';
            overlay.id = 'global-loading';

            overlay.innerHTML = `
            <div style = "background: white; padding: 20px; border-radius: 12px; text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,0.2);">
                <div class="loading-spinner"></div>
                <p style = margin-top: 15px; color: #333; font-weight: 500;">${message}</p>
                </div>  
            `;

            document.body.appendChild(overlay);
            return overlay;
        }
        hideLoading(){
            const loading = document.getElementById('global-loading');
            if (loading){
                loading.remove();
            }
        }
    }

    //instancia local
    export const notifications = new NotificationManager();