// utils.js - Utilidades compartidas

// Configurar navegación
export function setupNavigation() {
    const navLinks = document.querySelectorAll('.main-nav ul li');
    navLinks.forEach(link => {
        const anchor = link.querySelector('a');
        if (anchor) {
            anchor.addEventListener('click', (event) => {
                
                // Lógica visual de "activo"
                navLinks.forEach(item => item.classList.remove('active'));
                link.classList.add('active');
                
                // Redirigir si el enlace tiene un href válido
                const href = anchor.getAttribute('href');
                if (href && href !== '#') {
                    window.location.href = href;
                }
            });
        }
    });
}