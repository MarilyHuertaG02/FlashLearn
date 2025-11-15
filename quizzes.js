// quizzes.js - Controlador Completo de la Página de Quizzes

// Importaciones de todos los módulos necesarios
import { auth, db } from './firebase.js';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, collection, getDocs, updateDoc, addDoc, limit, query, orderBy, setDoc, deleteDoc } from 'firebase/firestore'; 
import { notifications } from './notifications.js';
import { handleLogout } from './auth.js'; 
import { updateStudyStreak } from './user.js'; // Función para actualizar la racha
import { setupNavigation } from './utils.js'; // Función para la navegación del sidebar
import { initializeUserAuth } from './user-auth.js'; // Motor de carga de perfil

// --- Variables Globales del Quiz ---
let currentQuizData = []; 
let currentQuestionIndex = 0;
let correctAnswers = 0;
let totalQuestions = 0;
let selectedSetId = null;
let currentQuizTitle = ''; // NUEVA VARIABLE: Para almacenar el título del set

// --- DOM Elements ---
const setSelectionView = document.getElementById('setSelectionView');
const quizActiveView = document.getElementById('quizActiveView');
const resultsView = document.getElementById('resultsView');
const availableSetsGrid = document.getElementById('availableSetsGrid');
const submitAnswerBtn = document.getElementById('submitAnswerBtn');


document.addEventListener('DOMContentLoaded', () => {
    // Inicializar el perfil (para el avatar y los puntos)
    initializeUserAuth(); 
    
    // Configurar el sidebar y el botón de cerrar sesión
    setupNavigation(); 
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);

    // Verificar el estado de autenticación (el motor de la página)
    onAuthStateChanged(auth, (user) => {
        if (user) {
            fetchAvailableQuizSets();
        } else {
            // Proteger la página
            window.location.href = 'index.html';
        }
    });
    initializeShareListeners();
});


// ------------------------------------------
// LÓGICA DE CARGA DE SETS Y QUIZ ACTIVO
// ------------------------------------------

async function fetchAvailableQuizSets() {
    availableSetsGrid.innerHTML = '<div class="loading-state">Cargando sets disponibles...</div>';
    
    const user = auth.currentUser;
    if (!user) return; 
    
    try {
        // 1. CARGAR SETS PRIVADOS
        const privateSetsRef = collection(db, 'usuarios', user.uid, 'quizzes_creados'); 
        const privateSnapshot = await getDocs(privateSetsRef);
        const privateSets = privateSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id, type: 'private' }));

        // 2. CARGAR SETS PÚBLICOS
        const publicSetsRef = collection(db, 'setsPublicos');
        const publicSnapshot = await getDocs(publicSetsRef);
        const publicSets = publicSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id, type: 'public' }));
        
        // 3. FUSIONAR y renderizar
        const allSets = [...privateSets, ...publicSets];
        
        if (allSets.length === 0) {
            availableSetsGrid.innerHTML = '<p class="text-center">No hay quizzes disponibles por el momento. 😕</p>';
            return;
        }

        let setsHTML = '';
        allSets.forEach(set => {
            const isPrivate = set.type === 'private';
            const imageUrl = set.imagenUrl || set.imagen || 'img/default-quiz-cover.png'; 
            
            setsHTML += `
<div class="set-card">
    <div class="set-image">
        <img src="${imageUrl}" alt="${set.titulo || 'Quiz'}">
        ${isPrivate ? '<span class="badge bg-success float-end">Tuyo</span>' : ''}
    </div>
    
    <div class="set-info">
        <h3>${set.titulo || 'Quiz sin título'}</h3>
        <div class="set-meta">
            <span class="subject">${set.asignatura || 'General'}</span>
        </div>
        <p class="set-description">${set.descripcion || 'Pon a prueba tus conocimientos.'}</p>
        
        <div class="set-actions">
            <!-- Botón Comenzar Quiz en la parte superior, ocupa todo el ancho -->
            <button class="btn-primary study-btn-full start-quiz-btn" 
                    data-set-id="${set.id}" 
                    data-set-type="${set.type}">
                Comenzar Quiz
            </button>
            
            <!-- Botones secundarios en fila debajo -->
            <div class="secondary-actions">
                ${isPrivate ? 
                    `<a href="crearQuices.html?editId=${set.id}" class="btn-secondary btn-sm" title="Modificar Quiz">
                        Modificar
                    </a>` 
                    : ''}
                
                ${isPrivate ? 
                    `<button class="btn btn-secondary btn-sm share-set-btn" data-set-id="${set.id}" title="Compartir con enlace">
                        Compartir
                    </button>` 
                    : ''}

                ${isPrivate ? 
                    `<button class="btn btn-secondary btn-sm delete-set-btn" data-set-id="${set.id}" title="Eliminar Quiz">
                        Eliminar
                    </button>` 
                    : ''}
            </div>
        </div>
    </div>
</div>
`;
        });
        
        availableSetsGrid.innerHTML = setsHTML;
        
        document.querySelectorAll('.start-quiz-btn').forEach(button => {
            button.addEventListener('click', (e) => startQuiz(e.target.dataset.setId, e.target.dataset.setType));
        });

    } catch (error) {
        console.error("Error al cargar sets para quiz:", error);
        notifications.show('Error al cargar sets para quiz.', 'error');
        showView('setSelectionView');
    }
     // NUEVO: Adjuntar listeners para eliminar sets
        // En fetchAvailableQuizSets(), modifica esta parte:
document.querySelectorAll('.delete-set-btn').forEach(button => {
    button.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevenir que el clic se propague
        const setId = e.target.dataset.setId;
        console.log("Solicitando eliminar set:", setId);
        confirmDeleteSet(setId);
    });
});
document.querySelectorAll('.share-set-btn').forEach(button => {
    button.addEventListener('click', (e) => {
        const quizId = e.target.dataset.setId;
        const user = auth.currentUser;
        if (user) {
            shareQuiz(user.uid, quizId);
        }
    });
});

}

async function startQuiz(setId, setType) {
    selectedSetId = setId;
    const user = auth.currentUser;
    if (!user) return; 

    try {
        notifications.showLoading('Cargando preguntas...');
        
        let questionsRef;
        let setDocRef;
        
        if (setType === 'private') {
            setDocRef = doc(db, 'usuarios', user.uid, 'quizzes_creados', setId);
            questionsRef = collection(setDocRef, 'preguntas');
        } else {
            setDocRef = doc(db, 'setsPublicos', setId);
            questionsRef = collection(setDocRef, 'flashcards');
        }

        // OBTENER EL TÍTULO DEL SET - MODIFICACIÓN CLAVE
        const setDoc = await getDoc(setDocRef);
        if (setDoc.exists()) {
            const setData = setDoc.data();
            currentQuizTitle = setData.titulo || 'Quiz sin título';
        } else {
            currentQuizTitle = 'Quiz sin título';
        }

        const cardsSnapshot = await getDocs(questionsRef);
        
        if (cardsSnapshot.empty) {
            notifications.show('Este set no tiene preguntas disponibles.', 'error');
            return;
        }

        currentQuizData = cardsSnapshot.docs.map(doc => {
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
        
        currentQuestionIndex = 0;
        correctAnswers = 0;
        
        showView('quizActiveView');
        loadQuestion();

    } catch (error) {
        console.error("Error al iniciar el quiz:", error);
        notifications.show('Error al iniciar el quiz.', 'error');
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

    // 1. Actualizar texto de la pregunta - MODIFICACIÓN CLAVE: Usar currentQuizTitle
    document.getElementById('quizTitle').textContent = `Quiz: ${currentQuizTitle}`;
    document.getElementById('currentQuestionNumber').textContent = currentQuestionIndex + 1;
    document.getElementById('totalQuestions').textContent = totalQuestions;
    document.getElementById('questionText').textContent = questionData.pregunta;

    // 2. Generar las opciones
    const options = generateOptions(questionData.respuesta, questionData.opciones_incorrectas);
    
    optionsContainer.innerHTML = options.map(option => `
        <button class="option-btn" data-value="${option.value}">${option.text}</button>
    `).join('');
    
    // 3. Resetear el botón de submit
    if (submitAnswerBtn) {
        submitAnswerBtn.disabled = true;
        submitAnswerBtn.textContent = "Selecciona una opción"; 
        
        submitAnswerBtn.removeEventListener('click', nextQuestion);
        submitAnswerBtn.addEventListener('click', checkAnswer); 
    }

    // 4. Adjuntar listeners de opción
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
        notifications.show('¡Respuesta Correcta! ✅', 'success', 1000);
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
        
        // 🚨 ELIMINAMOS EL REEMPLAZO DE NODO (clonenode) Y SIMPLEMENTE CAMBIAMOS LISTENERS
        submitAnswerBtn.removeEventListener('click', checkAnswer);
        submitAnswerBtn.addEventListener('click', nextQuestion);
    }
}

function nextQuestion() {
    currentQuestionIndex++;
    loadQuestion();
}

// 🚨 MODIFICACIÓN CLAVE: Función finishQuiz debe ser ASYNC
async function finishQuiz() {
    const user = auth.currentUser;
    if (user) {
        const results = await updateQuizResultsAndStreak(Math.round((correctAnswers / totalQuestions) * 100));
        
        // 1. Actualizar la vista de resultados con los datos de Firebase
        document.getElementById('correctCount').textContent = `${correctAnswers}/${totalQuestions}`;
        document.getElementById('scorePercentage').textContent = `${results.scorePercentage}%`;
        
        // Mostrar Puntos Ganados y Racha
        document.getElementById('pointsGainedDisplay').textContent = `+${results.pointsGained} Puntos`;
        document.getElementById('newStreakDays').textContent = `${results.newStreak} Días`;
    }
    
    showView('resultsView');
    
    // 🚨 1. ADJUNTAR LISTENER DE REPETIR QUIZ
    const finalRetakeBtn = document.getElementById('retakeQuizBtn');
    if (finalRetakeBtn) {
        finalRetakeBtn.addEventListener('click', () => {
            currentQuestionIndex = 0;
            correctAnswers = 0;
            shuffleArray(currentQuizData); // Re-mezclar
            showView('quizActiveView');
            loadQuestion();
        });
    }
    
    // 🚨 2. ADJUNTAR LISTENER DE VOLVER A SETS
    const backToSetsBtn = document.getElementById('backToSetsBtn'); // Asumiendo que el botón Volver al Menú tiene este ID
    if (backToSetsBtn) {
        backToSetsBtn.addEventListener('click', () => {
            showView('setSelectionView');
        });
    }
}


async function updateQuizResultsAndStreak(scorePercentage) {
    const user = auth.currentUser;
    if (!user) return { newStreak: 0, pointsGained: 0, scorePercentage }; // Valor de retorno seguro
    
    const BASE_POINTS = 5; 
    const pointsGained = Math.ceil((totalQuestions * scorePercentage) / 100) * BASE_POINTS;
    const currentMonth = new Date().toLocaleString('es-MX', { month: 'short' }).toLowerCase().replace('.', '');
    
    try {
        // 1. Registrar el resultado del quiz (historial)
        const quizRef = collection(db, 'usuarios', user.uid, 'quizzes');
        await addDoc(quizRef, {
            setId: selectedSetId,
            fecha: new Date(),
            correctas: correctAnswers,
            totalPreguntas: totalQuestions,
            porcentaje: scorePercentage / 100
        });

        // 2. Cargar los datos actuales del usuario para hacer el update atómico
        const userRef = doc(db, 'usuarios', user.uid);
        const userSnap = await getDoc(userRef);
        const userData = userSnap.data() || {};
        
        // 3. ACTUALIZACIÓN DE DATOS (Puntos y Progreso Mensual)
        await updateDoc(userRef, {
            puntosTotales: (userData.puntosTotales || 0) + pointsGained,
            [`progresoMensual.${currentMonth}`]: (userData.progresoMensual?.[currentMonth] || 0) + totalQuestions
        });

        // 4. Actualizar la racha diaria
        const newStreak = await updateStudyStreak(user.uid); 

        notifications.show(`🎉 Ganaste ${pointsGained} Puntos y tu racha es de ${newStreak} días.`, 'success');

        // 5. Retornar el resultado completo
        return { newStreak: newStreak, pointsGained: pointsGained, scorePercentage: scorePercentage }; 

    } catch (error) {
        console.error("Error al guardar resultados, puntos o racha:", error);
        notifications.show('Error al guardar el progreso.', 'error');
        return { newStreak: 0, pointsGained: 0, scorePercentage }; 
    }
}


// ------------------------------------------
// UTILERÍAS
// ------------------------------------------

function showView(viewId) {
    document.getElementById('setSelectionView').classList.add('hidden');
    document.getElementById('quizActiveView').classList.add('hidden');
    document.getElementById('resultsView').classList.add('hidden');
    
    document.getElementById(viewId).classList.remove('hidden');
    
    // RESETEAR EL TÍTULO CUANDO VUELVES A LA VISTA DE SETS
    if (viewId === 'setSelectionView') {
        currentQuizTitle = '';
    }
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}
// ------------------------------------------
// FUNCIONES PARA ELIMINAR QUIZ
// ------------------------------------------

let setToDelete = null;

// Función para confirmar eliminación
function confirmDeleteSet(setId) {
    setToDelete = setId;
    showDeletePopup();
}

// Mostrar popup de confirmación
function showDeletePopup() {
    const popup = document.getElementById('deleteConfirmPopup');
    if (popup) {
        popup.classList.remove('hidden');
        
        // Configurar botones del popup
        document.getElementById('cancelDeleteBtn').onclick = hideDeletePopup;
        document.getElementById('confirmDeleteBtn').onclick = executeDeleteSet;
    }
}

// Ocultar popup de confirmación
function hideDeletePopup() {
    const popup = document.getElementById('deleteConfirmPopup');
    if (popup) {
        popup.classList.add('hidden');
    }
    setToDelete = null;
}

// Ejecutar eliminación en Firestore
async function executeDeleteSet() {
    if (!setToDelete) return;
    
    const user = auth.currentUser;
    if (!user) return;
    
    try {
        notifications.showLoading('Eliminando quiz...');
        
        // Referencia al documento del quiz
        const quizRef = doc(db, 'usuarios', user.uid, 'quizzes_creados', setToDelete);
        
        // PRIMERO: Eliminar todas las preguntas de la subcolección
        const questionsRef = collection(quizRef, 'preguntas');
        const questionsSnapshot = await getDocs(questionsRef);
        
        // Eliminar cada pregunta individualmente
        const deletePromises = questionsSnapshot.docs.map(questionDoc => 
            deleteDoc(doc(questionsRef, questionDoc.id))
        );
        
        await Promise.all(deletePromises);
        
        // SEGUNDO: Eliminar el documento principal del quiz
        await deleteDoc(quizRef);
        
        hideDeletePopup();
        showDeleteSuccessPopup();
        
        // Recargar la lista de quizzes
        setTimeout(() => {
            fetchAvailableQuizSets();
            hideDeleteSuccessPopup();
        }, 2000);
        
    } catch (error) {
        console.error("Error eliminando quiz:", error);
        notifications.show('Error al eliminar el quiz.', 'error');
        hideDeletePopup();
    } finally {
        notifications.hideLoading();
    }
}

// Mostrar popup de éxito
function showDeleteSuccessPopup() {
    const popup = document.getElementById('deleteSuccessPopup');
    if (popup) {
        popup.classList.remove('hidden');
        document.getElementById('closeSuccessBtn').onclick = hideDeleteSuccessPopup;
    }
}

// Ocultar popup de éxito
function hideDeleteSuccessPopup() {
    const popup = document.getElementById('deleteSuccessPopup');
    if (popup) {
        popup.classList.add('hidden');
    }
}
// 🔥 FUNCIONES PARA COMPARTIR QUIZ
function showSharePopup(shareLink) {
    const popup = document.getElementById('sharePopup');
    const input = document.getElementById('shareLinkInput');
    
    if (popup && input) {
        input.value = shareLink;
        popup.classList.remove('hidden');
        input.select();
        input.setSelectionRange(0, 99999);
    }
}

function hideSharePopup() {
    const popup = document.getElementById('sharePopup');
    if (popup) {
        popup.classList.add('hidden');
    }
}

async function shareQuiz(userId, quizId) {
    notifications.showLoading('Preparando quiz para compartir...');

    try {
        // 1. Obtener la referencia al quiz privado del usuario
        const privateQuizRef = doc(db, 'usuarios', userId, 'quizzes_creados', quizId);
        const privateQuizSnap = await getDoc(privateQuizRef);

        if (!privateQuizSnap.exists()) {
            notifications.show('Error: El quiz original no fue encontrado.', 'error');
            notifications.hideLoading();
            return;
        }

        const privateQuizData = privateQuizSnap.data();

        // 2. Definir la colección central de quizzes compartidos
        const sharedQuizzesRef = collection(db, 'quizzesCompartidos');
        
        // 3. Crear o actualizar el documento de referencia en la colección central
        const sharedDocRef = doc(sharedQuizzesRef, quizId);
        await setDoc(sharedDocRef, {
            titulo: privateQuizData.titulo,
            asignatura: privateQuizData.asignatura,
            descripcion: privateQuizData.descripcion,
            imagenUrl: privateQuizData.imagenUrl || privateQuizData.imagen || 'img/default-quiz-cover.png',
            creadorId: userId,
            fechaCompartido: new Date(),
            rutaOrigen: `usuarios/${userId}/quizzes_creados/${quizId}`
        });

        // 4. Generar el enlace
        const shareLink = `${window.location.origin}/quiz-player.html?quiz=${quizId}&shared=true`;

        notifications.hideLoading();
        
        // 5. Mostrar el popup
        showSharePopup(shareLink);

    } catch (error) {
        notifications.hideLoading();
        console.error("Error al compartir quiz:", error);
        notifications.show('Error al compartir quiz. Revisa reglas de escritura.', 'error');
    }
}

// 🔥 INICIALIZAR LISTENERS PARA COMPARTIR
function initializeShareListeners() {
    const closeSharePopupBtn = document.getElementById('closeSharePopupBtn');
    const copyShareLinkBtn = document.getElementById('copyShareLinkBtn');

    if (closeSharePopupBtn) {
        closeSharePopupBtn.addEventListener('click', hideSharePopup);
    }

    if (copyShareLinkBtn) {
        copyShareLinkBtn.addEventListener('click', () => {
            const input = document.getElementById('shareLinkInput');
            if (input) {
                input.select();
                input.setSelectionRange(0, 99999);
                navigator.clipboard.writeText(input.value).then(() => {
                    notifications.show('¡Enlace copiado al portapapeles!', 'success', 3000);
                });
            }
        });
    }

    // Cerrar popup haciendo clic fuera del contenido
    const sharePopup = document.getElementById('sharePopup');
    if (sharePopup) {
        sharePopup.addEventListener('click', (e) => {
            if (e.target === sharePopup) {
                hideSharePopup();
            }
        });
    }
}