// auth.js
import { auth, db } from './firebase.js'; 

import { 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword,
    GoogleAuthProvider,
    signInWithPopup, 
    signOut,
} from 'firebase/auth'; // Importación limpia

import { 
    doc, 
    setDoc, 
    getDoc

} from 'firebase/firestore'; // Importación limpia
import { notifications } from './notifications.js';

// Función para crear perfil de usuario (MEJORADA)
async function createInitialUserProfile(userID, userName, email, photoURL = null) {
    const initialData = {
        nombre: userName,
        email: email,
        fechaDeRegistro: new Date().toISOString(),
        puntosTotales: 0,
        nivelActual: 1,
        rachaActualDias: 0,
        fotoPerfilUrl: photoURL || "img/user.png",
        progresoMensual: {}
    };

    try {
        const userRef = doc(db, 'usuarios', userID);
        
        // Primero verificar si ya existe
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
            console.log("El perfil ya existe, no se crea uno nuevo");
            return true;
        }
        
        // Si no existe, crear uno nuevo
        await setDoc(userRef, initialData);
        console.log("Perfil inicial de usuario creado en Firestore.");
        return true;
    } catch (error) {
        console.error("Error al crear el perfil en Firestore:", error);
        
        // Si el error es de permisos, intentar de manera diferente
        if (error.code === 'permission-denied') {
            console.warn("Permisos denegados, el usuario necesitará completar su perfil después");
            return false;
        }
        return false;
    }
}
// Función para cargar datos del usuario en localStorage
async function loadUserDataToStorage(user) {
    try {
        // Obtener datos de Firestore
        const userRef = doc(db, 'usuarios', user.uid);
        const userSnap = await getDoc(userRef);
        
        if (userSnap.exists()) {
            const userData = userSnap.data();
            
            // Guardar en localStorage para acceso rápido
            localStorage.setItem('userProfile', JSON.stringify({
                ...userData,
                uid: user.uid,
                email: user.email,
                displayName: user.displayName,
                photoURL: user.photoURL
            }));
            
            console.log("Datos de usuario cargados en localStorage");
            return userData;
        }
        return null;
    } catch (error) {
        console.error('Error loading user data:', error);
        return null;
    }
}

// REGISTRO
export async function registerUser(email, password, userName) {
    console.log("Iniciando registro...", { email, userName });
    
    const loading = notifications.showLoading('Creando tu cuenta...');
    
    try {
        // Usa 'auth' de la importación
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        console.log("Usuario creado en Auth:", user.uid);

        // Crear perfil en Firestore
        const profileCreated = await createInitialUserProfile(user.uid, userName, email);
        
        notifications.hideLoading();
        
        if (profileCreated) {
            notifications.show('¡Cuenta creada exitosamente! Redirigiendo...', 'success', 2000);
            
            // Cargar datos del usuario antes de redirigir
            await loadUserDataToStorage(user);
            
            // Redirigir después de 2 segundos
            setTimeout(() => {
                console.log('Nuevo usuario - Redirigiendo al tutorial...');
                window.location.href = 'tutorial.html';
            }, 2000);
        } else {
            notifications.show('Cuenta creada, pero hubo un problema con el perfil.', 'warning');
        }
    } catch (error) {
        notifications.hideLoading();
        console.error("Error completo en registro:", error);
        notifications.show(`Error al registrar: ${error.message}`, 'error');
    }
}

// LOGIN NORMAL
export async function loginUser(email, password) {
    console.log("Intentando login con:", email);
    
    const loading = notifications.showLoading('Iniciando sesión...');
    
    try {
        // Usa 'auth' de la importación
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        console.log("Login exitoso:", user.uid);
        
        // Cargar datos del usuario antes de redirigir
        await loadUserDataToStorage(user);
        
        notifications.hideLoading();
        notifications.show('¡Inicio de sesión exitoso! Redirigiendo...', 'success', 2000);
        
        // NUEVO CÓDIGO - Verificar si necesita tutorial
        const tutorialCompleted = localStorage.getItem('tutorialCompleted');
        const dontShowTutorial = localStorage.getItem('dontShowTutorial');
        
        console.log('Estado tutorial:', { tutorialCompleted, dontShowTutorial });
        
        // Redirigir después de 2 segundos
        setTimeout(() => {
            if (!tutorialCompleted && !dontShowTutorial) {
                // Redirigir al tutorial
                console.log('Redirigiendo al tutorial...');
                window.location.href = 'tutorial.html';
            } else {
                // Redirigir al dashboard normal
                console.log('Redirigiendo al menú principal...');
                window.location.href = 'menu.html';
            }
        }, 2000);
        
    } catch (error) {
        notifications.hideLoading();
        console.error("Error completo en login:", error);
        notifications.show(`Error al iniciar sesión: ${error.message}`, 'error');
    }
}

// LOGIN CON GOOGLE (MEJORADO)
export async function loginWithGoogle() {
    console.log("Iniciando login con Google...");
    
    const loading = notifications.showLoading('Conectando con Google...');
    
    try {
        const provider = new GoogleAuthProvider();
        
        provider.addScope('email');
        provider.addScope('profile');
        provider.setCustomParameters({
            prompt: 'select_account'
        });
        
        console.log("Abriendo popup de Google");
        
        const result = await signInWithPopup(auth, provider);
        const user = result.user;
        console.log("Google login exitoso:", user.uid, user.email);
        
        // Verificar si el usuario ya existe en Firestore
        const userRef = doc(db, 'usuarios', user.uid);
        const userSnap = await getDoc(userRef);
        
        if (!userSnap.exists()) {
            console.log("Creando perfil para usuario de Google");
            const profileCreated = await createInitialUserProfile(
                user.uid, 
                user.displayName || user.email.split('@')[0], 
                user.email, 
                user.photoURL
            );
            
            if (!profileCreated) {
                console.warn("No se pudo crear el perfil inicial, pero el usuario está autenticado");
            }
        }
        
        // Intentar cargar datos del usuario
        await loadUserDataToStorage(user);
        
        notifications.hideLoading();
        notifications.show('Inicio de sesión con Google exitoso. Redirigiendo...', 'success', 2000);
        
        // Redirigir según el estado del tutorial
        const tutorialCompleted = localStorage.getItem('tutorialCompleted');
        const dontShowTutorial = localStorage.getItem('dontShowTutorial');
        
        setTimeout(() => {
            if (!tutorialCompleted && !dontShowTutorial) {
                window.location.href = 'tutorial.html';
            } else {
                window.location.href = 'menu.html';
            }
        }, 2000);
        
    } catch (error) {
        notifications.hideLoading();
        console.error("Error completo en Google login:", error);
        
        let errorMessage = `Error al iniciar sesión con Google: ${error.message}`;
        
        if (error.code === 'permission-denied') {
            errorMessage = 'Error de permisos. Por favor, contacta al administrador.';
        } else if (error.code === 'auth/cancelled-popup-request') {
            errorMessage = 'Ya hay una solicitud de login en progreso. Espera un momento.';
        } else if (error.code === 'auth/popup-closed-by-user') {
            errorMessage = 'El popup de Google fue cerrado. Intenta nuevamente.';
        } else if (error.code === 'auth/popup-blocked') {
            errorMessage = 'El popup fue bloqueado por el navegador. Permite popups para este sitio.';
        }
        
        notifications.show(errorMessage, 'error');
        throw error;
    }
}
/*
 * Cierra la sesión del usuario en Firebase y redirige a la página de inicio.
 */
export async function handleLogout() {
    try {
        // Asegúrate de que 'auth' esté disponible en este archivo
        await signOut(auth); 
        
        // Limpiar datos del localStorage
        localStorage.removeItem('userProfile');
        localStorage.removeItem('tutorialCompleted');
        localStorage.removeItem('dontShowTutorial');
        
        // Notificación de éxito y redirección
        // Si no usas notifications.js, reemplaza estas líneas con alert() y window.location.href
        notifications.show('Sesión cerrada correctamente', 'success'); 
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 1500); 
    } catch (error) {
        console.error('Error al cerrar sesión:', error);
        notifications.show('Error al cerrar sesión', 'error');
    }
}

// Función para obtener el perfil del usuario desde localStorage
export function getCurrentUserProfile() {
    const stored = localStorage.getItem('userProfile');
    return stored ? JSON.parse(stored) : null;
}