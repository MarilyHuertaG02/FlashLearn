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
            
            return {
                nombre: data.nombre || 'Usuario',
                // Mapeo defensivo: asegura que los puntos y racha sean Number.
                puntosTotales: Number(data.puntosTotales) || 0,
                rachaActualDias: Number(data.rachaActualDias) || 0,
                progresoMensual: data.progresoMensual || {},
                fotoPerfilUrl: data.fotoPerfilUrl || 'img/user.png',
                ultimaActividad: data.ultimaActividad || null
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

export async function updateStudyStreak(userID) { 
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
    
    const diffTime = today.getTime() - (lastActivityDate ? lastActivityDate.getTime() : 0);
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

    let newStreak = Number(userData.rachaActualDias) || 0; // Aseguramos que sea Number
    let updateNeeded = false;

    if (diffDays === 1) {
        // Caso 1: Estudió ayer, aumentamos la racha
        newStreak++;
        updateNeeded = true;
    } else if (diffDays > 1 || !lastActivityDate) {
        // Caso 2: Rompió la racha o es el primer día registrado
        newStreak = 1;
        updateNeeded = true;
    } else if (diffDays === 0 && newStreak === 0) {
        // 🚨 CORRECCIÓN CLAVE: Es la PRIMERA actividad, pero registrada hoy.
        // Forzamos la racha a 1.
        newStreak = 1;
        updateNeeded = true;
    } else if (diffDays === 0 && newStreak > 0) {
        // Ya estudió hoy y la racha está activa. No hacer nada.
        return newStreak; 
    }
    
    // Si la racha es nueva o se rompió/actualizó, guardamos el nuevo valor y el timestamp.
    if (updateNeeded) {
        await updateDoc(userRef, {
            rachaActualDias: newStreak,
            ultimaActividad: new Date()
        }, { merge: true });
        return newStreak;
    }
    return userData.rachaActualDias;
}