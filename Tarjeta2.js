// Tarjeta2.js - VERSIÓN CORREGIDA PARA SINCRONIZACIÓN DE AUTH Y BÚSQUEDA EN CASCADA

import { db, auth } from './firebase.js';
import { collection, getDocs, orderBy, query, doc, getDoc } from 'firebase/firestore'; 
import { onAuthStateChanged } from 'firebase/auth'; // Necesitas esta importación

document.addEventListener('DOMContentLoaded', () => {
    
    // Contenedores DOM (Inicialización)
    const flashcardArea = document.querySelector('.flashcard-area');
    const setTitle = document.querySelector('.set-header h1');
    const setSubject = document.querySelector('.set-header p');

    // Variables de estado del set
    let currentCardIndex = 0;
    let cards = [];
    
    // Variables DOM re-declaradas localmente (serán asignadas después de la inyección)
    let flashcard, flashcardFront, flashcardBack, flipButton, prevButton, nextButton, progressBar;
    
    // Obtener el ID del set desde la URL
    const urlParams = new URLSearchParams(window.location.search);
    const setId = urlParams.get('set'); 

    if (!setId) {
        showErrorState("No se especificó un set de flashcards.");
        return;
    }
    
    // Iniciar el estado de carga
    flashcardArea.innerHTML = getLoadingHTMLStructure();

    // MOTOR DE CARGA: Esperar el estado de autenticación ANTES de iniciar la carga del set
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            // Protección de página si no está logueado
            window.location.href = 'index.html'; 
            return;
        }

        try {
            // 1. Cargar datos del set y las flashcards
            await loadSetData(setId, user); 
            
            if (cards.length > 0) {
                // 2. Inyectar y reasignar DOM
                flashcardArea.innerHTML = getFlashcardHTMLStructure();
                flashcard = document.querySelector('.flashcard');
                flashcardFront = document.querySelector('.flashcard-front');
                flashcardBack = document.querySelector('.flashcard-back');
                flipButton = document.querySelector('.flip-button');
                prevButton = document.querySelector('.nav-button.prev');
                nextButton = document.querySelector('.nav-button.next');
                progressBar = document.querySelector('.progress');

                // 3. Ejecutar la lógica de la tarjeta
                updateCardContent();
                updateProgressBar();
                setupEventListeners();
            } else {
                showErrorState("No se encontraron flashcards en este set.");
            }
        } catch (error) {
            console.error("Error al cargar flashcards:", error);
            showErrorState(`Error al cargar las flashcards desde Firebase: ${error.message}`);
        }
    });

    // --------------------------------------------------------------------
    // FUNCIONES DE CARGA DE DATOS (Requieren el objeto user)
    // --------------------------------------------------------------------

    async function loadSetData(setId, user) {
        
        // PASO 1: Intentar buscar el set como PRIVADO (Creado por el usuario)
        const privateSetRef = doc(db, 'usuarios', user.uid, 'sets', setId);
        let setDoc = await getDoc(privateSetRef);
        let collectionPathType = 'Privado';

        if (!setDoc.exists()) {
            // PASO 2: Si no es privado, intentar buscarlo como PÚBLICO (Catálogo)
            const publicSetRef = doc(db, 'setsPublicos', setId);
            setDoc = await getDoc(publicSetRef);
            collectionPathType = 'Público';
        }

        if (!setDoc.exists()) {
            throw new Error("Set no encontrado. Verifica que el ID exista en tus sets privados o públicos.");
        }

        // --- Si se encontró el set (Público o Privado) ---
        const setData = setDoc.data();
        
        // 1. Actualizar título y asignatura
        setTitle.textContent = setData.titulo || setData.nombre || "Set No Encontrado";
        setSubject.textContent = setData.asignatura || "Asignatura";
        console.log(`Set cargado (${collectionPathType}): ${setData.titulo}`);

        // 2. Cargar flashcards de la subcolección 'flashcards' del documento encontrado
        const flashcardsRef = collection(setDoc.ref, 'flashcards'); 
        const flashcardsQuery = query(flashcardsRef, orderBy('orden', 'asc'));
        const flashcardsSnapshot = await getDocs(flashcardsQuery);
        
        if (!flashcardsSnapshot.empty) {
            cards = flashcardsSnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            console.log(`Cargadas ${cards.length} flashcards.`);
        } else {
            throw new Error("No hay flashcards en este set");
        }
    }


    // --------------------------------------------------------------------
    // FUNCIONES DE UI Y EVENTOS
    // --------------------------------------------------------------------

    function updateCardContent() {
        if (cards.length === 0) return;
        
        const currentCard = cards[currentCardIndex];
        flashcardFront.innerHTML = `<p>${currentCard.pregunta}</p>`;
        flashcardBack.innerHTML = `<p>${currentCard.respuesta}</p>`;
        
        document.title = `FlashLearn - ${currentCard.pregunta.substring(0, 30)}...`;
    }

    function updateProgressBar() {
        if (!progressBar) return;
        const total = cards.length > 0 ? cards.length : 1;
        const progress = ((currentCardIndex + 1) / total) * 100;
        progressBar.style.width = `${progress}%`;
    }

    function setupEventListeners() {
        if (!flashcard) return;
        
        // --- 1. LISTENER DE VOLTEO DE TARJETA (Flip Button) ---
        flipButton.addEventListener('click', () => {
            flashcard.classList.toggle('flipped');
        });

        // --- 2. LISTENER DE BOTÓN DE QUIZ ---
        const startQuizBtn = document.getElementById('startQuizBtn');
        if (startQuizBtn) {
            startQuizBtn.addEventListener('click', redirectToQuizPage);
        }

        // --- 3. LISTENERS DE NAVEGACIÓN (Next/Prev) ---
        prevButton.addEventListener('click', () => {
            if (currentCardIndex > 0) {
                currentCardIndex--;
                resetCardView();
                updateCardContent();
                updateProgressBar();
            }
        });

        nextButton.addEventListener('click', () => {
            if (currentCardIndex < cards.length - 1) {
                currentCardIndex++;
                resetCardView();
                updateCardContent();
                updateProgressBar();
            } else {
                showCompletionMessage();
            }
        });

        // --- 4. LISTENER DE TECLADO ---
        document.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowLeft') {
                prevButton.click();
            } else if (e.key === 'ArrowRight') {
                nextButton.click();
            } else if (e.key === ' ' || e.key === 'Spacebar') {
                flipButton.click();
                e.preventDefault();
            }
        });
    }
    
    // --- Funciones Auxiliares de Vista ---

    function redirectToQuizPage() {
        // La variable 'setId' es accesible en este scope
        const url = `quizzes.html?set=${setId}`;
        window.location.href = url;
    }

    function resetCardView() {
        if (!flashcard) return;
        flashcard.classList.remove('flipped');
    }

    function showErrorState(message) {
        const errorHTML = `
            <div class="error-state">
                <h3>😕 No se pudieron cargar las flashcards</h3>
                <p>${message}</p>
                <div class="error-actions">
                    <button onclick="window.location.href='flashcards.html'" class="btn-primary">Volver a Sets</button>
                </div>
            </div>
        `;
        
        document.querySelector('.flashcard-area').innerHTML = errorHTML;
    }
    
    function getLoadingHTMLStructure() {
        return `<div class="loading-state p-4">Cargando set...</div>`;
    }
    
    function getFlashcardHTMLStructure() {
        // Estructura completa inyectada
        return `
            <div class="flashcard">
                <div class="flashcard-inner">
                    <div class="flashcard-front"></div>
                    <div class="flashcard-back"></div>
                </div>
            </div>
            
            <div class="flashcard-nav">
                <button class="nav-button prev"><img src="img/flecha-izquierda.png" alt="Anterior"></button>
                <div class="progress-bar">
                    <div class="progress" style="width: 0%;"></div>
                </div>
                <button class="nav-button next"><img src="img/flecha-derecha.png" alt="Siguiente"></button>
            </div>
            
            <button class="flip-button">Flip Card</button>
            
            <button class="floating-take-quiz-button" onclick="showTakeQuizCard()">
                <img src="quiz.png" alt="Question Mark"> <span>Take Quiz</span>
            </button>
            <div class="take-quiz-card-overlay" id="takeQuizCardOverlay">
                <div class="take-quiz-card-content">
                    <button class="close-quiz-card" onclick="hideTakeQuizCard()">X</button>
                    <img src="quiz.png" alt="Question Mark" class="large-question-icon"> <p>¿Listo para el quiz?</p>
                    <button class="start-quiz-button" id="startQuizBtn">Empezar Quiz</button> 
                </div>
            </div>
        `;
    }

    function showCompletionMessage() {
        const completionMsg = `
            <div class="completion-message">
                <h3>¡Felicidades!</h3>
                <p>Has completado todas las flashcards de este set.</p>
                <div class="completion-actions">
                    <button onclick="restartSet()" class="btn-primary">Repetir Set</button>
                    <button onclick="goToSets()" class="btn-secondary">Volver a Sets</button>
                </div>
            </div>
        `;
        
        document.querySelector('.flashcard-area').innerHTML = completionMsg;
    }
});

// Funciones globales (se mantienen igual)
window.restartSet = function() {
    window.location.reload();
};

window.goToSets = function() {
    window.location.href = 'flashcards.html';
};

// Funciones del quiz
function showTakeQuizCard() {
    const quizOverlay = document.getElementById('takeQuizCardOverlay');
    if (quizOverlay) {
        quizOverlay.classList.add('active');
    }
}

function hideTakeQuizCard() {
    const quizOverlay = document.getElementById('takeQuizCardOverlay');
    if (quizOverlay) {
        quizOverlay.classList.remove('active');
    }
}

window.showTakeQuizCard = showTakeQuizCard;
window.hideTakeQuizCard = hideTakeQuizCard;
