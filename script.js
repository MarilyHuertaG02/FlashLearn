// script.js - Controlador principal del dashboard (menu.html)

import { auth, db } from './firebase.js'; 
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, collection, getDocs, limit, query, orderBy, updateDoc } from 'firebase/firestore'; 
import { handleLogout } from './auth.js'; 
import { notifications } from './notifications.js';
import { setupNavigation } from './utils.js';

// Variable global para la instancia de Chart.js
let flashcardsChartInstance = null; 

// SISTEMA DE PUNTOS Y NIVELES HÍBRIDO
const POINTS_SYSTEM = {
    flashcard_learned: 15,
    quiz_completed: 30,
    quiz_perfect: 50,
    daily_login: 10,
    set_created: 25,
    streak_7days: 100,
    streak_30days: 300
};

document.addEventListener('DOMContentLoaded', () => {
    // 1. Iniciar el motor de autenticación
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            console.log("Usuario autenticado:", user.uid);
            
            // EJECUTAR DIAGNÓSTICO
            await diagnosticarNivel(user.uid);
            
            // Carga los datos del usuario 
            const userData = await loadUserData(user); 
            
            if (userData) {
                // 2. Poblar la interfaz con los datos cargados
                updateUserInterface(user, userData);
                
                // 3. Cargar el gráfico y la racha semanal
                setupProgressChart(userData.progresoMensual || {}); 
                setupWeeklyStreak(userData.ultimaActividad);
                await loadRecentSets(user.uid); 
                
                // GANAR PUNTOS POR LOGIN DIARIO (si es nuevo día)
                await checkDailyLogin(user.uid, userData.ultimaActividad);
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
        console.log("Cargando datos para usuario:", user.uid);
        const userRef = doc(db, 'usuarios', user.uid);
        const userSnap = await getDoc(userRef);
        
        if (userSnap.exists()) {
            const data = userSnap.data();
            console.log("Datos encontrados en Firestore:", data);

            const nivelActualizado = await updateUserLevel(user.uid);
            return { 
                nombre: data.nombre || user.email.split('@')[0],
                puntosTotales: Number(data.puntosTotales) || 0,
                nivelActual: nivelActualizado,
                rachaActualDias: Number(data.rachaActualDias) || 0,
                progresoMensual: data.progresoMensual || {},
                fotoPerfilUrl: data.fotoPerfilUrl || user.photoURL || "img/user.png",
                ultimaActividad: data.ultimaActividad || null
            };
        } else {
            console.log("Documento de usuario no existe, creando...");
            // Crear datos básicos en localStorage como fallback
            const basicData = {
                nombre: user.displayName || user.email.split('@')[0],
                puntosTotales: 0,
                nivelActual: 1,
                rachaActualDias: 0,
                progresoMensual: {},
                fotoPerfilUrl: user.photoURL || "img/user.png",
                ultimaActividad: null
            };
            
            localStorage.setItem('userProfile', JSON.stringify(basicData));
            return basicData;
        }
    } catch (error) {
        console.error("ERROR CRÍTICO cargando datos:", error);
        
        // FALLBACK: Usar datos básicos del usuario de Auth
        const fallbackData = {
            nombre: user.displayName || user.email.split('@')[0],
            puntosTotales: 0,
            nivelActual: 1,
            rachaActualDias: 0,
            progresoMensual: {},
            fotoPerfilUrl: user.photoURL || "img/user.png",
            ultimaActividad: null
        };
        
        localStorage.setItem('userProfile', JSON.stringify(fallbackData));
        return fallbackData;
    }
}

function updateUserInterface(user, userData) {
    
    const userName = userData.nombre || user.email.split('@')[0];
    
    const nameElements = document.querySelectorAll('#userName, #userProfileName');
    nameElements.forEach(el => el.textContent = userName.toUpperCase());
    
    updateElementIfExists('userPoints', `${userData.puntosTotales || 0} Puntos`);
    updateElementIfExists('userLevel', `Nivel ${userData.nivelActual || 1}`);
    updateElementIfExists('streakDays', userData.rachaActualDias || 0); 
    
    // ACTUALIZAR PROGRESO DE NIVEL
    updateLevelProgress(userData);
    
    const profilePicElement = document.getElementById('userProfilePic');
    if (profilePicElement) {
        profilePicElement.src = userData.fotoPerfilUrl || user.photoURL || 'img/user.png';
    }
}

function updateElementIfExists(elementId, content) {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = content;
    }
}

function setupLogoutButton() {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout); 
    }
}

//ACTIVAR RACHA SEMANAL
function setupWeeklyStreak(ultimaActividadTimestamp) {
    const streakDaysContainer = document.getElementById('streak-days-container');
    if (!streakDaysContainer) return;

    const dayElements = streakDaysContainer.querySelectorAll('.day');
    
    let lastStudyDayIndex = -1; 
    
    if (ultimaActividadTimestamp && ultimaActividadTimestamp.toDate) {
        const lastActivityDate = ultimaActividadTimestamp.toDate(); 
        lastStudyDayIndex = (lastActivityDate.getDay() + 6) % 7; 
    }

    dayElements.forEach((dayEl, index) => {
        if (index === lastStudyDayIndex) {
            dayEl.classList.add('active');
        } else {
            dayEl.classList.remove('active');
        }

        dayEl.addEventListener('click', () => {
            dayEl.classList.toggle('active');
        });
    });
}

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
// 🎯 FUNCIÓN PARA ACTUALIZAR GRÁFICO EN TIEMPO REAL
async function refreshProgressChart(userId) {
    try {
        const userRef = doc(db, 'usuarios', userId);
        const userSnap = await getDoc(userRef);
        
        if (userSnap.exists()) {
            const userData = userSnap.data();
            setupProgressChart(userData.progresoMensual || {});
            console.log("📊 Gráfico actualizado en tiempo real");
        }
    } catch (error) {
        console.error("Error actualizando gráfico:", error);
    }
}

// 🎯 Exportar la nueva función
window.refreshProgressChart = refreshProgressChart;

// 🎯 EXPORTAR FUNCIONES PARA USO EN OTROS ARCHIVOS
window.gainPoints = gainPoints;
window.POINTS_SYSTEM = POINTS_SYSTEM;
window.diagnosticarNivel = diagnosticarNivel;
window.setupProgressChart = setupProgressChart;
// 🎯 SISTEMA HÍBRIDO DE NIVELES

// 🎯 FUNCIÓN PARA ACTUALIZAR Y SINCRONIZAR EL NIVEL
async function updateUserLevel(userId) {
    try {
        const userRef = doc(db, 'usuarios', userId);
        const userSnap = await getDoc(userRef);
        
        if (userSnap.exists()) {
            const userData = userSnap.data();
            const puntosTotales = userData.puntosTotales || 0;
            const rachaDias = userData.rachaActualDias || 0;
            
            // Recalcular nivel híbrido
            const nuevoNivel = await calculateHybridLevel(userId, puntosTotales, rachaDias);
            const nivelActual = userData.nivelActual || 1;
            
            // Solo actualizar si hay cambio
            if (nuevoNivel !== nivelActual) {
                await updateDoc(userRef, {
                    nivelActual: nuevoNivel
                });
                
                console.log(`🔄 Nivel actualizado: ${nivelActual} → ${nuevoNivel}`);
                return nuevoNivel;
            }
            return nivelActual;
        }
        return 1;
    } catch (error) {
        console.error("Error actualizando nivel:", error);
        return 1;
    }
}

// 🎯 CALCULAR NIVEL HÍBRIDO
async function calculateHybridLevel(userId, puntosTotales, rachaDias) {
    // Nivel base por puntos
    const nivelBase = calculateLevelByPoints(puntosTotales);
    
    // Bonus por flashcards (máximo +2 niveles)
    const totalFlashcardsAprendidas = await getTotalFlashcardsLearned(userId);
    const flashcardBonus = Math.min(Math.floor(totalFlashcardsAprendidas / 50), 2);
    
    // Bonus por racha (máximo +3 niveles)
    const rachaBonus = Math.min(Math.floor(rachaDias / 7), 3);
    
    const nivelFinal = Math.min(20, nivelBase + flashcardBonus + rachaBonus);
    
    console.log(`🏆 Nivel cálculo: Base(${nivelBase}) + Flashcards(${flashcardBonus}) + Racha(${rachaBonus}) = ${nivelFinal}`);
    console.log(`📊 Puntos: ${puntosTotales}, Flashcards: ${totalFlashcardsAprendidas}, Racha: ${rachaDias} días`);
    
    return nivelFinal;
}

// 🎯 CALCULAR NIVEL POR PUNTOS (BASE)
function calculateLevelByPoints(puntosTotales) {
    const niveles = [
        0,      // Nivel 1
        100,    // Nivel 2
        250,    // Nivel 3
        500,    // Nivel 4
        850,    // Nivel 5
        1300,   // Nivel 6
        1850,   // Nivel 7
        2500,   // Nivel 8
        3250,   // Nivel 9
        4100,   // Nivel 10
        5050,   // Nivel 11
        6100,   // Nivel 12
        7250,   // Nivel 13
        8500,   // Nivel 14
        9850,   // Nivel 15
        11300,  // Nivel 16
        12850,  // Nivel 17
        14500,  // Nivel 18
        16250,  // Nivel 19
        18100   // Nivel 20
    ];
    
    for (let i = niveles.length - 1; i >= 0; i--) {
        if (puntosTotales >= niveles[i]) {
            return i + 1;
        }
    }
    return 1;
}

// 🎯 GANAR PUNTOS (FUNCIÓN PRINCIPAL)
async function gainPoints(userId, points, action) {
    try {
        const userRef = doc(db, 'usuarios', userId);
        const userSnap = await getDoc(userRef);
        
        if (userSnap.exists()) {
            const userData = userSnap.data();
            const puntosActuales = userData.puntosTotales || 0;
            const nivelActual = userData.nivelActual || 1;
            const nuevosPuntos = puntosActuales + points;
            
            // Calcular nuevo nivel híbrido
            const nuevoNivel = await calculateHybridLevel(
                userId, 
                nuevosPuntos,
                userData.rachaActualDias || 0
            );
            
            await updateDoc(userRef, {
                puntosTotales: nuevosPuntos,
                nivelActual: nuevoNivel,
                ultimaActividad: new Date()
            });
            
            // Notificación de puntos
            notifications.show(`+${points} puntos! 🎯`, 'success', 2000);
            // Notificación de subida de nivel
            if (nuevoNivel > nivelActual) {
                // Mostrar popup de nivel
                if (window.showLevelUpPopup) {
                    window.showLevelUpPopup(nuevoNivel, nivelActual);
                }
                
                // Notificación adicional
                setTimeout(() => {
                    notifications.show(`🎉 ¡NIVEL ${nuevoNivel} ALCANZADO!`, 'success', 4000);
                    // Efecto visual opcional
                    document.body.classList.add('level-up');
                    setTimeout(() => document.body.classList.remove('level-up'), 2000);
                }, 1000);
            }            
            console.log(`+${points} puntos por ${action}. Total: ${nuevosPuntos}, Nivel: ${nuevoNivel}`);
            
            // Actualizar UI
            updateElementIfExists('userPoints', `${nuevosPuntos} Puntos`);
            updateElementIfExists('userLevel', `Nivel ${nuevoNivel}`);
            updateLevelProgress({ puntosTotales: nuevosPuntos, nivelActual: nuevoNivel });
        }
    } catch (error) {
        console.error("Error al actualizar puntos:", error);
    }
}

// 🎯 CONTAR TOTAL DE FLASHCARDS APRENDIDAS
async function getTotalFlashcardsLearned(userId) {
    try {
        let totalAprendidas = 0;
        
        // Contar flashcards aprendidas en todos los sets del usuario
        const setsRef = collection(db, 'usuarios', userId, 'sets');
        const setsSnapshot = await getDocs(setsRef);
        
        for (const setDoc of setsSnapshot.docs) {
            const flashcardsRef = collection(setDoc.ref, 'flashcards');
            const flashcardsSnapshot = await getDocs(flashcardsRef);
            
            flashcardsSnapshot.forEach(doc => {
                const flashcard = doc.data();
                if (flashcard.learned === true || flashcard.dominio === 1) {
                    totalAprendidas++;
                }
            });
        }
        
        return totalAprendidas;
    } catch (error) {
        console.error("Error contando flashcards aprendidas:", error);
        return 0;
    }
}

// 🎯 ACTUALIZAR INTERFAZ CON PROGRESO DE NIVEL
function updateLevelProgress(userData) {
    const nivelActual = userData.nivelActual || 1;
    const puntosActuales = userData.puntosTotales || 0;
    
    // Calcular puntos para el SIGUIENTE nivel (lo que el usuario quiere ver)
    const puntosSiguienteNivel = calculatePointsForLevel(nivelActual + 1);
    const puntosNivelActual = calculatePointsForLevel(nivelActual);
    
    // Mostrar progreso TOTAL hacia el siguiente nivel
    const progresoHaciaSiguienteNivel = puntosActuales - puntosNivelActual;
    const puntosNecesarios = puntosSiguienteNivel - puntosNivelActual;
    const porcentajeProgreso = (progresoHaciaSiguienteNivel / puntosNecesarios) * 100;
    
    // Actualizar barra de progreso si existe
    const levelProgressBar = document.getElementById('levelProgressBar');
    const levelProgressText = document.getElementById('levelProgressText');
    
    if (levelProgressBar) {
        levelProgressBar.style.width = `${Math.min(100, Math.max(0, porcentajeProgreso))}%`;
    }
    
    if (levelProgressText) {
        // 🎯 MOSTRAR: "455/500 XP" en lugar de "205/250 XP"
        levelProgressText.textContent = `${puntosActuales}/${puntosSiguienteNivel} XP`;
    }
    
    console.log(`📊 Nivel ${nivelActual}: ${puntosActuales}/${puntosSiguienteNivel} XP (${Math.round(porcentajeProgreso)}%)`);
}

// 🎯 CALCULAR PUNTOS REQUERIDOS PARA UN NIVEL ESPECÍFICO
function calculatePointsForLevel(nivel) {
    const niveles = [
        0,      // Nivel 1
        100,    // Nivel 2
        250,    // Nivel 3
        500,    // Nivel 4
        850,    // Nivel 5
        1300,   // Nivel 6
        1850,   // Nivel 7
        2500,   // Nivel 8
        3250,   // Nivel 9
        4100,   // Nivel 10
        5050,   // Nivel 11
        6100,   // Nivel 12
        7250,   // Nivel 13
        8500,   // Nivel 14
        9850,   // Nivel 15
        11300,  // Nivel 16
        12850,  // Nivel 17
        14500,  // Nivel 18
        16250,  // Nivel 19
        18100,  // Nivel 20
        20000   // Nivel 21 (para cálculo del último nivel)
    ];
    
    return niveles[Math.min(nivel - 1, niveles.length - 1)] || 0;
}

// 🎯 VERIFICAR LOGIN DIARIO
async function checkDailyLogin(userId, ultimaActividad) {
    try {
        const hoy = new Date();
        const ultimaActividadDate = ultimaActividad ? ultimaActividad.toDate() : null;
        
        // Si es la primera vez o ha pasado más de un día
        if (!ultimaActividadDate || 
            hoy.toDateString() !== ultimaActividadDate.toDateString()) {
            
            await gainPoints(userId, POINTS_SYSTEM.daily_login, "daily_login");
        }
    } catch (error) {
        console.error("Error verificando login diario:", error);
    }
}

// 🎯 FUNCIÓN DE DIAGNÓSTICO - Verificar estado actual
async function diagnosticarNivel(userId) {
    try {
        const userRef = doc(db, 'usuarios', userId);
        const userSnap = await getDoc(userRef);
        
        if (userSnap.exists()) {
            const userData = userSnap.data();
            const puntosTotales = userData.puntosTotales || 0;
            const nivelActual = userData.nivelActual || 1;
            const rachaDias = userData.rachaActualDias || 0;
            
            console.log('🔍 DIAGNÓSTICO DE NIVEL:');
            console.log(`- Puntos totales: ${puntosTotales}`);
            console.log(`- Nivel actual en BD: ${nivelActual}`);
            console.log(`- Racha días: ${rachaDias}`);
            
            // Calcular qué nivel debería tener
            const nivelBase = calculateLevelByPoints(puntosTotales);
            const totalFlashcards = await getTotalFlashcardsLearned(userId);
            const flashcardBonus = Math.min(Math.floor(totalFlashcards / 50), 2);
            const rachaBonus = Math.min(Math.floor(rachaDias / 7), 3);
            const nivelCalculado = Math.min(20, nivelBase + flashcardBonus + rachaBonus);
            
            console.log(`- Nivel base (puntos): ${nivelBase}`);
            console.log(`- Flashcards aprendidas: ${totalFlashcards}`);
            console.log(`- Bonus flashcards: +${flashcardBonus}`);
            console.log(`- Bonus racha: +${rachaBonus}`);
            console.log(`- Nivel calculado: ${nivelCalculado}`);
            console.log(`- ¿Necesita actualización?: ${nivelCalculado !== nivelActual}`);
            
            return nivelCalculado;
        }
    } catch (error) {
        console.error("Error en diagnóstico:", error);
    }
}

// 🚨 FUNCIÓN CORREGIDA: CALCULAR PROGRESO REAL
async function calculateSetProgress(userId, setId) {
    try {
        const flashcardsRef = collection(db, 'usuarios', userId, 'sets', setId, 'flashcards');
        const flashcardsSnapshot = await getDocs(flashcardsRef);
        
        const total = flashcardsSnapshot.size;
        let learned = 0;
        
        // Contar solo las tarjetas realmente marcadas como aprendidas
        flashcardsSnapshot.forEach(doc => {
            const flashcard = doc.data();
            if (flashcard.learned === true || flashcard.dominio === 1) {
                learned++;
            }
        });
        
        const percentage = total > 0 ? Math.round((learned / total) * 100) : 0;
        
        return { total, learned, percentage };
        
    } catch (error) {
        console.error("Error calculando progreso:", error);
        return { total: 0, learned: 0, percentage: 0 };
    }
}

// 🚨 FUNCIÓN CORREGIDA: PARA SETS PÚBLICOS
async function calculatePublicSetProgress(setId) {
    try {
        const flashcardsRef = collection(db, 'setsPublicos', setId, 'flashcards');
        const flashcardsSnapshot = await getDocs(flashcardsRef);
        
        const total = flashcardsSnapshot.size;
        let learned = 0;
        
        // Para sets públicos también contar las aprendidas
        flashcardsSnapshot.forEach(doc => {
            const flashcard = doc.data();
            if (flashcard.learned === true || flashcard.dominio === 1) {
                learned++;
            }
        });
        
        const percentage = total > 0 ? Math.round((learned / total) * 100) : 0;
        
        return { total, learned, percentage };
        
    } catch (error) {
        console.error("Error calculando progreso público:", error);
        return { total: 0, learned: 0, percentage: 0 };
    }
}

// 🎯 FUNCIÓN MEJORADA: CARGAR ÚLTIMO SET ESTUDIADO
async function loadRecentSets(userId) {
    const recentSetsContainer = document.getElementById('recentSetContent'); 
    
    if (!recentSetsContainer) {
        console.error("❌ Contenedor de sets recientes no encontrado");
        return;
    }
    
    try {
        // 🎯 PRIMERO: Buscar el último set estudiado desde el campo del usuario
        const userRef = doc(db, 'usuarios', userId);
        const userSnap = await getDoc(userRef);
        
        if (userSnap.exists()) {
            const userData = userSnap.data();
            const ultimoSetId = userData.ultimoSetEstudiado;
            
            console.log('🔍 Buscando último set estudiado:', ultimoSetId);
            
            if (ultimoSetId) {
                // Intentar cargar el set desde los sets privados del usuario
                const setRef = doc(db, 'usuarios', userId, 'sets', ultimoSetId);
                const setSnap = await getDoc(setRef);
                
                if (setSnap.exists()) {
                    const set = setSnap.data();
                    const progress = await calculateSetProgress(userId, ultimoSetId);
                    console.log(`✅ Set privado encontrado: ${set.titulo}, Progreso: ${progress.percentage}%`);
                    renderSetCard(ultimoSetId, set, progress, "estudiado");
                    return;
                }
                
                // Si no está en sets privados, buscar en sets públicos
                const publicSetRef = doc(db, 'setsPublicos', ultimoSetId);
                const publicSetSnap = await getDoc(publicSetRef);
                
                if (publicSetSnap.exists()) {
                    const set = publicSetSnap.data();
                    const progress = await calculatePublicSetProgress(ultimoSetId);
                    console.log(`✅ Set público encontrado: ${set.titulo}, Progreso: ${progress.percentage}%`);
                    renderSetCard(ultimoSetId, set, progress, "estudiado");
                    return;
                }
                
                console.log('❌ Set ID encontrado pero no existe en privados ni públicos:', ultimoSetId);
            }
        }
        
        // 🎯 SEGUNDO: Si no hay último set estudiado, buscar por fecha de estudio
        console.log('🔍 Buscando por fecha de estudio...');
        await loadRecentSetByLastStudied(userId);
        
    } catch (error) {
        console.error("❌ Error cargando último set estudiado:", error);
        await loadRecentSetByLastStudied(userId);
    }
}

// 🎯 NUEVA FUNCIÓN: Buscar por fecha de estudio (fallback)
async function loadRecentSetByLastStudied(userId) {
    try {
        const userSetsRef = collection(db, 'usuarios', userId, 'sets');
        const userSetsSnapshot = await getDocs(userSetsRef);
        
        let latestSet = null;
        let latestDate = null;
        let latestSetId = null;
        
        console.log(`🔍 Buscando entre ${userSetsSnapshot.size} sets...`);
        
        // Buscar el set con la fecha de últimaEstudiado más reciente
        for (const setDoc of userSetsSnapshot.docs) {
            const setData = setDoc.data();
            if (setData.ultimaEstudiado) {
                const studyDate = setData.ultimaEstudiado.toDate();
                if (!latestDate || studyDate > latestDate) {
                    latestDate = studyDate;
                    latestSet = setData;
                    latestSetId = setDoc.id;
                }
            }
        }
        
        if (latestSet && latestSetId) {
            const progress = await calculateSetProgress(userId, latestSetId);
            console.log(`✅ Set por fecha encontrado: ${latestSet.titulo}, Fecha: ${latestDate}`);
            renderSetCard(latestSetId, latestSet, progress, "estudiado");
            return;
        }
        
        console.log('🔍 No hay sets estudiados, buscando por creación...');
        // 🎯 TERCERO: Si no hay sets estudiados, buscar por creación
        await loadRecentSetByCreation(userId);
        
    } catch (error) {
        console.error("Error en carga por fecha de estudio:", error);
        await loadRecentSetByCreation(userId);
    }
}
// 🎯 FUNCIÓN PARA BUSCAR SET POR CREACIÓN (FALLBACK)
async function loadRecentSetByCreation(userId) {
    const recentSetsContainer = document.getElementById('recentSetContent');
    
    try {
        const userSetsQuery = query(
            collection(db, 'usuarios', userId, 'sets'), 
            orderBy('fechaDeCreacion', 'desc'), 
            limit(1)
        );
        const userSetsSnapshot = await getDocs(userSetsQuery);
        
        if (!userSetsSnapshot.empty) {
            const setDoc = userSetsSnapshot.docs[0];
            const set = setDoc.data();
            const setId = setDoc.id;
            const progress = await calculateSetProgress(userId, setId);
            
            renderSetCard(setId, set, progress, "creado");
        } else {
            // 🎯 CUARTO: Si no hay sets propios, cargar set público
            await loadPublicSetFallback();
        }
    } catch (error) {
        console.error("Error en carga por creación:", error);
        await loadPublicSetFallback();
    }
}

// 🎯 FUNCIÓN PARA CARGAR SET PÚBLICO (FALLBACK FINAL)
async function loadPublicSetFallback() {
    const recentSetsContainer = document.getElementById('recentSetContent');
    
    try {
        const pythonSetId = 'python-basico';
        const pythonSetRef = doc(db, 'setsPublicos', pythonSetId);
        const pythonSnap = await getDoc(pythonSetRef);

        if (pythonSnap.exists()) {
            const set = pythonSnap.data();
            const progress = await calculatePublicSetProgress(pythonSetId);
            
            renderSetCard(pythonSetId, set, progress, "público");
        } else {
            // Mostrar mensaje de sets vacíos.
            recentSetsContainer.innerHTML = `
                <div class="empty-state-message text-center p-4">
                    <h3>No hay sets recientes 😴</h3>
                    <p>Empieza a crear o a estudiar un set para verlo aquí.</p>
                    <a href="creacion.html" class="btn-primary mt-3">Crear mi primer set</a>
                </div>`;
        }
    } catch (error) {
        console.error("Error cargando set público:", error);
        recentSetsContainer.innerHTML = `<p class="error-message">Error al cargar sets.</p>`;
    }
}

// 🎯 FUNCIÓN PARA RENDERIZAR LA TARJETA DEL SET
function renderSetCard(setId, set, progress, setType) {
    const recentSetsContainer = document.getElementById('recentSetContent');
    
    const badge = setType === "estudiado" ? "Último estudiado" : 
                setType === "creado" ? "Recién creado" : "Set público";
    
    const buttonText = progress.learned > 0 ? "Continuar estudiando" : "Comenzar a estudiar";
    
    recentSetsContainer.innerHTML = `
        <a href="Tarjeta2.html?set=${setId}" class="set-link">
            <div class="set-details">
                <div class="set-badge">${badge}</div>
                <h3>${set.titulo || set.nombre || 'Set Cargado'}</h3>
                <div class="subject">
                    <span>${set.asignatura || 'General'}</span>
                    <span class="cards-count">${progress.total || 0} tarjetas</span>
                </div>
                
                <div class="progress-section">
                    <div class="progress-info">
                        <span>Progreso</span>
                        <span>${progress.percentage}%</span>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${progress.percentage}%"></div>
                    </div>
                    <div class="progress-stats">
                        <span>${progress.learned} aprendidas de ${progress.total}</span>
                    </div>
                </div>
                <div class="set-footer">
                    <a href="Tarjeta2.html?set=${setId}" class="study-btn">
                        ${buttonText}
                    </a>
                </div>
            </div>
        </a>
    `;
}

// 🎯 EXPORTAR FUNCIONES PARA USO EN OTROS ARCHIVOS
window.gainPoints = gainPoints;
window.POINTS_SYSTEM = POINTS_SYSTEM;
window.diagnosticarNivel = diagnosticarNivel;