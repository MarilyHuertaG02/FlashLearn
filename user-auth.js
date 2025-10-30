// user-auth.js - MOTOR DE PERFIL Y AUTENTICACIÓN

import { auth, db } from './firebase.js';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { notifications } from './notifications.js';


// ----------------------------------------------------
// FUNCIONES AUXILIARES
// ----------------------------------------------------

// Función auxiliar para actualizar elementos de forma segura
function updateElementIfExists(elementId, content) {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = content;
    }
}

// Configurar logout (se mantiene igual)
function setupLogout() {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                await signOut(auth);
                notifications.show('Sesión cerrada correctamente', 'success');
                setTimeout(() => {
                    window.location.href = 'index.html';
                }, 1500);
            } catch (error) {
                console.error('Error al cerrar sesión:', error);
                notifications.show('Error al cerrar sesión', 'error');
            }
        });
    }
}


// ----------------------------------------------------
// 1. LÓGICA DE CARGA DE DATOS Y UI
// ----------------------------------------------------

// FUNCIÓN CLAVE: Actualiza el HTML de CUALQUIER página
function updateUserInterface(user, userData) {
    console.log("🔍 Actualizando interfaz de usuario...");
    
    const userName = userData.nombre || user.displayName || user.email.split('@')[0];
    
    // Nombres
    const nameElements = document.querySelectorAll('#userName, #userProfileName');
    nameElements.forEach(el => el.textContent = userName.toUpperCase());
    
    // Estadísticas
    updateElementIfExists('streakDays', userData.rachaActualDias || 0);
    updateElementIfExists('userPoints', `${userData.puntosTotales || 0} Puntos`);
    updateElementIfExists('userLevel', `Nivel ${userData.nivelActual || 1}`);
    
    // Foto de perfil
    const profilePicElement = document.getElementById('userProfilePic');
    if (profilePicElement) {
        profilePicElement.src = user.photoURL || userData.fotoPerfilUrl || 'img/user.png';
    }
}


// Cargar datos del usuario desde Firestore
async function loadUserData(user) {
    try {
        const userRef = doc(db, 'usuarios', user.uid);
        const userSnap = await getDoc(userRef);
        
        let userData = {};
        if (userSnap.exists()) {
            userData = userSnap.data();
            console.log("📊 Datos del usuario cargados desde Firestore.");
        } else {
            console.warn("No se encontraron datos del usuario en Firestore. Usando datos de Auth.");
            userData = { // Datos de fallback/iniciales
                nombre: user.displayName || user.email.split('@')[0],
                puntosTotales: 0,
                nivelActual: 1,
                rachaActualDias: 0,
                fotoPerfilUrl: user.photoURL || "img/user.png" 
            };
        }
        
        updateUserInterface(user, userData);
        return userData; // Devolver los datos cargados para onUserLoaded
        
    } catch (error) {
        console.error("Error al cargar datos del usuario:", error);
        updateUserInterface(user, { nombre: user.email.split('@')[0] });
        return null;
    }
}


// ----------------------------------------------------
// 2. EXPORTACIONES CLAVE (El Motor de Inicialización)
// ----------------------------------------------------

/// Esta función es el motor que debes llamar en TODAS las páginas que necesitan el perfil
export function initializeUserAuth() {
    console.log("🔄 Inicializando autenticación de usuario...");
    
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            console.log("✅ Usuario autenticado:", user.uid);
            await loadUserData(user); // Carga los datos y llama a updateUserInterface
            setupLogout(); // Configura el botón de logout
        } else {
            // Protección de página
            if (window.location.pathname.indexOf('index.html') === -1 && 
                window.location.pathname.indexOf('registro.html') === -1) {
                window.location.href = 'index.html';
            }
        }
    });
}


/**
 * 🚨 FUNCIÓN CLAVE: Ejecuta un callback SÓLO después de que el perfil está cargado.
 * Esto soluciona el problema de sincronización en creacion.js.
 */
export function onUserLoaded(callback) {
    // onAuthStateChanged verifica si el usuario está logueado y carga la data
    return onAuthStateChanged(auth, async (user) => {
        if (user) {
            // Llama a loadUserData para que la UI se actualice
            const userData = await loadUserData(user); 
            
            // 🚨 Ejecuta la lógica de la página solo con los datos listos
            if (callback) {
                callback(user, userData);
            }
        } else {
            // Protección de página
            if (window.location.pathname.indexOf('index.html') === -1 && 
                window.location.pathname.indexOf('registro.html') === -1) {
                window.location.href = 'index.html';
            }
        }
    });
}