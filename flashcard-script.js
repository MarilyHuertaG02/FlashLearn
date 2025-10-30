// flashcard-script.js - CORRECCIÓN DE IMPORTACIONES Y LÓGICA DE CARGA DUAL

import { initializeUserAuth } from './user-auth.js'; 
import { auth, db } from './firebase.js'; // <-- ÚNICA IMPORTACIÓN DE AUTH/DB
import { onAuthStateChanged } from 'firebase/auth';
import { collection, getDocs, orderBy, query, limit } from 'firebase/firestore'; 
import { setupNavigation } from './utils.js';
import { notifications } from './notifications.js'; // Asegurar que esté disponible

document.addEventListener('DOMContentLoaded', () => {
    // 1. Inicia el motor de autenticación y carga del perfil (avatar, nombre)
    initializeUserAuth(); 
    
    // 2. Configura los botones del sidebar (si es necesario)
    setupNavigation(); 
    
    // 3. Inicia la carga de la galería solo después de la autenticación
    onAuthStateChanged(auth, (user) => {
        if (user) {
            loadSetsGallery(user.uid); // Cargar sets privados del usuario logueado
        }
        // Nota: El user-auth.js se encarga de la redirección si no hay usuario.
    });
});

async function loadSetsGallery(userId) {
    const setsGrid = document.querySelector('.sets-grid'); // El contenedor en flashcards.html
    // Si el HTML está limpio, este ID debe ser el que usamos en el CSS para la cuadrícula.
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
            // Asumimos que los campos que faltaban ya fueron agregados en Firestore (titulo, descripcion, imagenUrl)
            
            setsHTML += `
                <div class="set-card">
                    <div class="set-image">
                        <img src="${set.imagenUrl || 'img/default-cover.png'}" alt="${set.titulo}">
                        ${isPrivate ? '<span class="badge bg-success float-end">Tuyo</span>' : ''}
                    </div>
                    <div class="set-info">
                        <h3>${set.titulo}</h3>
                        <div class="set-meta">
                            <span class="subject">${set.asignatura || 'Materia'}</span>
                        </div>
                        <p class="set-description">${set.descripcion || 'Sin descripción.'}</p>
                        <div class="set-actions">
                            <a href="Tarjeta2.html?set=${set.id}" class="btn-primary">Estudiar</a>
                        </div>
                    </div>
                </div>
            `;
        });
        setsGrid.innerHTML = setsHTML;

    } catch (error) {
        console.error("Error al cargar la galería. Revisa Reglas de Firestore:", error);
        notifications.show('Error al cargar sets. Revisa tus reglas de lectura.', 'error');
        setsGrid.innerHTML = '<h3>Error al cargar tus sets.</h3><p>Asegúrate de que tus reglas de Firestore permitan la lectura.</p>';
    }
}