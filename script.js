// script.js - Controlador principal del dashboard (menu.html)

import { auth, db } from './firebase.js'; 
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, collection, getDocs, limit, query, orderBy } from 'firebase/firestore'; 
import { handleLogout } from './auth.js'; 
import { notifications } from './notifications.js';
import { setupNavigation } from './utils.js';

// Variable global para la instancia de Chart.js
let flashcardsChartInstance = null; 

document.addEventListener('DOMContentLoaded', () => {
    // 1. Iniciar el motor de autenticación
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            console.log("Usuario autenticado:", user.uid);
            
            // Carga los datos del usuario (incluyendo progreso mensual y ultimaActividad)
            const userData = await loadUserData(user); 
            
            if (userData) {
                // 2. Poblar la interfaz con los datos cargados
                updateUserInterface(user, userData);
                
                // 3. Cargar el gráfico y la racha semanal
                setupProgressChart(userData.progresoMensual || {}); 
                setupWeeklyStreak(userData.ultimaActividad); // 🚨 PASAMOS EL TIMESTAMP DE LA ÚLTIMA ACTIVIDAD
                await loadRecentSets(user.uid); 
            }
            setupLogoutButton();
            setupNavigation(); 
        } else {
            // Protección de página
            if (window.location.pathname.indexOf('index.html') === -1 && 
                window.location.pathname.indexOf('registro.html') === -1) {
                window.location.href = 'index.html';
            }
        }
    });
});

// --- Funciones de Carga de Datos y UI ---

async function loadUserData(user) {
    try {
        const userRef = doc(db, 'usuarios', user.uid);
        const userSnap = await getDoc(userRef);
        
        if (userSnap.exists()) {
            return userSnap.data();
        } else {
             // Fallback si no hay documento en Firestore
             return { 
                nombre: user.displayName || user.email.split('@')[0],
                puntosTotales: 0,
                nivelActual: 1,
                rachaActualDias: 0,
                progresoMensual: {},
                fotoPerfilUrl: user.photoURL || "img/user.png",
                ultimaActividad: null // Aseguramos que el campo exista, aunque sea nulo
            };
        }
    } catch (error) {
        console.error("Error al cargar datos del usuario desde Firestore:", error);
        return null;
    }
}

function updateUserInterface(user, userData) {
    const userName = userData.nombre || user.email.split('@')[0];
    
    const nameElements = document.querySelectorAll('#userName, #userProfileName');
    nameElements.forEach(el => el.textContent = userName.toUpperCase());
    
    updateElementIfExists('userPoints', `${userData.puntosTotales || 0} Puntos`);
    updateElementIfExists('userLevel', `Nivel ${userData.nivelActual || 1}`);
    updateElementIfExists('streakDays', userData.rachaActualDias || 0); 
    
    const profilePicElement = document.getElementById('userProfilePic');
    if (profilePicElement) {
        profilePicElement.src = user.photoURL || userData.fotoPerfilUrl || 'img/user.png';
    }
}

function updateElementIfExists(elementId, content) {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = content;
    }
}

// Configurar el botón de cerrar sesión
function setupLogoutButton() {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout); 
    }
}

// FUNCIÓN CLAVE: ACTIVAR RACHA SEMANAL BASADA EN LA ÚLTIMA ACTIVIDAD
function setupWeeklyStreak(ultimaActividadTimestamp) {
    const streakDaysContainer = document.getElementById('streak-days-container');
    if (!streakDaysContainer) return;

    const dayElements = streakDaysContainer.querySelectorAll('.day');
    
    let lastStudyDayIndex = -1; 
    
    if (ultimaActividadTimestamp && ultimaActividadTimestamp.toDate) {
        // Convierte el timestamp de Firebase a un objeto Date de JavaScript
        const lastActivityDate = ultimaActividadTimestamp.toDate(); 
        
        // getDay() retorna 0 (Dom), 1 (Lun)... 6 (Sáb). 
        // Esta fórmula mapea: 0=Lun, 6=Dom
        lastStudyDayIndex = (lastActivityDate.getDay() + 6) % 7; 
    }

    // 2. Aplicar la clase 'active' solo al día registrado
    dayElements.forEach((dayEl, index) => {
        
        // Si el índice del día (0=Lun, 1=Mar) coincide con el día de la última actividad, activarlo.
        if (index === lastStudyDayIndex) {
            dayEl.classList.add('active');
        } else {
            dayEl.classList.remove('active');
        }

        // 3. Mantener el listener visual (para simulación manual)
        dayEl.addEventListener('click', () => {
            // Permitimos alternar la clase (solo visualmente)
            dayEl.classList.toggle('active');
        });
    });
}


// FUNCIÓN CLAVE: CARGA DEL GRÁFICO
function setupProgressChart(progresoMensual) {
    const ctx = document.getElementById('flashcardsChart');
    if (!ctx) return;
    
    const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    
    const chartDataValues = meses.map(mes => progresoMensual[mes] || 0);

    const chartConfig = {
        type: 'line',
        data: {
            labels: meses.map(m => m.toUpperCase()), 
            datasets: [{
                label: 'Flashcards Aprendidas',
                data: chartDataValues,
                borderColor: '#539091', 
                backgroundColor: 'rgba(83, 144, 145, 0.3)',
                fill: true,
                tension: 0.3,
                pointBackgroundColor: '#539091',
                pointRadius: 4,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false, 
            scales: {
                y: {
                    beginAtZero: true,
                    title: { display: true, text: 'Cantidad' }
                },
                x: {
                    grid: { display: false }
                }
            },
            plugins: {
                legend: { display: false }
            }
        }
    };

    if (flashcardsChartInstance) {
        flashcardsChartInstance.destroy();
    }
    window.flashcardsChartInstance = new Chart(ctx, chartConfig);
}

async function loadRecentSets(userId) {
    const recentSetsContainer = document.getElementById('recentSetContent'); 
    
    if (!recentSetsContainer) {
        console.error("❌ Contenedor de sets recientes no encontrado (ID: recentSetContent)");
        return;
    }
    
    try {
        // 1. INTENTAR CARGAR SETS PRIVADOS
        const userSetsQuery = query(
            collection(db, 'usuarios', userId, 'sets'), 
            orderBy('fechaDeCreacion', 'desc'), 
            limit(1)
        );
        const userSetsSnapshot = await getDocs(userSetsQuery);
        
        let setDoc, setId, set;

        if (!userSetsSnapshot.empty) {
            setDoc = userSetsSnapshot.docs[0];
            set = setDoc.data();
            setId = setDoc.id;
        } else {
            // 2. FALLBACK: Cargar el set público de Python
            const pythonSetId = 'python-basico';
            const pythonSetRef = doc(db, 'setsPublicos', pythonSetId);
            const pythonSnap = await getDoc(pythonSetRef);

            if (pythonSnap.exists()) {
                setDoc = pythonSnap;
                set = pythonSnap.data();
                setId = pythonSetId;
            } else {
                // 3. Mostrar mensaje de sets vacíos.
                recentSetsContainer.innerHTML = `<p class="empty-state-message text-center p-4">
                    <h3>No hay sets recientes 😴</h3>
                    <p>Empieza a crear o a estudiar un set para verlo aquí.</p>
                </p>`;
                console.log("📝 No se encontraron sets recientes. Mostrando mensaje.");
                return;
            }
        }
        
        // 4. INYECTAR EL HTML si se encontró un set (público o privado)
        recentSetsContainer.innerHTML = `
            <a href="Tarjeta2.html?set=${setId}" class="set-link">
                <div class="set-details">
                    <img src="${set.imagenUrl || 'img/flashcard-image.png'}" alt="Set cover image">
                    <h3>${set.titulo || set.nombre || 'Set Cargado'}</h3>
                    <div class="subject">
                        <span>${set.asignatura || 'General'}</span>
                    </div>
                    <p>${set.descripcion || 'Sin descripción.'}</p>
                </div>
            </a>
        `;
        
    } catch (error) {
        console.error("❌ Error en la consulta de sets recientes. Revisa Reglas/Rutas:", error);
        recentSetsContainer.innerHTML = `<p class="error-message">Error al cargar sets. (Código: ${error.code || 'Desconocido'}).</p>`;
    }
}
