document.addEventListener('DOMContentLoaded', function() {
    // Elementos del tutorial
    const tutorialOverlay = document.getElementById('tutorial-overlay');
    const tutorialSteps = document.querySelectorAll('.tutorial-step');
    const indicators = document.querySelectorAll('.indicator');
    let currentStep = 1;

    // Mostrar el primer paso inmediatamente
    showStep(1);

    // Funciones para navegar entre pasos
    function showStep(stepNumber) {
        // Ocultar todos los pasos
        tutorialSteps.forEach(step => {
            step.classList.remove('active');
        });
        
        // Mostrar el paso actual
        document.getElementById(`step-${stepNumber}`).classList.add('active');
        
        // Actualizar indicadores
        indicators.forEach(indicator => {
            indicator.classList.remove('active');
            if (parseInt(indicator.getAttribute('data-step')) === stepNumber) {
                indicator.classList.add('active');
            }
        });
        
        currentStep = stepNumber;
    }

    // Event listeners para botones de navegación
    document.getElementById('btn-next-1').addEventListener('click', () => showStep(2));
    document.getElementById('btn-next-2').addEventListener('click', () => showStep(3));
    document.getElementById('btn-next-3').addEventListener('click', () => showStep(4));
    
    document.getElementById('btn-prev-2').addEventListener('click', () => showStep(1));
    document.getElementById('btn-prev-3').addEventListener('click', () => showStep(2));
    document.getElementById('btn-prev-4').addEventListener('click', () => showStep(3));

    // Finalizar tutorial
    function finishTutorial() {
        // Verificar si el usuario marcó "No volver a mostrar"
        const dontShowCheckbox = document.getElementById('dont-show-again') || 
                               document.getElementById('dont-show-again-2') ||
                               document.getElementById('dont-show-again-3') ||
                               document.getElementById('dont-show-again-4');
        
        if (dontShowCheckbox && dontShowCheckbox.checked) {
            localStorage.setItem('dontShowTutorial', 'true');
        }
        
        localStorage.setItem('tutorialCompleted', 'true');
        
        // Redirigir al menú principal con timestamp para evitar cache
        window.location.href = 'menu.html?t=' + new Date().getTime();
    }

    document.getElementById('btn-finish').addEventListener('click', finishTutorial);
    document.getElementById('btn-close-tutorial').addEventListener('click', finishTutorial);
    document.getElementById('skip-tutorial').addEventListener('click', finishTutorial);

    // Sincronizar todos los checkboxes de "No volver a mostrar"
    function syncDontShowCheckboxes() {
        const checkboxes = [
            document.getElementById('dont-show-again'),
            document.getElementById('dont-show-again-2'),
            document.getElementById('dont-show-again-3'),
            document.getElementById('dont-show-again-4')
        ].filter(cb => cb !== null);
        
        checkboxes.forEach(checkbox => {
            checkbox.addEventListener('change', function() {
                checkboxes.forEach(cb => {
                    if (cb !== this) {
                        cb.checked = this.checked;
                    }
                });
            });
        });
    }

    // Inicializar sincronización de checkboxes
    syncDontShowCheckboxes();

    // Navegación por indicadores
    indicators.forEach(indicator => {
        indicator.addEventListener('click', function() {
            const step = parseInt(this.getAttribute('data-step'));
            showStep(step);
        });
    });

    console.log('Tutorial cargado correctamente');
});

// Función para resetear el tutorial (puedes llamarla desde la consola)
function resetTutorial() {
    localStorage.removeItem('dontShowTutorial');
    localStorage.removeItem('tutorialCompleted');
    console.log('Tutorial reseteado. Recarga la página.');
}

// Hacer la función global para poder llamarla desde la consola
window.resetTutorial = resetTutorial;