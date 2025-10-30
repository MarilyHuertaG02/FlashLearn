// creacion.js - VERSIÓN FINAL CON VISTA PREVIA DE IMAGEN Y GUARDADO EN FIRESTORE

// VARIABLE DE CONTROL: Cambia a 'false' cuando la subida funcione
const DEBUG_MODE = false; // Cambiado a false para que la redirección funcione

// IMPORTACIONES DE FIREBASE Y AUTH
import { auth, db } from './firebase.js'; 
import { collection, addDoc } from 'firebase/firestore';
import { notifications } from './notifications.js'; 
import { onUserLoaded } from './user-auth.js'; 
// NOTA: Para subir imágenes, necesitarías importar aquí 'storage', 'ref', etc.

document.addEventListener('DOMContentLoaded', () => {
    
    // --- Definición de elementos DOM ---
    const mainContent = document.querySelector('main');
    const flashcardTemplate = document.querySelector('.bg-white.shadow-sm.rounded-3.p-4.mb-4');
    const actionButtonsDiv = document.querySelector('.d-flex.justify-content-between.mt-4');
    
    const setTitleInput = document.getElementById('setTitle');
    const setSubjectInput = document.getElementById('setSubject');
    const setDescriptionInput = document.getElementById('setDescription');
    const setImageInput = document.getElementById('setImage');
    const imagePlaceholder = document.querySelector('.col-md-5 img.img-fluid'); 
    const finishBtn = document.getElementById('finishBtn'); 

    const addCardBtn = document.getElementById('addCardBtn');
    const prevCardBtn = document.getElementById('prevCardBtn');
    const nextCardBtn = document.getElementById('nextCardBtn');
    const navigationControls = document.getElementById('navigation-controls');

    let currentCardIndex = 0; 
    let selectedImageFile = null; 
    let currentUser = null; 


    // =========================================================
    // 1. LÓGICA DE FIREBASE Y GUARDADO (PRIVADO)
    // =========================================================

    const getFlashcardsData = () => {
        const flashcards = [];
        const cardElements = getAllFlashcards();
        
        cardElements.forEach((cardElement, index) => {
            const term = cardElement.querySelector('.term').value.trim();
            const definition = cardElement.querySelector('.definition').value.trim();

            if (term && definition) {
                flashcards.push({
                    pregunta: term,
                    respuesta: definition,
                    orden: index + 1
                });
            }
        });
        return flashcards;
    };

    const saveSetToFirestore = async () => {
        const user = currentUser; 
        if (!user) {
            notifications.show('Error: Sesión no detectada. Recarga la página.', 'error');
            return;
        }

        const flashcardsData = getFlashcardsData();

        if (flashcardsData.length === 0) {
            notifications.show('Debes crear al menos una tarjeta válida.', 'warning');
            return;
        }

        const setTitle = setTitleInput.value.trim();
        const setSubject = setSubjectInput.value.trim();
        const setDescription = setDescriptionInput.value.trim();

        if (!setTitle || !setSubject) {
            notifications.show('El título y la asignatura son obligatorios.', 'warning');
            return;
        }
        
        notifications.showLoading('Guardando set en la nube...');

        try {
            // NOTA: La lógica de subida a Storage iría aquí. Por ahora, solo usamos la URL de vista previa.
            const imageUrl = selectedImageFile 
                                ? imagePlaceholder.src // Usar la URL local de vista previa
                                : "img/default-cover.png"; 

            // 1. Crear el documento del set principal (addDoc)
            const setRef = collection(db, 'usuarios', user.uid, 'sets');
            const newSetDoc = await addDoc(setRef, {
                titulo: setTitle,
                asignatura: setSubject,
                descripcion: setDescription,
                userId: user.uid,
                fechaDeCreacion: new Date(),
                lastAccessed: new Date(), 
                imagenUrl: imageUrl 
            });

            const newSetId = newSetDoc.id;

            // 2. Guardar las tarjetas en la subcolección 'flashcards'
            const batchPromises = [];
            const flashcardsCollectionRef = collection(db, 'usuarios', user.uid, 'sets', newSetId, 'flashcards');

            flashcardsData.forEach(card => {
                batchPromises.push(addDoc(flashcardsCollectionRef, card)); 
            });

            await Promise.all(batchPromises);
            
            notifications.hideLoading();
            handleSaveSuccess(); 

        } catch (error) {
            notifications.hideLoading();
            handleSaveError(error); 
        }
    };

    // --- FUNCIONES DE DEBUG Y CONTROL DE FLUJO ---

    const handleSaveSuccess = () => {
        if (DEBUG_MODE) {
            notifications.show('✔ ÉXITO: Set guardado en DB. Redirección detenida (DEBUG).', 'success', 8000);
            console.log("DEBUG MODE: Redirección detenida. Verifica Firestore manualmente.");
        } else {
            // Modo Producción: Redirigir a la galería de sets
            notifications.show('Set guardado con éxito! Redirigiendo a tus sets...', 'success', 2500);
            setTimeout(() => {
                window.location.href = 'flashcards.html';
            }, 2500);
        }
    };

    const handleSaveError = (error) => {
        console.error("ERROR FATAL AL GUARDAR:", error);
        
        if (DEBUG_MODE) {
            notifications.show(`FALLO DE FIREBASE: ${error.message}. Verifica reglas y rutas.`, 'error', 10000);
        } else {
            notifications.show('Error al guardar. Intenta de nuevo más tarde.', 'error');
        }
    };


    // =========================================================
    // 2. FUNCIONES DE UTILIDAD Y VISTA PREVIA
    // =========================================================

    const setupImagePreview = () => {
        setImageInput.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (file) {
                selectedImageFile = file; 
                const reader = new FileReader();
                reader.onload = (e) => {
                    imagePlaceholder.src = e.target.result; 
                };
                reader.readAsDataURL(file);
            }
        });
    };
    
    const getAllFlashcards = () => {
        return mainContent.querySelectorAll('.bg-white.shadow-sm.rounded-3.p-4.mb-4');
    };

    const showActiveCard = () => {
        const cards = getAllFlashcards();
        if (cards.length > 1) {
            navigationControls.style.display = 'flex'; 
            prevCardBtn.disabled = (currentCardIndex === 0);
            nextCardBtn.disabled = (currentCardIndex === cards.length - 1);
        } else {
            navigationControls.style.display = 'none'; 
        }
        if (cards.length > 0) {
            cards.forEach((card, index) => {
                card.style.display = (index === currentCardIndex) ? 'block' : 'none';
            });
        }
    };

    const renumberFlashcards = () => {
        const cards = getAllFlashcards();
        cards.forEach((card, index) => {
            const cardNumberSpan = card.querySelector('.card-number');
            if (cardNumberSpan) cardNumberSpan.textContent = index + 1;

            let deleteBtn = card.querySelector('.btn-danger.float-end');
            if (index === 0) {
                if (deleteBtn) deleteBtn.remove();
            } else {
                if (!deleteBtn) {
                    deleteBtn = document.createElement('button');
                    deleteBtn.className = 'btn btn-sm btn-danger float-end';
                    deleteBtn.textContent = 'Eliminar';
                    deleteBtn.onclick = () => deleteFlashcard(card);
                    
                    const titleContainer = card.querySelector('.d-flex.align-items-center.mb-3');
                    if (titleContainer) titleContainer.appendChild(deleteBtn);
                }
            }
        });
    };
    
    const deleteFlashcard = (cardElement) => {
        const cards = getAllFlashcards();
        const cardIndexToDelete = Array.from(cards).indexOf(cardElement);
        if (cardIndexToDelete !== -1) {
            cardElement.remove();
            if (currentCardIndex >= cards.length - 1 && currentCardIndex > 0) {
                currentCardIndex--;
            }
            renumberFlashcards();
            showActiveCard();
        }
    };

    const createNewFlashcard = () => {
        const cards = getAllFlashcards();
        const newFlashcard = flashcardTemplate.cloneNode(true);
        newFlashcard.querySelector('.term').value = '';
        newFlashcard.querySelector('.definition').value = '';

        actionButtonsDiv.parentNode.insertBefore(newFlashcard, actionButtonsDiv);
        if (navigationControls && navigationControls.parentNode) {
             actionButtonsDiv.parentNode.insertBefore(navigationControls, actionButtonsDiv);
        }
        
        currentCardIndex = cards.length; 
        renumberFlashcards();
        showActiveCard();
    };

    const navigate = (direction) => {
        const cards = getAllFlashcards();
        let newIndex = currentCardIndex + direction;
        if (newIndex >= 0 && newIndex < cards.length) {
            currentCardIndex = newIndex;
            showActiveCard();
        }
    };


    // =========================================================
    // 3. INICIALIZACIÓN DE LA APLICACIÓN Y EVENTOS
    // =========================================================

    const attachInitialListeners = () => {
        setupImagePreview(); 
        addCardBtn.addEventListener('click', createNewFlashcard);
        prevCardBtn.addEventListener('click', () => navigate(-1));
        nextCardBtn.addEventListener('click', () => navigate(1));
        finishBtn.addEventListener('click', saveSetToFirestore);
    };

    // SINCRONIZACIÓN: Espera a que el perfil termine de cargar para iniciar la UI
    onUserLoaded((user, userData) => {
        currentUser = user; 
        console.log("Perfil de usuario cargado. Inicializando UI de creación.");
        attachInitialListeners(); 
    });


    // Ejecutar lógica de vista inicial (para que la primera tarjeta sea visible)
    renumberFlashcards(); 
    showActiveCard(); 
});
