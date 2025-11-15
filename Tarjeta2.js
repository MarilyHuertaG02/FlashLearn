// Tarjeta2.js - VERSIÓN CORREGIDA PARA SINCRONIZACIÓN DE AUTH Y PROGRESO

import { db, auth } from './firebase.js';
import { collection, getDocs, orderBy, query, doc, getDoc, updateDoc } from 'firebase/firestore'; 
import { onAuthStateChanged } from 'firebase/auth'; 
import { notifications } from './notifications.js'; 

document.addEventListener('DOMContentLoaded', () => {
    
    // Contenedores DOM (Inicialización)
    const flashcardArea = document.querySelector('.flashcard-area');
    const setTitle = document.querySelector('.set-header h1');
    const setSubject = document.querySelector('.set-header p');

    // Variables de estado del set
    let currentCardIndex = 0;
    let cards = [];
    let currentSetType = 'Privado'; // Para saber si es set público o privado
    
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

    // ====================================================================
    // 1. FUNCIONES AUXILIARES (MOVIDAS AL PRINCIPIO PARA EL ALCANCE CORRECTO)
    // ====================================================================

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
    
    function resetCardView() {
        if (!flashcard) return;
        flashcard.classList.remove('flipped');
    }
    
    // 🎯 FUNCIÓN PARA ACTUALIZAR ÚLTIMO SET ESTUDIADO
    async function updateLastStudiedSet(userId, setId) {
        try {
            const userRef = doc(db, 'usuarios', userId);
            await updateDoc(userRef, {
                ultimoSetEstudiado: setId,
                ultimaEstudiadoTimestamp: new Date()
            });
            console.log(`📚 Set ${setId} marcado como último estudiado`);
        } catch (error) {
            console.error("Error actualizando último set estudiado:", error);
        }
    }
    
    // 🎯 **NUEVA FUNCIÓN: Actualizar contador mensual de flashcards**
    async function updateMonthlyProgress(userId) {
        try {
            const userRef = doc(db, 'usuarios', userId);
            const userSnap = await getDoc(userRef);
            
            if (userSnap.exists()) {
                const userData = userSnap.data();
                const monthKey = new Date().toLocaleString('es', { month: 'short' });
                const currentCount = userData.progresoMensual?.[monthKey] || 0;
                
                // Incrementar el contador del mes actual
                await updateDoc(userRef, {
                    [`progresoMensual.${monthKey}`]: currentCount + 1,
                    ultimaActividad: new Date()
                });
                
                console.log(`📈 Progreso mensual actualizado: ${monthKey} = ${currentCount + 1} flashcards`);
                
                // 🎯 ACTUALIZAR GRÁFICO EN TIEMPO REAL (si está disponible)
                if (typeof refreshProgressChart === 'function') {
                    setTimeout(() => {
                        refreshProgressChart(userId);
                    }, 500);
                }
            }
        } catch (error) {
            console.error("Error actualizando progreso mensual:", error);
        }
    }

    // 🚨 FUNCIÓN CLAVE: Marcar la tarjeta como aprendida en Firestore
async function markCardAsLearned() {
    const user = auth.currentUser;
    if (!user || cards.length === 0) return;

    const currentCard = cards[currentCardIndex];
    
    try {
        // 🎯 ACTUALIZAR ÚLTIMO SET ESTUDIADO
        await updateLastStudiedSet(user.uid, setId);
        
        let cardRef;
        
        if (currentSetType === 'Privado') {
            cardRef = doc(db, 'usuarios', user.uid, 'sets', setId, 'flashcards', currentCard.id);
        } else {
            cardRef = doc(db, 'setsPublicos', setId, 'flashcards', currentCard.id);
        }
        
        const cardSnap = await getDoc(cardRef);
        
        if (cardSnap.exists()) {
            await updateDoc(cardRef, {
                learned: true,
                dominio: 1,
                lastReviewed: new Date()
            });
            
            console.log(`✅ Tarjeta marcada como aprendida: ${currentCard.pregunta.substring(0, 30)}...`);
            
            // 🎯 GANAR PUNTOS POR FLASHCARD APRENDIDA
            if (typeof gainPoints === 'function') {
                gainPoints(user.uid, 15, "flashcard_learned");
            }
            
            // 🎯 **ACTUALIZAR CONTADOR MENSUAL (PARA AMBOS TIPOS DE SET)**
            await updateMonthlyProgress(user.uid);
            
            // 🎯 **MANTENER pero CORREGIR: Actualizar progreso del dashboard**
            if (currentSetType === 'Privado') {
                await updateDashboardProgress(user.uid, setId); // ← MANTENER pero corregir la función
            }
        }
    } catch (error) {
        console.error("Error al marcar como aprendida:", error);
        notifications.show("Error al guardar progreso", "error");
    }
}

// 🎯 **FUNCIÓN CORREGIDA: Actualizar contador mensual (INCREMENTAL)**
async function updateMonthlyProgress(userId) {
    try {
        const userRef = doc(db, 'usuarios', userId);
        const userSnap = await getDoc(userRef);
        
        if (userSnap.exists()) {
            const userData = userSnap.data();
            const monthKey = new Date().toLocaleString('es', { month: 'short' });
            const currentCount = userData.progresoMensual?.[monthKey] || 0;
            
            // ✅ INCREMENTAR en lugar de sobreescribir
            await updateDoc(userRef, {
                [`progresoMensual.${monthKey}`]: currentCount + 1,
                ultimaActividad: new Date()
            });
            
            console.log(`📈 Progreso mensual INCREMENTADO: ${monthKey} = ${currentCount} → ${currentCount + 1}`);
            
            // 🎯 ACTUALIZAR GRÁFICO EN TIEMPO REAL
            if (typeof refreshProgressChart === 'function') {
                setTimeout(() => {
                    refreshProgressChart(userId);
                }, 500);
            }
        }
    } catch (error) {
        console.error("Error actualizando progreso mensual:", error);
    }
}

    // 🚨 NUEVA FUNCIÓN: Actualizar el progreso mensual en el dashboard
 async function updateDashboardProgress(userId, setId) {
    try {
        // Esto es para estadísticas específicas del set, NO para el progreso mensual
        const progress = await calculateCurrentProgress(userId, setId);
        
        console.log(`📊 Progreso del set ${setId}: ${progress.learned}/${progress.total} flashcards`);
        
        // 🎯 ACTUALIZAR EL SET CON SU PROGRESO ACTUAL (opcional)
        const setRef = doc(db, 'usuarios', userId, 'sets', setId);
        await updateDoc(setRef, {
            progresoActual: progress.percentage || 0,
            ultimaEstudiado: new Date()
        });
        
    } catch (error) {
        console.error("Error actualizando progreso del dashboard:", error);
    }
}
    // 🚨 FUNCIÓN AUXILIAR: Calcular progreso actual
    async function calculateCurrentProgress(userId, setId) {
        try {
            const flashcardsRef = collection(db, 'usuarios', userId, 'sets', setId, 'flashcards');
            const flashcardsSnapshot = await getDocs(flashcardsRef);
            
            const total = flashcardsSnapshot.size;
            let learned = 0;
            
            flashcardsSnapshot.forEach(doc => {
                const flashcard = doc.data();
                if (flashcard.learned === true || flashcard.dominio === 1) {
                    learned++;
                }
            });
            
            return { total, learned };
            
        } catch (error) {
            console.error("Error calculando progreso actual:", error);
            return { total: 0, learned: 0 };
        }
    }

    // 🎯 FUNCIÓN DE DIAGNÓSTICO PARA EL SET ESPECÍFICO
    async function diagnosticarSet(setId, user) {
        console.log('🔍 DIAGNÓSTICO DEL SET:');
        console.log(`- Set ID: ${setId}`);
        console.log(`- Usuario: ${user.uid}`);
        
        try {
            // Verificar en sets privados
            const privateSetRef = doc(db, 'usuarios', user.uid, 'sets', setId);
            const privateSetDoc = await getDoc(privateSetRef);
            
            if (privateSetDoc.exists()) {
                console.log('✅ Set encontrado en PRIVADOS');
                const setData = privateSetDoc.data();
                console.log(`- Título: ${setData.titulo}`);
                console.log(`- Asignatura: ${setData.asignatura}`);
                
                // Contar flashcards
                const flashcardsRef = collection(privateSetDoc.ref, 'flashcards');
                const flashcardsQuery = query(flashcardsRef);
                const flashcardsSnapshot = await getDocs(flashcardsQuery);
                
                console.log(`- Total flashcards en BD: ${flashcardsSnapshot.size}`);
                
                // Mostrar detalles de cada flashcard
                flashcardsSnapshot.forEach((doc, index) => {
                    const card = doc.data();
                    console.log(`  ${index + 1}. ID: ${doc.id}, Pregunta: ${card.pregunta?.substring(0, 30)}..., Orden: ${card.orden}`);
                });
                
            } else {
                // Verificar en sets públicos
                const publicSetRef = doc(db, 'setsPublicos', setId);
                const publicSetDoc = await getDoc(publicSetRef);
                
                if (publicSetDoc.exists()) {
                    console.log('✅ Set encontrado en PÚBLICOS');
                    const setData = publicSetDoc.data();
                    console.log(`- Título: ${setData.titulo || setData.nombre}`);
                    console.log(`- Asignatura: ${setData.asignatura}`);
                    
                    // Contar flashcards
                    const flashcardsRef = collection(publicSetDoc.ref, 'flashcards');
                    const flashcardsQuery = query(flashcardsRef);
                    const flashcardsSnapshot = await getDocs(flashcardsQuery);
                    
                    console.log(`- Total flashcards en BD: ${flashcardsSnapshot.size}`);
                    
                    // Mostrar detalles de cada flashcard
                    flashcardsSnapshot.forEach((doc, index) => {
                        const card = doc.data();
                        console.log(`  ${index + 1}. ID: ${doc.id}, Pregunta: ${card.pregunta?.substring(0, 30)}..., Orden: ${card.orden}`);
                    });
                } else {
                    console.log('❌ Set no encontrado ni en privados ni en públicos');
                }
            }
        } catch (error) {
            console.error('Error en diagnóstico:', error);
        }
    }

    // --------------------------------------------------------------------
    // CÓDIGO PRINCIPAL: INICIALIZACIÓN
    // --------------------------------------------------------------------

    // MOTOR DE CARGA: Esperar el estado de autenticación ANTES de iniciar la carga del set
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            window.location.href = 'index.html'; 
            return;
        }

        try {
            await loadSetData(setId, user); 
            
            if (cards.length > 0) {
                // Inyectar y reasignar DOM
                flashcardArea.innerHTML = getFlashcardHTMLStructure();
                flashcard = document.querySelector('.flashcard');
                flashcardFront = document.querySelector('.flashcard-front');
                flashcardBack = document.querySelector('.flashcard-back');
                flipButton = document.querySelector('.flip-button');
                prevButton = document.querySelector('.nav-button.prev');
                nextButton = document.querySelector('.nav-button.next');
                progressBar = document.querySelector('.progress');

                // Ejecutar la lógica de la tarjeta
                updateCardContent();
                updateProgressBar();
                setupEventListeners();
                
                // Mostrar resumen final
                console.log('🎯 RESUMEN FINAL:');
                console.log(`- Total de flashcards cargadas: ${cards.length}`);
                cards.forEach((card, index) => {
                    console.log(`  ${index + 1}. ${card.pregunta?.substring(0, 30)}...`);
                });
                
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
        
        // 🎯 EJECUTAR DIAGNÓSTICO
        await diagnosticarSet(setId, user);
        
        const privateSetRef = doc(db, 'usuarios', user.uid, 'sets', setId);
        let setDoc = await getDoc(privateSetRef);
        currentSetType = 'Privado';

        if (!setDoc.exists()) {
            const publicSetRef = doc(db, 'setsPublicos', setId);
            setDoc = await getDoc(publicSetRef);
            currentSetType = 'Público';
        }

        if (!setDoc.exists()) {
            throw new Error("Set no encontrado. Verifica que el ID exista en tus sets privados o públicos.");
        }

        // --- Si se encontró el set (Público o Privado) ---
        const setData = setDoc.data();
        
        // Actualizar título y asignatura
        setTitle.textContent = setData.titulo || setData.nombre || "Set No Encontrado";
        setSubject.textContent = setData.asignatura || "Asignatura";
        console.log(`Set cargado (${currentSetType}): ${setData.titulo}`);

        // Cargar flashcards de la subcolección 'flashcards' del documento encontrado
        const flashcardsRef = collection(setDoc.ref, 'flashcards'); 
        
        // 🎯 **CORRECCIÓN: Cargar SIN orden primero para evitar problemas**
        try {
            console.log('🔄 Cargando flashcards SIN ordenamiento...');
            const flashcardsSnapshot = await getDocs(flashcardsRef);
            
            if (!flashcardsSnapshot.empty) {
                cards = flashcardsSnapshot.docs.map(doc => ({
                    id: doc.id, 
                    ...doc.data()
                }));
                console.log(`📚 ${cards.length} flashcards cargadas (sin orden)`);
                
                // 🎯 **ORDENAR MANUALMENTE si existe el campo orden**
                if (cards[0] && cards[0].orden !== undefined) {
                    cards.sort((a, b) => (a.orden || 0) - (b.orden || 0));
                    console.log(`🔄 ${cards.length} flashcards ordenadas manualmente`);
                }
            } else {
                throw new Error("No hay flashcards en este set");
            }
        } catch (error) {
            console.error("Error cargando flashcards:", error);
            throw error;
        }
    }

    // --------------------------------------------------------------------
    // FUNCIONES DE UI Y EVENTOS
    // --------------------------------------------------------------------

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

        nextButton.addEventListener('click', async () => {
            if (currentCardIndex < cards.length - 1) {
                
                // 🚨 MARCAR LA TARJETA ACTUAL COMO APRENDIDA ANTES DE PASAR
                await markCardAsLearned();
                
                currentCardIndex++;
                resetCardView();
                updateCardContent();
                updateProgressBar();
                
                // Mostrar notificación de progreso
                const progress = Math.round(((currentCardIndex) / cards.length) * 100);
                
            } else {
                // 🚨 MARCAR LA ÚLTIMA TARJETA TAMBIÉN
                await markCardAsLearned();
                
                // Mostrar mensaje de completado
                showCompletionMessage();
                
                // Notificación de finalización
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

// 🎯 FUNCIÓN GLOBAL PARA GANAR PUNTOS (si no está disponible desde script.js)
window.gainPoints = async function(userId, points, action) {
    console.log(`🎯 +${points} puntos por ${action} (simulado)`);
    // Esta función será sobreescrita por script.js si está disponible
};