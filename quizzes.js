// quizzes.js - Controlador Completo de la Página de Quizzes

// Importaciones de todos los módulos necesarios
import { auth, db } from './firebase.js';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, collection, getDocs, updateDoc, addDoc, limit, query, orderBy } from 'firebase/firestore'; 
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

// --- DOM Elements (Seleccionados una vez al cargar el DOM) ---
const setSelectionView = document.getElementById('setSelectionView');
const quizActiveView = document.getElementById('quizActiveView');
const resultsView = document.getElementById('resultsView');
const availableSetsGrid = document.getElementById('availableSetsGrid');
const submitAnswerBtn = document.getElementById('submitAnswerBtn');
const retakeQuizBtn = document.getElementById('retakeQuizBtn');


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

    // Configurar listeners de botones principales (se reinician en loadQuestion/finishQuiz)
    if (submitAnswerBtn) submitAnswerBtn.addEventListener('click', checkAnswer);
    if (retakeQuizBtn) retakeQuizBtn.addEventListener('click', () => startQuiz(selectedSetId));
});


// ------------------------------------------
// LÓGICA DE CARGA DE SETS Y UI
// ------------------------------------------

async function fetchAvailableQuizSets() {
    availableSetsGrid.innerHTML = '<div class="loading-state">Cargando sets disponibles...</div>';
    try {
        // Asume que los sets públicos están en una colección llamada 'setsPublicos'
        const setsRef = collection(db, 'setsPublicos');
        const setsSnapshot = await getDocs(setsRef);
        
        if (setsSnapshot.empty) {
            availableSetsGrid.innerHTML = '<p class="text-center">No hay quizzes disponibles por el momento. 😕</p>';
            return;
        }

        let setsHTML = '';
        setsSnapshot.forEach(doc => {
            const set = doc.data();
            const setId = doc.id;
            
            setsHTML += `
                <div class="quiz-set-card" data-set-id="${setId}">
                    <h3>${set.titulo || 'Set sin título'}</h3>
                    <p>Materia: ${set.asignatura || 'General'}</p>
                    <button class="start-quiz-btn" data-set-id="${setId}">Comenzar Quiz</button>
                </div>
            `;
        });
        
        availableSetsGrid.innerHTML = setsHTML;
        
        // Adjuntar listeners de clic a los nuevos botones
        document.querySelectorAll('.start-quiz-btn').forEach(button => {
            button.addEventListener('click', (e) => startQuiz(e.target.dataset.setId));
        });

    } catch (error) {
        console.error("Error al cargar sets para quiz:", error);
        notifications.show('Error al cargar sets para quiz.', 'error');
        availableSetsGrid.innerHTML = `<p class="error-state">Error al cargar sets.</p>`;
    }
}


// ------------------------------------------
// LÓGICA DEL QUIZ ACTIVO
// ------------------------------------------

async function startQuiz(setId) {
    selectedSetId = setId;
    try {
        notifications.showLoading('Cargando preguntas...');
        
        const cardsRef = collection(db, 'setsPublicos', setId, 'flashcards');
        const cardsSnapshot = await getDocs(cardsRef);
        
        if (cardsSnapshot.empty) {
            notifications.show('Este set no tiene preguntas.', 'error');
            return;
        }

        currentQuizData = cardsSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
        totalQuestions = currentQuizData.length;
        shuffleArray(currentQuizData); 
        
        currentQuestionIndex = 0;
        correctAnswers = 0;
        
        showView('quizActiveView');
        loadQuestion();

    } catch (error) {
        console.error("Error al iniciar el quiz:", error);
        notifications.show('Error al cargar el quiz. Intenta de nuevo.', 'error');
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

    // 1. Actualizar texto de la pregunta
    document.getElementById('quizTitle').textContent = `Quiz: ${selectedSetId}`;
    document.getElementById('currentQuestionNumber').textContent = currentQuestionIndex + 1;
    document.getElementById('totalQuestions').textContent = totalQuestions;
    document.getElementById('questionText').textContent = questionData.pregunta;

    // 2. Generar las opciones con datos reales de Firestore
    const options = generateOptions(questionData.respuesta, questionData.opciones_incorrectas);
    
    optionsContainer.innerHTML = options.map(option => `
        <button class="option-btn" data-value="${option.value}">${option.text}</button>
    `).join('');
    
    // Resetear el botón de submit
    submitAnswerBtn.disabled = true;
    submitAnswerBtn.textContent = "Selecciona una opción"; 
    submitAnswerBtn.removeEventListener('click', nextQuestion); // Limpiar listener de la ronda anterior
    submitAnswerBtn.addEventListener('click', checkAnswer); // Apuntar a la calificación

    // Adjuntar listeners de opción
    optionsContainer.querySelectorAll('.option-btn').forEach(btn => {
        btn.addEventListener('click', handleOptionSelect);
    });
}

function generateOptions(correctAnswer, incorrectOptions) {
    let options = [
        { text: correctAnswer, value: correctAnswer } // Respuesta correcta
    ];
    
    if (incorrectOptions && Array.isArray(incorrectOptions)) {
        incorrectOptions.forEach(incorrectText => {
            options.push({ text: incorrectText, value: incorrectText });
        });
    } else {
        // Fallback si no hay opciones incorrectas en el documento
        options.push({ text: "Opción Falsa A", value: "Falsa A" });
        options.push({ text: "Opción Falsa B", value: "Falsa B" });
    }
    
    shuffleArray(options); 
    
    return options;
}

function handleOptionSelect(e) {
    const selectedOption = e.target;
    
    document.querySelectorAll('.option-btn').forEach(btn => btn.classList.remove('selected'));
    
    selectedOption.classList.add('selected');
    
    submitAnswerBtn.disabled = false;
    submitAnswerBtn.textContent = "Comprobar Respuesta";
}

function checkAnswer() {
    const selectedOption = document.querySelector('.option-btn.selected');
    if (!selectedOption) return;

    const questionData = currentQuizData[currentQuestionIndex];
    const selectedValue = selectedOption.dataset.value;
    const correctAnswer = questionData.respuesta; 
    
    const isCorrect = selectedValue === correctAnswer; 

    // 1. Marcar visualmente y bloquear
    document.querySelectorAll('.option-btn').forEach(btn => btn.disabled = true); 
    
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

    // 2. Cambiar el botón para pasar a la siguiente
    submitAnswerBtn.textContent = "Siguiente Pregunta >>";
    
    submitAnswerBtn.removeEventListener('click', checkAnswer);
    submitAnswerBtn.addEventListener('click', nextQuestion);
}

function nextQuestion() {
    currentQuestionIndex++;
    loadQuestion();
}

async function finishQuiz() {
    const scorePercentage = Math.round((correctAnswers / totalQuestions) * 100);
    
    // 1. 🚨 Esperar los resultados de la actualización de Firebase
    const results = await updateQuizResultsAndStreak(scorePercentage); 

    // 2. 🚨 Inyectar la estructura COMPLETA de la vista de resultados
    const resultsView = document.getElementById('resultsView');
    
    resultsView.innerHTML = `
        <h2>¡Quiz Completado!</h2>
        <div class="results-summary">
            <div class="result-item">
                <p class="result-label">Ganancia:</p>
                <h3 id="pointsGainedDisplay">+${results.pointsGained} Puntos</h3>
            </div>

            <div class="result-item">
                <p class="result-label">Aciertos:</p>
                <h3 id="correctCount">${correctAnswers}/${totalQuestions}</h3>
            </div>
            
            <div class="result-item percentage">
                <p class="result-label">Porcentaje:</p>
                <h1 id="scorePercentage">${scorePercentage}%</h1>
            </div>
            
            <div class="result-item streak-info">
                <p class="result-label">Nueva Racha:</p>
                <h3 id="newStreakDays">${results.newStreak} Días</h3>
            </div>
        </div>
        
        <div class="actions">
            <button id="retakeQuizBtn" class="btn-custom">Repetir Quiz</button> 
            <a href="menu.html" class="btn-secondary">Volver al Menú</a>
        </div>
    `;

    // 3. Re-adjuntar el listener al nuevo botón "Repetir Quiz"
    const retakeQuizBtn = document.getElementById('retakeQuizBtn');
    if (retakeQuizBtn) {
        retakeQuizBtn.addEventListener('click', () => startQuiz(selectedSetId));
    }
    
    // 4. Mostrar la vista de resultados
    showView('resultsView');
}
// ------------------------------------------
// LÓGICA DE FIREBASE Y RACHA
// ------------------------------------------

async function updateQuizResultsAndStreak(scorePercentage) {
    const user = auth.currentUser;
    // Retorna un objeto seguro si no hay usuario para que finishQuiz no falle
    if (!user) return { newStreak: 0, pointsGained: 0 }; 
    
    // 1. Cálculo de Puntos y Mes
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
            // Sumar los puntos
            puntosTotales: (userData.puntosTotales || 0) + pointsGained,
            
            // Incrementar el contador del mes actual para el gráfico
            [`progresoMensual.${currentMonth}`]: (userData.progresoMensual?.[currentMonth] || 0) + totalQuestions
        });

        // 4. Actualizar la racha diaria (usando la función importada)
        const newStreak = await updateStudyStreak(user.uid); 

        // 5. Notificación de éxito
        notifications.show(`🎉 Ganaste ${pointsGained} Puntos y tu racha es de ${newStreak} días.`, 'success');

        // 6. Retorna el resultado DENTRO del try
        return { newStreak: newStreak, pointsGained: pointsGained }; 

    } catch (error) {
        console.error("Error al guardar resultados, puntos o racha:", error);
        notifications.show('Error al guardar el progreso.', 'error');
        
        // Retorna un valor de fallo seguro
        return { newStreak: userData.rachaActualDias || 0, pointsGained: 0 }; 
    }
}

// ------------------------------------------
// UTILERÍAS
// ------------------------------------------

function setupQuizListeners() {
    // La lógica de los listeners está en DOMContentLoaded y en las funciones loadQuestion/checkAnswer
}

function showView(viewId) {
    document.getElementById('setSelectionView').classList.add('hidden');
    document.getElementById('quizActiveView').classList.add('hidden');
    document.getElementById('resultsView').classList.add('hidden');
    
    document.getElementById(viewId).classList.remove('hidden');
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}