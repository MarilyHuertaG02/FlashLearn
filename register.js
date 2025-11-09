// register.js
import { registerUser, loginWithGoogle } from './auth.js';
import { notifications } from './notifications.js';

console.log("register.js cargado correctamente");

document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM cargado, configurando event listeners...");
    
    const registrationForm = document.getElementById('registrationForm');
    const googleRegisterBtn = document.getElementById('googleRegisterBtn');
    
    let googleRegisterInProgress = false;

    // Registro normal con email/contraseña
    if (registrationForm) {
        console.log("Formulario de registro encontrado");
        
        registrationForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            console.log("Formulario de registro enviado");

            const email = document.getElementById('correoElectronico').value;
            const password = document.getElementById('password').value;
            const userName = document.getElementById('nombreUsuario').value;
            
            if (!email || !password || !userName) {
                notifications.show('Por favor, completa todos los campos.', 'warning');
                return;
            }

            console.log("Datos registro:", { email, userName });
            await registerUser(email, password, userName);
        });
    } else {
        console.error("No se encontró el formulario de registro");
    }
    
    // Registro con Google
    if (googleRegisterBtn) {
        console.log("Botón de Google para registro encontrado");
        
        googleRegisterBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            
            // Prevenir múltiples clics
            if (googleRegisterInProgress) {
                console.log("Registro con Google ya en progreso, ignorando clic...");
                return;
            }
            
            googleRegisterInProgress = true;
            console.log("Botón de Google REGISTRO CLICKEADO");
            
            // Deshabilitar el botón visualmente
            googleRegisterBtn.disabled = true;
            googleRegisterBtn.style.opacity = '0.6';
            googleRegisterBtn.textContent = 'Conectando con Google...';
            
            try {
                await loginWithGoogle();
            } catch (error) {
                console.error("Error en registro con Google:", error);
            } finally {
                // Rehabilitar el botón después de un tiempo
                setTimeout(() => {
                    googleRegisterInProgress = false;
                    googleRegisterBtn.disabled = false;
                    googleRegisterBtn.style.opacity = '1';
                    googleRegisterBtn.textContent = 'Registrarse con Google';
                    console.log("Botón de Google registro rehabilitado");
                }, 3000);
            }
        });
    } else {
        console.error("Botón de Google para registro NO encontrado");
    }
});