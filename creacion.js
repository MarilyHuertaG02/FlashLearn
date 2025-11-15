// creacion.js - VERSIÓN FINAL CON MODO EDICIÓN

// 🚨 VARIABLE DE CONTROL: Cambia a 'false' cuando la subida funcione
const DEBUG_MODE = false; 

// IMPORTACIONES DE FIREBASE Y AUTH
import { auth, db } from './firebase.js'; 
import { collection, addDoc, doc, getDoc, getDocs, query, orderBy, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { notifications } from './notifications.js'; 
import { onUserLoaded } from './user-auth.js'; 


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

    // Variables de Modo Edición
    let isEditMode = false;
    let currentEditId = null;

    // =========================================================
    // 1. INICIALIZACIÓN (Modificada para Edición)
    // =========================================================
    
    onUserLoaded(async (user, userData) => {
        currentUser = user; 
        console.log("Perfil de usuario cargado.");

        // VERIFICAR MODO EDICIÓN
        const urlParams = new URLSearchParams(window.location.search);
        currentEditId = urlParams.get('editId');
        
        if (currentEditId) {
            isEditMode = true;
            document.querySelector('h2.fw-bold').textContent = "Modificar Flashcards";
            finishBtn.textContent = "Actualizar Set";
            
            await loadSetForEditing(user.uid, currentEditId);
        } else {
            isEditMode = false;
            console.log("Modo Creación.");
            // NOTA: Estas funciones se llaman aquí y también al final. Se mantiene la lógica del original.
            renumberFlashcards();
            showActiveCard();
        }

        attachInitialListeners();
    });

    // =========================================================
    // 2. NUEVA FUNCIÓN (Cargar Set para Edición)
    // =========================================================

    async function loadSetForEditing(userId, setId) {
        notifications.showLoading('Cargando set para editar...');
        try {
            // 1. Cargar metadatos
            const setRef = doc(db, 'usuarios', userId, 'sets', setId);
            const setSnap = await getDoc(setRef);
            if (!setSnap.exists()) {
                throw new Error("El set a editar no existe.");
            }
            const setData = setSnap.data();

            // 2. Poblar formulario (Metadatos)
            setTitleInput.value = setData.titulo || '';
            setSubjectInput.value = setData.asignatura || '';
            setDescriptionInput.value = setData.descripcion || '';
            imagePlaceholder.src = setData.imagenUrl || 'img/default-cover.png';

            // 3. Cargar tarjetas de la subcolección
            const flashcardsRef = collection(db, 'usuarios', userId, 'sets', setId, 'flashcards');
            const cardsQuery = query(flashcardsRef, orderBy('orden', 'asc'));
            const cardsSnapshot = await getDocs(cardsQuery);

            // 4. Poblar formulario (Tarjetas)
            if (cardsSnapshot.empty) {
                renumberFlashcards();
                showActiveCard();
            } else {
                // Eliminar la tarjeta de plantilla inicial
                const firstCard = getAllFlashcards()[0];
                if (firstCard) firstCard.remove();
                
                // Inyectar las tarjetas desde Firebase
                cardsSnapshot.docs.forEach(doc => {
                    const cardData = doc.data();
                    createNewFlashcard(cardData.pregunta, cardData.respuesta);
                });
            }
            
            // 5. Preparar la UI
            currentCardIndex = 0;
            renumberFlashcards();
            showActiveCard();
            notifications.hideLoading();

        } catch (error) {
            console.error("Error al cargar set para edición:", error);
            notifications.show('Error al cargar datos para editar.', 'error');
            notifications.hideLoading();
            isEditMode = false;
            renumberFlashcards();
            showActiveCard();
        }
    }

    // =========================================================
    // 3. MODIFICACIÓN DE FUNCIONES DE UI
    // =========================================================

    // Modificar createNewFlashcard para aceptar valores
    const createNewFlashcard = (term = '', definition = '') => {
        const cards = getAllFlashcards();
        const newFlashcard = flashcardTemplate.cloneNode(true);
        
        // Rellenar con los valores (si se pasan)
        newFlashcard.querySelector('.term').value = term;
        newFlashcard.querySelector('.definition').value = definition;

        actionButtonsDiv.parentNode.insertBefore(newFlashcard, actionButtonsDiv);
        
        if (navigationControls && navigationControls.parentNode) {
             actionButtonsDiv.parentNode.insertBefore(navigationControls, actionButtonsDiv);
        }
        
        renumberFlashcards();
        
        if (!isEditMode) {
            currentCardIndex = cards.length; 
            showActiveCard();
        }
    };

    // =========================================================
    // 4. LÓGICA DE FIREBASE Y GUARDADO (ACTUALIZADO)
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
        
        notifications.showLoading(isEditMode ? 'Actualizando set...' : 'Guardando set en la nube...');

        try {
            // Nota: Aquí no estás subiendo la imagen, solo guardando la URL (placeholder.src)
            const imageUrl = selectedImageFile 
                                ? imagePlaceholder.src
                                : "img/default-cover.png"; 

            // Verificar si estamos en modo Edición
            if (isEditMode) {
                // LÓGICA DE ACTUALIZACIÓN
                const setRef = doc(db, 'usuarios', user.uid, 'sets', currentEditId);
                
                // 1. Actualizar metadatos del set
                await updateDoc(setRef, {
                    titulo: setTitle,
                    asignatura: setSubject,
                    descripcion: setDescription,
                    imagenUrl: imageUrl,
                    lastAccessed: new Date()
                });

                // 2. Eliminar tarjetas existentes
                const flashcardsCollectionRef = collection(db, 'usuarios', user.uid, 'sets', currentEditId, 'flashcards');
                const existingCardsSnapshot = await getDocs(flashcardsCollectionRef);
                
                const deletePromises = [];
                existingCardsSnapshot.docs.forEach(doc => {
                    deletePromises.push(deleteDoc(doc.ref));
                });
                await Promise.all(deletePromises);

                // 3. Agregar nuevas tarjetas
                const addPromises = flashcardsData.map(card => {
                    return addDoc(flashcardsCollectionRef, card);
                });
                await Promise.all(addPromises);
                
                notifications.hideLoading();
                handleUpdateSuccess();
                
            } else {
                // LÓGICA DE CREACIÓN (la que ya tienes)
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

                // Guardar las tarjetas en la subcolección 'flashcards'
                const flashcardsCollectionRef = collection(db, 'usuarios', user.uid, 'sets', newSetId, 'flashcards');
                const batchPromises = flashcardsData.map(card => {
                    return addDoc(flashcardsCollectionRef, card);
                });

                await Promise.all(batchPromises);
                
                notifications.hideLoading();
                handleSaveSuccess();
            }

        } catch (error) {
            notifications.hideLoading();
            handleSaveError(error); 
        }
    };

    // --- FUNCIONES DE DEBUG Y CONTROL DE FLUJO (CORREGIDAS PARA MOSTRAR POPUP) ---

    const handleSaveSuccess = () => {
        if (DEBUG_MODE) {
            notifications.show('✔ ÉXITO: Set guardado en DB. Redirección detenida (DEBUG).', 'success', 8000);
            console.log("DEBUG MODE: Redirección detenida. Verifica Firestore manualmente.");
        } else {
            // CORREGIDO: Llama al POPUP en modo producción
            showSuccessPopup('Flashcard Creada con Éxito', 'Tu set de flashcards ha sido guardado correctamente.', 'flashcards.html');
        }
    };

    const handleUpdateSuccess = () => {
        if (DEBUG_MODE) {
            notifications.show('EXITO: Set actualizado en DB. Redirección detenida (DEBUG).', 'success', 8000);
            console.log("DEBUG MODE: Redirección detenida. Verifica Firestore manualmente.");
        } else {
            // CORREGIDO: Llama al POPUP en modo producción
            showSuccessPopup('Flashcard Actualizada con Éxito', 'Tu set de flashcards ha sido actualizado correctamente.', 'flashcards.html');
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
    // 5. FUNCIONES DE UTILIDAD Y VISTA PREVIA (MANTENIDAS)
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

    const navigate = (direction) => {
        const cards = getAllFlashcards();
        let newIndex = currentCardIndex + direction;
        if (newIndex >= 0 && newIndex < cards.length) {
            currentCardIndex = newIndex;
            showActiveCard();
        }
    };

    // =========================================================
    // 6. INICIALIZACIÓN DE LA APLICACIÓN Y EVENTOS
    // =========================================================

    const attachInitialListeners = () => {
        setupImagePreview(); 
        addCardBtn.addEventListener('click', () => createNewFlashcard());
        prevCardBtn.addEventListener('click', () => navigate(-1));
        nextCardBtn.addEventListener('click', () => navigate(1));
        finishBtn.addEventListener('click', saveSetToFirestore);
    };

    // renumberFlashcards y showActiveCard ya se llaman en onUserLoaded.
    // Se mantiene la lógica de inicialización del original.


    // Función para mostrar el popup de éxito (SIN REDIRECCIÓN AUTOMÁTICA)
function showSuccessPopup(title, message, redirectUrl) {
    const popup = document.getElementById('successPopup');
    
    // Si el elemento no existe, salimos
    if (!popup) {
        console.error("Error: Elemento #successPopup no encontrado en el DOM.");
        // Si no se encuentra, simplemente redirigimos (comportamiento de fallback)
        if (redirectUrl && !DEBUG_MODE) {
            window.location.href = redirectUrl;
        }
        return;
    }
    
    const popupTitle = popup.querySelector('h3');
    const popupMessage = popup.querySelector('p');
    const closeBtn = document.getElementById('closeSuccessBtn');
    
    // 1. Actualizar contenido
    popupTitle.textContent = title;
    popupMessage.textContent = message;
    
    // 2. MOSTRAR popup y aplicar FLEX para centrar
    popup.classList.remove('hidden');
    // Asegura el centrado
    popup.style.display = 'flex'; 
    
    // 3. Función de cierre y redirección (solo al dar clic)
    const closeAndRedirect = () => {
        popup.classList.add('hidden');
        // Asegura que se oculte correctamente
        popup.style.display = 'none'; 
        if (redirectUrl && !DEBUG_MODE) {
            window.location.href = redirectUrl;
        }
    };
    
    // 4. Configurar eventos de cierre (requieren clic)
    closeBtn.onclick = closeAndRedirect;
    
    // Cerrar al hacer clic fuera del popup (overlay)
    popup.onclick = (e) => {
        if (e.target === popup) {
            closeAndRedirect();
        }
    };
    
    // 🚨 NOTA: Se ha ELIMINADO la redirección automática (setTimeout)
}

});