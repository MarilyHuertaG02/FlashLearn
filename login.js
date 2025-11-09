// login.js
import { loginUser, loginWithGoogle } from './auth.js';
import { notifications } from './notifications.js';

console.log("login.js cargado correctamente");

document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM cargado, configurando event listeners...");
    
    const loginForm = document.getElementById('loginForm');
    const googleLoginBtn = document.getElementById('googleLoginBtn');
    
    let googleLoginInProgress = false;

    if (!loginForm) {
        console.error("No se encontró el formulario de login");
        return;
    }

    // Login normal
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        console.log("Formulario de login enviado");

        const email = document.getElementById('correo').value;
        const password = document.getElementById('contrasena').value;
        
        if (!email || !password) {
            notifications.show('Por favor, ingresa correo y contraseña.', 'warning');
            return;
        }

        console.log("Email:", email);
        await loginUser(email, password);
    });
    
    // Login con Google
    if (googleLoginBtn) {
        console.log("Botón de Google encontrado, agregando listener...");
        googleLoginBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            
            // Prevenir múltiples clics
            if (googleLoginInProgress) {
                console.log("Login con Google ya en progreso, ignorando clic...");
                return;
            }
            
            googleLoginInProgress = true;
            console.log("Botón de Google CLICKEADO - Bloqueando más clics");
            
            // Deshabilitar el botón visualmente
            googleLoginBtn.disabled = true;
            googleLoginBtn.style.opacity = '0.6';
            googleLoginBtn.innerHTML = '<img src="img/google-icon.png" alt="Google logo" style="width: 20px; margin-right: 8px;"> Conectando con Google...';
            
            try {
                await loginWithGoogle();
            } catch (error) {
                console.error("Error en login con Google:", error);
            } finally {
                // Rehabilitar el botón después de un tiempo
                setTimeout(() => {
                    googleLoginInProgress = false;
                    googleLoginBtn.disabled = false;
                    googleLoginBtn.style.opacity = '1';
                    googleLoginBtn.innerHTML = '<img src="img/google-icon.png" alt="Google logo" style="width: 20px; margin-right: 8px;"> Iniciar sesión con Google';
                    console.log("Botón de Google rehabilitado");
                }, 3000);
            }
        });
    } else {
        console.error("Botón de Google NO encontrado");
    }
});