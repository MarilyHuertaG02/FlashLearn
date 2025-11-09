// crearQuices.js - VERSIÓN MEJORADA CON NAVEGACIÓN COMO FLASHCARDS

const DEBUG_MODE = false; 

import { auth, db } from './firebase.js'; 
import { collection, addDoc, doc, getDoc, getDocs, query, orderBy, updateDoc, deleteDoc } from 'firebase/firestore';
import { notifications } from './notifications.js'; 
import { onUserLoaded } from './user-auth.js'; 

document.addEventListener('DOMContentLoaded', () => {
    
    // --- Definición de elementos DOM ---
    const quizForm = document.getElementById('quizForm');
    const questionsContainer = document.getElementById('questionsContainer');
    const addQuestionBtn = document.getElementById('addQuestionBtn');
    
    const quizTitleInput = document.getElementById('quizTitle');
    const quizAreaInput = document.getElementById('quizArea');
    const quizSummaryInput = document.getElementById('quizSummary');
    
    const setImageInput = document.getElementById('setImage');
    const imagePlaceholder = document.getElementById('imagePlaceholder'); 
    const finishBtn = document.querySelector('button[type="submit"]'); 

    // NUEVOS ELEMENTOS DE NAVEGACIÓN
    const prevQuestionBtn = document.getElementById('prevQuestionBtn');
    const nextQuestionBtn = document.getElementById('nextQuestionBtn');
    const navigationControls = document.getElementById('navigation-controls');

    let questionCounter = 0; 
    let selectedImageFile = null; 
    let currentUser = null; 
    let currentQuestionIndex = 0; 

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
            document.querySelector('h1').textContent = "Modificar Quiz";
            finishBtn.textContent = "Actualizar Quiz";
            
            await loadQuizForEditing(user.uid, currentEditId);
        } else {
            isEditMode = false;
            console.log("Modo Creación (Quiz).");
            addQuestion(); // Añadir primera pregunta
        }
        
        attachInitialListeners();
    });

    // =========================================================
    // 2. NUEVA FUNCIÓN (Cargar Quiz para Edición)
    // =========================================================

    async function loadQuizForEditing(userId, quizId) {
        notifications.showLoading('Cargando quiz para editar...');
        try {
            // 1. Cargar metadatos
            const quizRef = doc(db, 'usuarios', userId, 'quizzes_creados', quizId);
            const quizSnap = await getDoc(quizRef);
            if (!quizSnap.exists()) {
                throw new Error("El quiz a editar no existe.");
            }
            const quizData = quizSnap.data();

            // 2. Poblar formulario (Metadatos)
            quizTitleInput.value = quizData.titulo || '';
            quizAreaInput.value = quizData.asignatura || '';
            quizSummaryInput.value = quizData.descripcion || '';
            imagePlaceholder.src = quizData.imagenUrl || 'img/agregar.png';

            // 3. Cargar preguntas de la subcolección
            const questionsRef = collection(db, 'usuarios', userId, 'quizzes_creados', quizId, 'preguntas');
            const qQuery = query(questionsRef, orderBy('orden', 'asc'));
            const questionsSnapshot = await getDocs(qQuery);

            // 4. Poblar formulario (Preguntas)
            if (questionsSnapshot.empty) {
                addQuestion();
            } else {
                questionsSnapshot.docs.forEach(doc => {
                    const qData = doc.data();
                    addQuestion(qData.pregunta, qData.respuesta, qData.opciones_incorrectas || []);
                });
            }
            
            notifications.hideLoading();

        } catch (error) {
            console.error("Error al cargar quiz para edición:", error);
            notifications.show('Error al cargar datos para editar.', 'error');
            notifications.hideLoading();
            isEditMode = false;
            addQuestion();
        }
    }

    // =========================================================
    // 3. FUNCIONES DE NAVEGACIÓN Y UI (NUEVAS)
    // =========================================================

    const showActiveQuestion = () => {
        const questions = getAllQuestions();
        console.log("Mostrando pregunta activa. Total:", questions.length, "Índice:", currentQuestionIndex);
        
        if (questions.length > 1 && navigationControls) {
            navigationControls.style.display = 'flex'; 
            if (prevQuestionBtn) prevQuestionBtn.disabled = (currentQuestionIndex === 0);
            if (nextQuestionBtn) nextQuestionBtn.disabled = (currentQuestionIndex === questions.length - 1);
        } else if (navigationControls) {
            navigationControls.style.display = 'none'; 
        }
        
        if (questions.length > 0) {
            questions.forEach((question, index) => {
                question.style.display = (index === currentQuestionIndex) ? 'block' : 'none';
            });
        }
    };

    const getAllQuestions = () => {
        return questionsContainer ? Array.from(questionsContainer.querySelectorAll('.question-container')) : [];
    };

    const renumberQuestions = () => {
        const questions = getAllQuestions();
        questions.forEach((question, index) => {
            const questionNumberSpan = question.querySelector('h4 .question-number');
            if (questionNumberSpan) {
                questionNumberSpan.textContent = index + 1;
            }
            
            // Actualizar los names de los inputs
            const questionInput = question.querySelector('input[name^="question_text"]');
            const answerInput = question.querySelector('input[name^="correct_answer"]');
            
            if (questionInput) questionInput.name = `question_text_${index + 1}`;
            if (answerInput) answerInput.name = `correct_answer_${index + 1}`;
        });
    };

    const navigateQuestions = (direction) => {
        const questions = getAllQuestions();
        let newIndex = currentQuestionIndex + direction;
        if (newIndex >= 0 && newIndex < questions.length) {
            currentQuestionIndex = newIndex;
            showActiveQuestion();
        }
    };

    // =========================================================
    // 4. FUNCIONES AUXILIARES (ACTUALIZADAS)
    // =========================================================
    
    const getQuizData = () => {
        const questions = [];
        const questionContainers = getAllQuestions();
        
        questionContainers.forEach((container, index) => {
            const questionText = container.querySelector('input[name^="question_text"]').value.trim();
            const correctAnswerInput = container.querySelector('input[name^="correct_answer"]').value.trim();
            const optionInputs = container.querySelectorAll('.options-container input[type="text"]');
            
            if (questionText && correctAnswerInput) {
                
                const incorrectOptions = Array.from(optionInputs)
                    .map(input => input.value.trim())
                    .filter(val => val && val !== correctAnswerInput);
                
                questions.push({
                    pregunta: questionText,
                    respuesta: correctAnswerInput,
                    opciones_incorrectas: incorrectOptions,
                    orden: index + 1
                });
            }
        });
        return questions;
    };

  // ...
    const handleSaveSuccess = () => {
        if (DEBUG_MODE) {
            notifications.show('✔ ÉXITO: Quiz guardado en DB. Redirección detenida (DEBUG).', 'success', 8000);
            console.log("DEBUG MODE: Redirección detenida. Verifica Firestore manualmente.");
        } else {
            showSuccessPopup('Quiz Creado con Éxito', 'Tu quiz ha sido guardado correctamente.', 'quizzes.html?status=success');
        }
    };

    const handleUpdateSuccess = () => {
        if (DEBUG_MODE) {
            notifications.show('✔ ÉXITO: Quiz actualizado en DB. Redirección detenida (DEBUG).', 'success', 8000);
            console.log("DEBUG MODE: Redirección detenida. Verifica Firestore manualmente.");
        } else {
            showSuccessPopup('Quiz Actualizado con Éxito', 'Tu quiz ha sido actualizado correctamente.', 'quizzes.html?status=updated');
        }
    };
// ...

    const handleSaveError = (error) => {
        console.error("ERROR FATAL AL GUARDAR:", error);
        
        if (DEBUG_MODE) {
            notifications.show(`FALLO DE FIREBASE: ${error.message}. Verifica reglas y rutas.`, 'error', 10000);
        } else {
            notifications.show('Error al guardar. Intenta de nuevo más tarde.', 'error');
        }
    };
    
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
    
    window.removeQuestion = (questionId) => {
        const questionElement = document.getElementById(`question${questionId}`);
        if (questionElement) {
            // Verificar si estamos eliminando la pregunta activa
            const questions = getAllQuestions();
            const questionIndex = Array.from(questions).indexOf(questionElement);
            
            questionElement.remove();
            
            // Ajustar el índice actual si es necesario
            if (currentQuestionIndex >= questions.length - 1 && currentQuestionIndex > 0) {
                currentQuestionIndex--;
            }
            
            renumberQuestions();
            showActiveQuestion();
        }
    };

    // Modificar addQuestion para aceptar valores Y MANEJAR NAVEGACIÓN
    function addQuestion(pregunta = '', respuesta = '', incorrectas = []) {
        questionCounter++;
        const questionHTML = `
            <div class="question-container card mb-3 p-4" id="question${questionCounter}">
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <h4 class="mb-0">Pregunta <span class="question-number">${questionCounter}</span></h4>
                    <button type="button" class="btn btn-danger btn-sm" onclick="removeQuestion(${questionCounter})">Eliminar</button>
                </div>
                
                <div class="mb-3">
                    <label class="form-label fw-semibold">Pregunta:</label>
                    <input type="text" class="form-control" name="question_text_${questionCounter}" value="${pregunta}" placeholder="Escribe la pregunta..." required>
                </div>
                
                <div class="mb-3">
                    <label class="form-label fw-semibold">Respuesta Correcta:</label>
                    <input type="text" class="form-control" name="correct_answer_${questionCounter}" value="${respuesta}" placeholder="Escribe la respuesta correcta..." required>
                </div>

                <div class="options-container">
                    <label class="form-label fw-semibold">Opciones Falsas (Mín. 2):</label>
                    <input type="text" class="form-control mb-2" placeholder="Opción Falsa 1" value="${incorrectas[0] || ''}" required>
                    <input type="text" class="form-control mb-2" placeholder="Opción Falsa 2" value="${incorrectas[1] || ''}" required>
                    <input type="text" class="form-control mb-2" placeholder="Opción Falsa 3 (Opcional)" value="${incorrectas[2] || ''}">
                </div>
            </div>
        `;
        questionsContainer.insertAdjacentHTML('beforeend', questionHTML);
        
        // En modo creación, ir a la nueva pregunta
        if (!isEditMode) {
            const questions = getAllQuestions();
            currentQuestionIndex = questions.length - 1;
        }
        
        renumberQuestions();
        showActiveQuestion();
    }
    
    // =========================================================
    // 5. FUNCIÓN PRINCIPAL DE GUARDADO (ACTUALIZADA)
    // =========================================================

    const saveQuizToFirestore = async (e) => {
        e.preventDefault(); 
        
        const user = currentUser; 
        if (!user) {
            notifications.show('Error: Sesión no detectada. Recarga la página.', 'error');
            return;
        }

        const quizQuestions = getQuizData();
        
        const quizTitle = quizTitleInput.value.trim();
        const quizArea = quizAreaInput.value.trim();
        const quizSummary = quizSummaryInput.value.trim();

        if (quizQuestions.length === 0) {
            notifications.show('Debes agregar al menos una pregunta válida.', 'warning');
            return;
        }
        
        if (!quizTitle || !quizArea) {
            notifications.show('El título y la materia son obligatorios.', 'warning');
            return;
        }

        notifications.showLoading(isEditMode ? 'Actualizando quiz...' : 'Guardando quiz en la nube...');

        try {
            const imageUrl = imagePlaceholder.src.includes('agregar.png') 
                                ? "img/default-quiz-cover.png"
                                : imagePlaceholder.src;

            // CAMBIO CLAVE: Chequear si estamos en modo Edición
            if (isEditMode) {
                // LÓGICA DE ACTUALIZACIÓN
                const quizRef = doc(db, 'usuarios', user.uid, 'quizzes_creados', currentEditId);
                
                // 1. Actualizar metadatos del quiz
                await updateDoc(quizRef, {
                    titulo: quizTitle,
                    asignatura: quizArea,
                    descripcion: quizSummary,
                    imagenUrl: imageUrl,
                    totalPreguntas: quizQuestions.length,
                    fechaActualizacion: new Date()
                });

                // 2. Eliminar preguntas existentes
                const questionsCollectionRef = collection(db, 'usuarios', user.uid, 'quizzes_creados', currentEditId, 'preguntas');
                const existingQuestionsSnapshot = await getDocs(questionsCollectionRef);
                
                const deletePromises = [];
                existingQuestionsSnapshot.docs.forEach(doc => {
                    deletePromises.push(deleteDoc(doc.ref));
                });
                await Promise.all(deletePromises);

                // 3. Agregar nuevas preguntas
                const addPromises = quizQuestions.map(q => {
                    return addDoc(questionsCollectionRef, q);
                });
                await Promise.all(addPromises);
                
                notifications.hideLoading();
                handleUpdateSuccess();

            } else {
                // LÓGICA DE CREACIÓN (la que ya tienes)
                const quizzesRef = collection(db, 'usuarios', user.uid, 'quizzes_creados');
                const newQuizDoc = await addDoc(quizzesRef, {
                    titulo: quizTitle,
                    asignatura: quizArea,
                    descripcion: quizSummary,
                    userId: user.uid,
                    fechaDeCreacion: new Date(),
                    imagenUrl: imageUrl,
                    totalPreguntas: quizQuestions.length,
                    es_quiz_personalizado: true
                });

                const newQuizId = newQuizDoc.id;

                // Guardar las preguntas en la subcolección 'preguntas'
                const questionsCollectionRef = collection(db, 'usuarios', user.uid, 'quizzes_creados', newQuizId, 'preguntas');
                const batchPromises = quizQuestions.map(q => addDoc(questionsCollectionRef, q));

                await Promise.all(batchPromises);
                
                notifications.hideLoading();
                handleSaveSuccess();
            }

        } catch (error) {
            notifications.hideLoading();
            handleSaveError(error);
        }
    };

    // =========================================================
    // 6. INICIALIZACIÓN DE LA APLICACIÓN Y EVENTOS
    // =========================================================

    const attachInitialListeners = () => {
        setupImagePreview(); 
        addQuestionBtn.addEventListener('click', () => addQuestion());
        
        // NUEVOS LISTENERS PARA NAVEGACIÓN
        if (prevQuestionBtn) {
            prevQuestionBtn.addEventListener('click', () => navigateQuestions(-1));
        }
        if (nextQuestionBtn) {
            nextQuestionBtn.addEventListener('click', () => navigateQuestions(1));
        }
        
        finishBtn.addEventListener('click', saveQuizToFirestore);
    };

// [REEMPLAZA la función showSuccessPopup COMPLETA en crearQuices.js con este código para ESTABILIDAD]

function showSuccessPopup(title, message, redirectUrl) {
    const popup = document.getElementById('successPopup');
    
    if (!popup) {
        console.error("Elemento #successPopup no encontrado.");
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
    
    // 2. MOSTRAR popup y aplicar FLEX (para centrado)
    popup.classList.remove('hidden');
    popup.style.display = 'flex'; 
    
    // 3. Función de cierre y redirección (solo al dar clic)
    const closeAndRedirect = () => {
        popup.classList.add('hidden');
        popup.style.display = 'none'; // Ocultar
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
}
});
