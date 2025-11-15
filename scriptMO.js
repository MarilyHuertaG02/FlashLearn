// scriptMO.js - Controlador universal del modo oscuro
class DarkModeManager {
    constructor() {
        this.modeToggleBtn = document.getElementById('mode-toggle');
        this.body = document.body;
        this.modeIcon = document.getElementById('mode-icon');
        
        this.lightModeIconUrl = 'img/modo-de-luz.png';
        this.darkModeIconUrl = 'img/modo-nocturno.png';
        
        this.init();
    }
    
    init() {
        // Aplicar modo guardado al cargar
        document.addEventListener('DOMContentLoaded', () => {
            this.applySavedMode();
        });
        
        // Configurar el botón de toggle si existe
        if (this.modeToggleBtn) {
            this.modeToggleBtn.addEventListener('click', () => {
                this.toggleMode();
            });
        }
    }
    
    applySavedMode() {
        const savedMode = localStorage.getItem('theme');
        if (savedMode === 'dark') {
            this.enableDarkMode();
        } else {
            this.enableLightMode();
        }
    }
    
    enableDarkMode() {
        this.body.classList.add('dark-mode');
        this.body.classList.remove('light-mode');
        
        if (this.modeIcon) {
            this.modeIcon.src = this.darkModeIconUrl;
            this.modeIcon.alt = 'Modo Oscuro';
        }
        
        localStorage.setItem('theme', 'dark');
        this.onModeChange('dark');
    }
    
    enableLightMode() {
        this.body.classList.add('light-mode');
        this.body.classList.remove('dark-mode');
        
        if (this.modeIcon) {
            this.modeIcon.src = this.lightModeIconUrl;
            this.modeIcon.alt = 'Modo Claro';
        }
        
        localStorage.setItem('theme', 'light');
        this.onModeChange('light');
    }
    
    toggleMode() {
        if (this.body.classList.contains('light-mode')) {
            this.enableDarkMode();
        } else {
            this.enableLightMode();
        }
    }
    
    onModeChange(mode) {
        // Disparar evento personalizado para que otros scripts puedan reaccionar
        const event = new CustomEvent('themeChanged', { detail: { mode } });
        document.dispatchEvent(event);
        
        // Actualizar gráficos si existen
        if (window.flashcardsChartInstance && typeof window.flashcardsChartInstance.update === 'function') {
            setTimeout(() => {
                window.flashcardsChartInstance.update();
            }, 100);
        }
    }
    
    // Método para obtener el modo actual
    getCurrentMode() {
        return this.body.classList.contains('dark-mode') ? 'dark' : 'light';
    }
}

// Inicializar el manager
const darkModeManager = new DarkModeManager();

// Exportar para uso global
window.darkModeManager = darkModeManager;