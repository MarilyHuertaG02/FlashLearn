// user.js - Lógica de Perfil y Gamificación
import { db } from './firebase.js'; 
import { doc, getDoc, updateDoc } from 'firebase/firestore'; 

export async function fetchUserData(userID) {
    if (!db) {
        console.error("Error: La conexión a Firebase (db) no está inicializada.");
        return null;
    }
    
    const userRef = doc(db, 'usuarios', userID);
    
    try {
        const userSnap = await getDoc(userRef);
        
        if (userSnap.exists()) {
            const data = userSnap.data();
            
            // Mapeo defensivo de datos: garantiza que los números son números
            return {
                nombre: data.nombre || 'Usuario',
                puntosTotales: data.puntosTotales || 0,
                rachaActualDias: data.rachaActualDias || 0,
                progresoMensual: data.progresoMensual || {},
                // ... (otros campos como nivelActual, fotoPerfilUrl)
            };
        } else {
            console.warn(`No se encontró el perfil para el ID: ${userID}.`);
            return null;
        }
    } catch (error) {
        console.error("Error al obtener el perfil de Firestore:", error);
        return null;
    }
}
export async function updateStudyStreak(userID) { // <-- ¡Asegúrate del 'export'!
    const today = new Date();
    today.setHours(0, 0, 0, 0); 

    const userRef = doc(db, 'usuarios', userID);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return 0;

    const userData = userSnap.data();
    const lastActivityTimestamp = userData.ultimaActividad;

    let lastActivityDate = null;
    if (lastActivityTimestamp && lastActivityTimestamp.toDate) {
        lastActivityDate = lastActivityTimestamp.toDate();
        lastActivityDate.setHours(0, 0, 0, 0);
    }
    
    // ... (Tu lógica de cálculo de diffDays) ...

    const diffTime = today.getTime() - (lastActivityDate ? lastActivityDate.getTime() : 0);
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

    let newStreak = userData.rachaActualDias || 0;
    let updateNeeded = false;

    if (diffDays === 1) {
        newStreak++;
        updateNeeded = true;
    } else if (diffDays > 1 || !lastActivityDate) {
        newStreak = 1;
        updateNeeded = true;
    } 

    if (updateNeeded || diffDays !== 0) {
        await updateDoc(userRef, {
            rachaActualDias: newStreak,
            ultimaActividad: new Date()
        }, { merge: true }); // Usamos merge: true por seguridad
        return newStreak;
    }
    return userData.rachaActualDias;
}

// 🚨 Asegúrate de que tu fetchUserData también esté exportada si la usas en otro lado
// export async function fetchUserData(userID) { ... }