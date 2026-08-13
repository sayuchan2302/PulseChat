export interface DesktopNotificationOptions {
    title: string;
    body: string;
    icon?: string;
    tag?: string;
    onClick?: () => void;
}

class NotificationService {
    public isSupported(): boolean {
        return typeof window !== 'undefined' && 'Notification' in window;
    }

    public getPermission(): NotificationPermission {
        if (!this.isSupported()) return 'denied';
        return Notification.permission;
    }

    public async requestPermission(): Promise<NotificationPermission> {
        if (!this.isSupported()) return 'denied';
        try {
            return await Notification.requestPermission();
        } catch {
            return 'denied';
        }
    }

    public send(options: DesktopNotificationOptions): Notification | null {
        if (!this.isSupported() || Notification.permission !== 'granted') {
            return null;
        }

        try {
            const notification = new Notification(options.title, {
                body: options.body,
                icon: options.icon || '/favicon.svg',
                tag: options.tag || 'chatapp-message',
            });

            notification.onclick = () => {
                try {
                    window.focus();
                } catch {
                    // ignore
                }
                if (options.onClick) {
                    options.onClick();
                }
                notification.close();
            };

            // Auto close after 6 seconds
            setTimeout(() => {
                try {
                    notification.close();
                } catch {
                    // ignore
                }
            }, 6000);

            return notification;
        } catch (err) {
            console.warn('[NotificationService] Failed to send notification:', err);
            return null;
        }
    }
}

export const notificationService = new NotificationService();
