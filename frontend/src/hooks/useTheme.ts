import { useEffect, useState, useCallback } from 'react';

export type ThemeMode = 'light' | 'dark';

const THEME_STORAGE_KEY = 'chat_app_theme';

function getInitialTheme(): ThemeMode {
    if (typeof window === 'undefined') {
        return 'light';
    }

    const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    if (storedTheme === 'dark' || storedTheme === 'light') {
        return storedTheme;
    }

    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
    }

    return 'light';
}

function applyThemeToDocument(theme: ThemeMode) {
    if (typeof document === 'undefined') {
        return;
    }

    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    root.style.colorScheme = theme;
}

export function useTheme() {
    const [theme, setThemeState] = useState<ThemeMode>(() => {
        const initial = getInitialTheme();
        applyThemeToDocument(initial);
        return initial;
    });

    const setTheme = useCallback((newTheme: ThemeMode) => {
        setThemeState(newTheme);
        try {
            localStorage.setItem(THEME_STORAGE_KEY, newTheme);
        } catch {
            // ignore storage errors
        }
        applyThemeToDocument(newTheme);
    }, []);

    const toggleTheme = useCallback(() => {
        setTheme(theme === 'dark' ? 'light' : 'dark');
    }, [setTheme, theme]);

    useEffect(() => {
        applyThemeToDocument(theme);

        const handleStorageChange = (event: StorageEvent) => {
            if (event.key === THEME_STORAGE_KEY && (event.newValue === 'dark' || event.newValue === 'light')) {
                setThemeState(event.newValue);
                applyThemeToDocument(event.newValue);
            }
        };

        window.addEventListener('storage', handleStorageChange);
        return () => {
            window.removeEventListener('storage', handleStorageChange);
        };
    }, [theme]);

    return {
        theme,
        isDark: theme === 'dark',
        setTheme,
        toggleTheme,
    };
}
