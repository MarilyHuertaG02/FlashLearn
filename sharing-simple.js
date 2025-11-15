// sharing-simple.js
import { db, auth } from './firebase.js';
import { doc, updateDoc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';

// 🎯 COMPARTIR SET (super simple)
export async function compartirSet(setId) {
  const user = auth.currentUser;
  if (!user) return;

  try {
    const setRef = doc(db, 'usuarios', user.uid, 'sets', setId);
    
    await updateDoc(setRef, {
      esPublico: true,
      fechaCompartido: new Date(),
      vecesCopiado: 0
    });

    // URL simple para compartir
    const shareUrl = `${window.location.origin}/shared-set.html?user=${user.uid}&set=${setId}`;
    
    return shareUrl;
    
  } catch (error) {
    console.error("Error compartiendo:", error);
    throw error;
  }
}

// 🎯 COPIAR SET (sencillo)
export async function copiarSetCompartido(userIdOriginal, setIdOriginal) {
  const user = auth.currentUser;
  if (!user) return;

  try {
    // 1. Obtener set original
    const originalSetRef = doc(db, 'usuarios', userIdOriginal, 'sets', setIdOriginal);
    const originalSetSnap = await getDoc(originalSetRef);
    
    if (!originalSetSnap.exists() || !originalSetSnap.data().esPublico) {
      throw new Error("Set no disponible");
    }

    const originalSet = originalSetSnap.data();
    
    // 2. Obtener flashcards
    const flashcardsRef = collection(originalSetRef, 'flashcards');
    const flashcardsSnap = await getDocs(flashcardsRef);
    
    // 3. Crear nueva copia
    const newSetId = 'set_copia_' + Date.now();
    const newSetRef = doc(db, 'usuarios', user.uid, 'sets', newSetId);
    
    await setDoc(newSetRef, {
      titulo: `${originalSet.titulo} (Copia)`,
      asignatura: originalSet.asignatura,
      fechaDeCreacion: new Date(),
      esPublico: false, // La copia es privada
      esCopia: true
    });

    // 4. Copiar flashcards
    const newFlashcardsRef = collection(newSetRef, 'flashcards');
    flashcardsSnap.docs.forEach((cardDoc, index) => {
      const cardData = cardDoc.data();
      const cardRef = doc(newFlashcardsRef, cardDoc.id);
      
      setDoc(cardRef, {
        pregunta: cardData.pregunta,
        respuesta: cardData.respuesta,
        orden: index,
        learned: false,
        dominio: 0
      });
    });

    // 5. Actualizar contador (opcional)
    await updateDoc(originalSetRef, {
      vecesCopiado: (originalSet.vecesCopiado || 0) + 1
    });

    return newSetId;

  } catch (error) {
    console.error("Error copiando:", error);
    throw error;
  }
}

// 🎯 DEJAR DE COMPARTIR
export async function dejarDeCompartir(setId) {
  const user = auth.currentUser;
  if (!user) return;

  const setRef = doc(db, 'usuarios', user.uid, 'sets', setId);
  await updateDoc(setRef, {
    esPublico: false,
    fechaCompartido: null
  });
}