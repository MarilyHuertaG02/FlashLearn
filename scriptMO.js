const modeToggleBtn = document.getElementById('mode-toggle');
const body = document.body;
const modeIcon = document.getElementById('mode-icon');

const lightModeIconUrl = 'img/modo-de-luz.png'; // Reemplaza por tu URL
const darkModeIconUrl = 'img/modo-nocturno.png'; // Reemplaza por tu URL

// Función para aplicar el modo guardado
function applySavedMode() {
    const savedMode = localStorage.getItem('theme');
    if (savedMode === 'dark') {
        body.classList.add('dark-mode');
        body.classList.remove('light-mode');
        modeIcon.src = darkModeIconUrl;
        modeIcon.alt = 'Modo Oscuro';
    } else {
        body.classList.add('light-mode');
        body.classList.remove('dark-mode');
        modeIcon.src = lightModeIconUrl;
        modeIcon.alt = 'Modo Claro';
    }
}

// Escuchar el clic para cambiar el modo
modeToggleBtn.addEventListener('click', () => {
    if (body.classList.contains('light-mode')) {
        body.classList.remove('light-mode');
        body.classList.add('dark-mode');
        localStorage.setItem('theme', 'dark');
        modeIcon.src = darkModeIconUrl;
        modeIcon.alt = 'Modo Oscuro';
    } else {
        body.classList.remove('dark-mode');
        body.classList.add('light-mode');
        localStorage.setItem('theme', 'light');
        modeIcon.src = lightModeIconUrl;
        modeIcon.alt = 'Modo Claro';
    }
});

// Aplicar el modo al cargar la página
document.addEventListener('DOMContentLoaded', applySavedMode);