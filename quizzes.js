// quizzes.js 

import { auth, db } from './firebase.js';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, collection, getDocs, updateDoc, addDoc, deleteDoc, query, where, orderBy } from 'firebase/firestore'; 
import { notifications } from './notifications.js';
import { handleLogout } from './auth.js'; 
import { updateStudyStreak } from './user.js';
import { setupNavigation } from './utils.js';
import { initializeUserAuth } from './user-auth.js';

// --- Variables Globales del Quiz ---
let currentQuizData = []; 
let currentQuestionIndex = 0;
let correctAnswers = 0;
let totalQuestions = 0;
let selectedSetId = null;

//  VARIABLES GLOBALES PARA EL POPUP
let quizToDelete = null;

// --- DOM Elements ---
const setSelectionView = document.getElementById('setSelectionView');
const quizActiveView = document.getElementById('quizActiveView');
const resultsView = document.getElementById('resultsView');
const availableSetsGrid = document.getElementById('availableSetsGrid');

// ------------------------------------------
// FUNCIONES PARA MANEJAR POPUPS
// ------------------------------------------

function showDeleteConfirmPopup(quizId) {
    quizToDelete = quizId;
    const popup = document.getElementById('deleteConfirmPopup');
    popup.classList.remove('hidden');
}

function hideDeleteConfirmPopup() {
    const popup = document.getElementById('deleteConfirmPopup');
    popup.classList.add('hidden');
    quizToDelete = null;
}

function showDeleteSuccessPopup() {
    const popup = document.getElementById('deleteSuccessPopup');
    popup.classList.remove('hidden');
}

function hideDeleteSuccessPopup() {
    const popup = document.getElementById('deleteSuccessPopup');
    popup.classList.add('hidden');
}

// ------------------------------------------
// INICIALIZAR EVENT LISTENERS PARA POPUPS
// ------------------------------------------

function initializePopupListeners() {
    // Popup de confirmación
    const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
    const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
    
    if (cancelDeleteBtn) {
        cancelDeleteBtn.addEventListener('click', hideDeleteConfirmPopup);
    }
    
    if (confirmDeleteBtn) {
        confirmDeleteBtn.addEventListener('click', executeQuizDeletion);
    }
    
    // Popup de éxito
    const closeSuccessBtn = document.getElementById('closeSuccessBtn');
    if (closeSuccessBtn) {
        closeSuccessBtn.addEventListener('click', hideDeleteSuccessPopup);
    }
    
    // Cerrar popup haciendo clic fuera del contenido
    const popupOverlays = document.querySelectorAll('.popup-overlay');
    popupOverlays.forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.classList.add('hidden');
            }
        });
    });
}

document.addEventListener('DOMContentLoaded', () => {
    console.log("quizzes.js iniciado");
    
    // Inicializar el perfil
    initializeUserAuth(); 
    
    // Configurar el sidebar
    setupNavigation(); 
    
    // INICIALIZAR LISTENERS DE POPUPS
    initializePopupListeners();
    
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }

    // Verificar autenticación
    onAuthStateChanged(auth, (user) => {
        if (user) {
            console.log("Usuario autenticado:", user.uid);
            fetchAvailableQuizSets(user.uid);
        } else {
            console.log("Usuario no autenticado, redirigiendo...");
            window.location.href = 'index.html';
        }
    });
});

// ------------------------------------------
// LÓGICA DE CARGA DE SETS CON BOTÓN ELIMINAR
// ------------------------------------------

async function fetchAvailableQuizSets(userId) {
    console.log("Buscando quizzes para usuario:", userId);
    
    if (!availableSetsGrid) {
        console.error("availableSetsGrid no encontrado en el DOM");
        return;
    }
    
    availableSetsGrid.innerHTML = '<div class="loading-state">Cargando quizzes disponibles...</div>';

    try {
        // 1. CARGAR QUIZZES PRIVADOS (Creados por el usuario)
        console.log("Buscando quizzes privados...");
        const privateSetsRef = collection(db, 'usuarios', userId, 'quizzes_creados');
        const privateSnapshot = await getDocs(privateSetsRef);
        
        const privateSets = privateSnapshot.docs.map(doc => ({ 
            ...doc.data(), 
            id: doc.id, 
            type: 'private'
        }));
        
        console.log("Quizzes privados encontrados:", privateSets.length);

        // 2. CARGAR SETS PÚBLICOS (Para convertirlos en quizzes)
        console.log("Buscando sets públicos...");
        const publicSetsRef = collection(db, 'setsPublicos');
        const publicSnapshot = await getDocs(publicSetsRef);
        
        const publicSets = publicSnapshot.docs.map(doc => ({ 
            ...doc.data(), 
            id: doc.id, 
            type: 'public'
        }));
        
        console.log("Sets públicos encontrados:", publicSets.length);
        
        // 3. FUSIONAR (Ponemos los privados primero, luego los públicos)
        const allSets = [...privateSets, ...publicSets];
        console.log("Total de sets disponibles:", allSets.length);

        if (allSets.length === 0) {
            availableSetsGrid.innerHTML = `
                <div class="text-center p-4">
                    <h3>No hay quizzes disponibles por el momento. 😕</h3>
                    <p>Crea tu primer quiz o espera a que se agreguen más sets públicos.</p>
                </div>
            `;
            return;
        }

        // 4. INYECTAR HTML CON BOTÓN ELIMINAR
        let setsHTML = '';
        allSets.forEach(set => {
            const isPrivate = set.type === 'private';
            const imageUrl = set.imagen || set.imagenUrl || 'img/default-quiz-cover.png';
            const title = set.titulo || 'Set sin título';
            const subject = set.asignatura || 'General';
            
            setsHTML += `
            <div class="quiz-set-card" data-set-id="${set.id}" data-set-type="${set.type}">
                <div class="quiz-set-image-container mb-3">
                    <img src="${imageUrl}" alt="Cover de Quiz" class="quiz-set-img">
                    ${isPrivate ? '<span class="badge bg-primary position-absolute top-0 end-0 m-2">PRIVADO</span>' : ''}
                </div>

                <h3>${title}</h3>
                <p><strong>Materia:</strong> ${subject}</p>
                <p><strong>Preguntas:</strong> ${set.totalPreguntas || 'N/A'}</p>
                
                <div class="d-flex justify-content-between align-items-center mt-3 flex-wrap gap-2">
                    <button class="start-quiz-btn btn btn-primary btn-sm" data-set-id="${set.id}" data-set-type="${set.type}">
                        Comenzar Quiz
                    </button>
                    
                    <div class="d-flex gap-2">
                        ${isPrivate ? 
                            `<a href="crearQuices.html?editId=${set.id}" class="btn btn-secondary btn-sm" title="Modificar Quiz">
                                Modificar
                            </a>` 
                            : ''}
                        
                        ${isPrivate ? 
                            `<button class="btn btn-secondary btn-sm delete-quiz-btn" data-quiz-id="${set.id}" title="Eliminar Quiz">
                                Eliminar
                            </button>` 
                            : ''}
                    </div>
                </div>
            </div>
            `;
        });
        
        availableSetsGrid.innerHTML = setsHTML;
        
        // 5. Adjuntar listeners de clic
        document.querySelectorAll('.start-quiz-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const setId = e.target.dataset.setId;
                const setType = e.target.dataset.setType;
                console.log(" Iniciando quiz:", setId, "Tipo:", setType);
                startQuiz(setId, setType);
            });
        });

        // Adjuntar listeners para eliminar quizzes
        document.querySelectorAll('.delete-quiz-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevenir que el clic se propague
                const quizId = e.target.dataset.quizId;
                console.log("Solicitando eliminar quiz:", quizId);
                confirmDeleteQuiz(quizId);
            });
        });

        console.log("Quizzes cargados correctamente");

    } catch (error) {
        console.error("Error al cargar sets para quiz:", error);
        notifications.show('Error al cargar quizzes. Revisa la consola para más detalles.', 'error');
        availableSetsGrid.innerHTML = `
            <div class="error-state text-center p-4">
                <h3>Error al cargar quizzes</h3>
                <p>Revisa tus reglas de Firestore y la conexión a internet.</p>
                <button onclick="location.reload()" class="btn btn-primary">Reintentar</button>
            </div>
        `;
    }
}

// ------------------------------------------
//  FUNCIÓN MODIFICADA: CONFIRMAR ELIMINACIÓN
// ------------------------------------------

async function confirmDeleteQuiz(quizId) {
    const user = auth.currentUser;
    if (!user) {
        notifications.show('Error: Sesión no válida.', 'error');
        return;
    }

    // POPUP DE ELIMINACION
    showDeleteConfirmPopup(quizId);
}

// ------------------------------------------
//  NUEVA FUNCIÓN: EJECUTAR ELIMINACIÓN
// ------------------------------------------

async function executeQuizDeletion() {
    if (!quizToDelete) return;

    const user = auth.currentUser;
    if (!user) return;

    try {
        notifications.showLoading('Eliminando quiz...');
        
        // 1. Primero eliminar todas las preguntas de la subcolección
        const questionsRef = collection(db, 'usuarios', user.uid, 'quizzes_creados', quizToDelete, 'preguntas');
        const questionsSnapshot = await getDocs(questionsRef);
        
        const deleteQuestionsPromises = [];
        questionsSnapshot.docs.forEach(doc => {
            deleteQuestionsPromises.push(deleteDoc(doc.ref));
        });
        
        await Promise.all(deleteQuestionsPromises);
        console.log("Preguntas eliminadas");

        // 2. Luego eliminar el documento principal del quiz
        const quizRef = doc(db, 'usuarios', user.uid, 'quizzes_creados', quizToDelete);
        await deleteDoc(quizRef);
        console.log("Quiz eliminado");

        notifications.hideLoading();
        
        // OCULTAR POPUP DE CONFIRMACIÓN Y MOSTRAR POPUP DE ÉXITO
        hideDeleteConfirmPopup();
        showDeleteSuccessPopup();

        // 3. Recargar la lista de quizzes después de un delay
        setTimeout(() => {
            fetchAvailableQuizSets(user.uid);
        }, 1500);

    } catch (error) {
        console.error("Error al eliminar quiz:", error);
        notifications.hideLoading();
        hideDeleteConfirmPopup();
        notifications.show('Error al eliminar el quiz: ' + error.message, 'error');
    }
}

// ------------------------------------------
// LÓGICA DEL QUIZ ACTIVO (MANTENIDA)
// ------------------------------------------

async function startQuiz(setId, setType) {
    console.log("Iniciando quiz:", setId, "Tipo:", setType);
    selectedSetId = setId;
    const user = auth.currentUser;
    
    if (!user) {
        notifications.show('Error: Sesión no válida.', 'error');
        return;
    }

    try {
        notifications.showLoading('Cargando preguntas...');
        
        let questionsRef;
        
        // Determinar la ruta correcta según el tipo de set
        if (setType === 'private') {
            // Quiz privado creado por el usuario
            const quizDocRef = doc(db, 'usuarios', user.uid, 'quizzes_creados', setId);
            const quizSnap = await getDoc(quizDocRef);
            
            if (!quizSnap.exists()) {
                throw new Error("Quiz privado no encontrado.");
            }
            
            questionsRef = collection(quizDocRef, 'preguntas');
        } else {
            // Set público - buscar flashcards
            const setDocRef = doc(db, 'setsPublicos', setId);
            const setSnap = await getDoc(setDocRef);
            
            if (!setSnap.exists()) {
                throw new Error("Set público no encontrado.");
            }
            
            questionsRef = collection(setDocRef, 'flashcards');
        }

        // Cargar preguntas/flashcards
        const questionsSnapshot = await getDocs(questionsRef);
        
        if (questionsSnapshot.empty) {
            notifications.show('Este set no tiene preguntas disponibles.', 'error');
            return;
        }

        // Procesar las preguntas
        currentQuizData = questionsSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                pregunta: data.pregunta || data.termino || 'Pregunta no disponible',
                respuesta: data.respuesta || data.definicion || 'Respuesta no disponible',
                opciones_incorrectas: data.opciones_incorrectas || []
            };
        });

        totalQuestions = currentQuizData.length;
        shuffleArray(currentQuizData);
        
        console.log("Preguntas cargadas:", currentQuizData.length);

        currentQuestionIndex = 0;
        correctAnswers = 0;
        
        showView('quizActiveView');
        loadQuestion();

    } catch (error) {
        console.error("Error al iniciar el quiz:", error);
        notifications.show('Error al cargar el quiz: ' + error.message, 'error');
        showView('setSelectionView');
    } finally {
        notifications.hideLoading();
    }
}

function loadQuestion() {
    if (currentQuestionIndex >= totalQuestions) {
        finishQuiz();
        return;
    }

    const questionData = currentQuizData[currentQuestionIndex];
    const optionsContainer = document.getElementById('optionsContainer');
    const submitAnswerBtn = document.getElementById('submitAnswerBtn');

    if (!optionsContainer || !submitAnswerBtn) {
        console.error(" Elementos del DOM no encontrados");
        return;
    }

    // Actualizar UI
    const quizTitle = document.getElementById('quizTitle');
    const currentQuestionNumber = document.getElementById('currentQuestionNumber');
    const totalQuestionsElement = document.getElementById('totalQuestions');
    const questionText = document.getElementById('questionText');

    if (quizTitle) quizTitle.textContent = `Quiz en progreso`;
    if (currentQuestionNumber) currentQuestionNumber.textContent = currentQuestionIndex + 1;
    if (totalQuestionsElement) totalQuestionsElement.textContent = totalQuestions;
    if (questionText) questionText.textContent = questionData.pregunta;

    // Generar opciones
    const options = generateOptions(questionData.respuesta, questionData.opciones_incorrectas);
    
    optionsContainer.innerHTML = options.map(option => `
        <button class="option-btn" data-value="${option.value}">${option.text}</button>
    `).join('');
    
    // Configurar botón de submit
    submitAnswerBtn.disabled = true;
    submitAnswerBtn.textContent = "Selecciona una opción"; 
    
    // Remover listener anterior y añadir nuevo
    submitAnswerBtn.replaceWith(submitAnswerBtn.cloneNode(true));
    const newSubmitBtn = document.getElementById('submitAnswerBtn');
    newSubmitBtn.addEventListener('click', checkAnswer); 

    // Adjuntar listeners de opción
    optionsContainer.querySelectorAll('.option-btn').forEach(btn => {
        btn.addEventListener('click', handleOptionSelect);
    });
}

function generateOptions(correctAnswer, incorrectOptions) {
    let options = [
        { text: correctAnswer, value: correctAnswer }
    ];
    
    if (incorrectOptions && Array.isArray(incorrectOptions)) {
        incorrectOptions.forEach(incorrectText => {
            if (incorrectText && incorrectText.trim() !== '') {
                options.push({ text: incorrectText, value: incorrectText });
            }
        });
    }
    
    // Si no hay suficientes opciones incorrectas, añadir algunas genéricas
    while (options.length < 4) {
        options.push({ text: `Opción ${options.length}`, value: `Opción ${options.length}` });
    }
    
    shuffleArray(options);
    return options;
}

function handleOptionSelect(e) {
    const selectedOption = e.target;
    
    document.querySelectorAll('.option-btn').forEach(btn => {
        btn.classList.remove('selected');
    });
    
    selectedOption.classList.add('selected');
    
    const submitAnswerBtn = document.getElementById('submitAnswerBtn');
    if (submitAnswerBtn) {
        submitAnswerBtn.disabled = false;
        submitAnswerBtn.textContent = "Comprobar Respuesta";
    }
}

function checkAnswer() {
    const selectedOption = document.querySelector('.option-btn.selected');
    if (!selectedOption) return;

    const questionData = currentQuizData[currentQuestionIndex];
    const selectedValue = selectedOption.dataset.value;
    const correctAnswer = questionData.respuesta; 
    
    const isCorrect = selectedValue === correctAnswer; 

    // Marcar visualmente y bloquear opciones
    document.querySelectorAll('.option-btn').forEach(btn => {
        btn.disabled = true;
    });
    
    if (isCorrect) {
        selectedOption.classList.add('correct');
        correctAnswers++;
        notifications.show('¡Respuesta Correcta! ', 'success', 1000);
    } else {
        selectedOption.classList.add('incorrect');
        // Marcar la correcta
        document.querySelectorAll('.option-btn').forEach(btn => {
            if (btn.dataset.value === correctAnswer) {
                btn.classList.add('correct');
            }
        });
        notifications.show('Incorrecto. Revisa el resultado.', 'error', 2000);
    }

    // Cambiar el botón para pasar a la siguiente
    const submitAnswerBtn = document.getElementById('submitAnswerBtn');
    if (submitAnswerBtn) {
        submitAnswerBtn.textContent = "Siguiente Pregunta >>";
        submitAnswerBtn.replaceWith(submitAnswerBtn.cloneNode(true));
        const newSubmitBtn = document.getElementById('submitAnswerBtn');
        newSubmitBtn.addEventListener('click', nextQuestion);
    }
}

function nextQuestion() {
    currentQuestionIndex++;
    loadQuestion();
}

function finishQuiz() {
    const user = auth.currentUser;
    if (user) {
        updateQuizResultsAndStreak(user.uid);
    }
    
    const scorePercentage = Math.round((correctAnswers / totalQuestions) * 100);
    
    const resultsHTML = `
        <div class="results-container text-center">
            <h2>🎉 Quiz Completado</h2>
            <div class="score-display">
                <h3>Puntuación: ${correctAnswers}/${totalQuestions}</h3>
                <p>${scorePercentage}% de respuestas correctas</p>
            </div>
            <button id="retryQuizBtn" class="btn btn-primary mt-3">Reintentar Quiz</button>
            <button id="backToSetsBtn" class="btn btn-secondary mt-3">Volver a Quizzes</button>
        </div>
    `;
    
    if (resultsView) {
        resultsView.innerHTML = resultsHTML;
        showView('resultsView');
        
        document.getElementById('retryQuizBtn').addEventListener('click', () => {
            currentQuestionIndex = 0;
            correctAnswers = 0;
            shuffleArray(currentQuizData);
            showView('quizActiveView');
            loadQuestion();
        });
        
        document.getElementById('backToSetsBtn').addEventListener('click', () => {
            showView('setSelectionView');
        });
    }
}

async function updateQuizResultsAndStreak(userId) {
    try {
        // Actualizar racha de estudio
        await updateStudyStreak();
        
        // Guardar resultados del quiz (opcional)
        const quizResultsRef = collection(db, 'usuarios', userId, 'quiz_results');
        await addDoc(quizResultsRef, {
            setId: selectedSetId,
            score: correctAnswers,
            totalQuestions: totalQuestions,
            percentage: Math.round((correctAnswers / totalQuestions) * 100),
            timestamp: new Date()
        });
        
        console.log("Resultados del quiz guardados");
    } catch (error) {
        console.error("Error al guardar resultados:", error);
    }
}

function showView(viewId) {
    const views = ['setSelectionView', 'quizActiveView', 'resultsView'];
    views.forEach(view => {
        const element = document.getElementById(view);
        if (element) {
            element.classList.add('hidden');
        }
    });
    
    const activeView = document.getElementById(viewId);
    if (activeView) {
        activeView.classList.remove('hidden');
    }
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}