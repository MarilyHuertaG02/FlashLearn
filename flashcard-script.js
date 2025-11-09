// flashcard-script.js 

import { initializeUserAuth } from './user-auth.js';
import { auth, db } from './firebase.js';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, getDocs, orderBy, query, limit, deleteDoc, doc } from 'firebase/firestore';
import { setupNavigation } from './utils.js';
import { notifications } from './notifications.js';
import { handleLogout } from './auth.js';

// VARIABLES GLOBALES PARA EL POPUP
let setToDelete = null;

// ------------------------------------------
// FUNCIONES PARA MANEJAR POPUPS
// ------------------------------------------

function showDeleteConfirmPopup(setId) {
    setToDelete = setId;
    const popup = document.getElementById('deleteConfirmPopup');
    popup.classList.remove('hidden');
}

function hideDeleteConfirmPopup() {
    const popup = document.getElementById('deleteConfirmPopup');
    popup.classList.add('hidden');
    setToDelete = null;
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
// FUNCIÓN MODIFICADA: CONFIRMAR ELIMINACIÓN
// ------------------------------------------

async function confirmDeleteSet(setId) {
    const user = auth.currentUser;
    if (!user) {
        notifications.show('Error: Sesión no válida.', 'error');
        return;
    }

    // MOSTRAR POPUP EN LUGAR DE ALERT FEO
    showDeleteConfirmPopup(setId);
}

// ------------------------------------------
// NUEVA FUNCIÓN: EJECUTAR ELIMINACIÓN
// ------------------------------------------

async function executeSetDeletion() {
    if (!setToDelete) return;

    const user = auth.currentUser;
    if (!user) return;

    try {
        notifications.showLoading('Eliminando set...');
        
        // 1. Primero eliminar todas las flashcards de la subcolección
        const flashcardsRef = collection(db, 'usuarios', user.uid, 'sets', setToDelete, 'flashcards');
        const flashcardsSnapshot = await getDocs(flashcardsRef);
        
        const deleteFlashcardsPromises = [];
        flashcardsSnapshot.docs.forEach(doc => {
            deleteFlashcardsPromises.push(deleteDoc(doc.ref));
        });
        
        await Promise.all(deleteFlashcardsPromises);
        console.log("Flashcards eliminadas");

        // 2. Luego eliminar el documento principal del set
        const setRef = doc(db, 'usuarios', user.uid, 'sets', setToDelete);
        await deleteDoc(setRef);
        console.log("Set eliminado");

        notifications.hideLoading();
        
        // OCULTAR POPUP DE CONFIRMACIÓN Y MOSTRAR POPUP DE ÉXITO
        hideDeleteConfirmPopup();
        showDeleteSuccessPopup();

        // 3. Recargar la lista de sets después de un delay
        setTimeout(() => {
            loadSetsGallery(user.uid);
        }, 1500);

    } catch (error) {
        console.error("Error al eliminar set:", error);
        notifications.hideLoading();
        hideDeleteConfirmPopup();
        notifications.show('Error al eliminar el set: ' + error.message, 'error');
    }
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
        confirmDeleteBtn.addEventListener('click', executeSetDeletion);
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

    // Logout button
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    console.log("flashcard-script.js iniciado");
    
    // 1. Inicia el motor de autenticación y carga del perfil
    initializeUserAuth(); 
    
    // 2. Configura los botones del sidebar
    setupNavigation(); 
    
    // INICIALIZAR LISTENERS DE POPUPS
    initializePopupListeners();
    
    // 3. Inicia la carga de la galería solo después de la autenticación
    onAuthStateChanged(auth, (user) => {
        if (user) {
            loadSetsGallery(user.uid); // Cargar sets privados del usuario logueado
        }
        // Nota: El user-auth.js se encarga de la redirección si no hay usuario.
    });
});

async function loadSetsGallery(userId) {
    const setsGrid = document.querySelector('.sets-grid');
    setsGrid.innerHTML = '<div class="loading-state">Cargando tus sets...</div>';

    try {
        // --- 1. CARGAR SETS PRIVADOS (Del usuario logueado) ---
        const privateSetsRef = collection(db, 'usuarios', userId, 'sets');
        const privateQuery = query(privateSetsRef, orderBy('fechaDeCreacion', 'desc'));
        const privateSnapshot = await getDocs(privateQuery);
        
        const privateSets = privateSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id, type: 'private' }));
        
        // --- 2. CARGAR SETS PÚBLICOS (El catálogo) ---
        const publicSetsRef = collection(db, 'setsPublicos');
        const publicQuery = query(publicSetsRef, limit(5)); 
        const publicSnapshot = await getDocs(publicQuery);
        
        const publicSets = publicSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id, type: 'public' }));
        
        // --- 3. FUSIONAR (Ponemos los privados primero, luego el catálogo) ---
        const allSets = [...privateSets, ...publicSets];

        if (allSets.length === 0) {
            setsGrid.innerHTML = '<h3>Aún no hay sets disponibles.</h3><p>Crea tu primer set o explora los públicos.</p>';
            return;
        }

        // --- 4. INYECTAR HTML FUSIONADO ---
        let setsHTML = '';
        allSets.forEach(set => {
            const isPrivate = set.type === 'private';
            
            setsHTML += `
<div class="set-card">
        <div class="set-image">
            <img src="${set.imagen || set.imagenUrl || 'img/default-cover.png'}" alt="${set.titulo}">
            ${isPrivate ? '<span class="badge bg-success float-end">Tuyo</span>' : ''}
        </div>
        
        <div class="set-info">
            <h3>${set.titulo}</h3>
            <div class="set-meta">
                <span class="subject">${set.asignatura || 'Materia'}</span>
            </div>
            <p class="set-description">${set.descripcion || 'Sin descripción.'}</p>
            
            <div class="set-actions">
                ${isPrivate ? 
                    `<a href="creacion.html?editId=${set.id}" class="btn-secondary btn-sm me-2" title="Modificar Flashcards">
                        Modificar
                    </a>` 
                    : ''}
                ${isPrivate ? 
                    `<button class="btn btn-secondary btn-sm delete-set-btn" data-set-id="${set.id}" title="Eliminar Set">
                        Eliminar
                    </button>` 
                    : ''}
                <a href="Tarjeta2.html?set=${set.id}" class="btn-primary">Estudiar</a>
            </div>
        </div>
    </div>
            `;
        });
        setsGrid.innerHTML = setsHTML;

        // NUEVO: Adjuntar listeners para eliminar sets
        document.querySelectorAll('.delete-set-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevenir que el clic se propague
                const setId = e.target.dataset.setId;
                console.log("Solicitando eliminar set:", setId);
                confirmDeleteSet(setId);
            });
        });

    } catch (error) {
        console.error("Error al cargar la galería. Revisa Reglas de Firestore:", error);
        notifications.show('Error al cargar sets. Revisa tus reglas de lectura.', 'error');
        setsGrid.innerHTML = '<h3>Error al cargar tus sets.</h3><p>Asegúrate de que tus reglas de Firestore permitan la lectura.</p>';
    }
}