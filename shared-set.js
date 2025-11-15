// shared-set.js
import { auth, db } from './firebase.js';
import { doc, getDoc, collection, getDocs, setDoc, writeBatch, collection } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { notifications } from './notifications.js';

// Obtener parámetros de la URL
const urlParams = new URLSearchParams(window.location.search);
const userId = urlParams.get('user');
const setId = urlParams.get('set');

document.addEventListener('DOMContentLoaded', async () => {
    if (!userId || !setId) {
        document.getElementById('sharedSetContainer').innerHTML = `
            <div class="error-message">
                <h3>Enlace inválido</h3>
                <p>El enlace de compartir no es válido o ha expirado.</p>
                <a href="index.html" class="btn-primary">Volver al inicio</a>
            </div>
        `;
        return;
    }

    await loadSharedSet(userId, setId);
});

async function loadSharedSet(userId, setId) {
    const container = document.getElementById('sharedSetContainer');
    
    try {
        // 1. Cargar información del set
        const setRef = doc(db, 'usuarios', userId, 'sets', setId);
        const setSnap = await getDoc(setRef);

        if (!setSnap.exists() || !setSnap.data().esPublico) {
            container.innerHTML = `
                <div class="error-message">
                    <h3>Set no disponible</h3>
                    <p>Este set ya no está disponible para ver.</p>
                    <a href="index.html" class="btn-primary">Volver al inicio</a>
                </div>
            `;
            return;
        }

        const setData = setSnap.data();

        // 2. Cargar flashcards del set
        const flashcardsRef = collection(db, 'usuarios', userId, 'sets', setId, 'flashcards');
        const flashcardsSnap = await getDocs(flashcardsRef);
        const flashcards = flashcardsSnap.docs.map(doc => doc.data());

        // 3. Mostrar el set
        container.innerHTML = `
            <div class="shared-set-card">
                <div class="set-header">
                    <div class="set-image">
                        <img src="${setData.imagen || setData.imagenUrl || 'img/default-cover.png'}" alt="${setData.titulo}">
                    </div>
                    <div class="set-info">
                        <h2>${setData.titulo}</h2>
                        <div class="set-meta">
                            <span class="subject">${setData.asignatura || 'General'}</span>
                            <span class="shared-by">Compartido por ${setData.usuarioNombre || 'Usuario'}</span>
                        </div>
                        <p class="set-description">${setData.descripcion || 'Sin descripción.'}</p>
                        <div class="set-stats">
                            <span>${flashcards.length} flashcards</span>
                            <span>•</span>
                            <span>Copiado ${setData.vecesCopiado || 0} veces</span>
                        </div>
                    </div>
                </div>

                <div class="flashcards-preview">
                    <h3>Preview de Flashcards</h3>
                    <div class="flashcards-list">
                        ${flashcards.slice(0, 5).map((card, index) => `
                            <div class="flashcard-preview">
                                <div class="preview-front">${card.frente || card.pregunta}</div>
                                <div class="preview-back">${card.reverso || card.respuesta}</div>
                            </div>
                        `).join('')}
                        ${flashcards.length > 5 ? `<p class="more-cards">+ ${flashcards.length - 5} más flashcards...</p>` : ''}
                    </div>
                </div>

                <div class="shared-actions">
                    ${auth.currentUser ? `
                        <button id="copySetBtn" class="btn-primary btn-large">Copiar a Mis Sets</button>
                    ` : `
                        <div class="login-prompt">
                            <p>💡 Inicia sesión para copiar este set a tu cuenta</p>
                            <a href="index.html" class="btn-primary">Iniciar Sesión</a>
                        </div>
                    `}
                </div>
            </div>
        `;

        // 4. Configurar botón de copiar si el usuario está logueado
        if (auth.currentUser) {
            document.getElementById('copySetBtn').addEventListener('click', () => {
                copiarSetCompartido(userId, setId);
            });
        }

    } catch (error) {
        console.error("Error cargando set compartido:", error);
        container.innerHTML = `
            <div class="error-message">
                <h3>Error al cargar</h3>
                <p>No se pudo cargar el set compartido.</p>
                <a href="index.html" class="btn-primary">Volver al inicio</a>
            </div>
        `;
    }
}

// Función para copiar set (similar a la anterior)
async function copiarSetCompartido(userId, setId) {
    const currentUser = auth.currentUser;
    if (!currentUser) {
        notifications.show('Debes iniciar sesión para copiar sets', 'error');
        return;
    }

    try {
        notifications.showLoading('Copiando set a tu cuenta...');
        
        // ... misma implementación que la función anterior ...
        
    } catch (error) {
        console.error("Error copiando set:", error);
        notifications.hideLoading();
        notifications.show('Error al copiar el set: ' + error.message, 'error');
    }
}