// firebase.js
import { initializeApp } from 'firebase/app'; 
import { getFirestore } from 'firebase/firestore'; 
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
    apiKey: "AIzaSyBJ4FrmGVLo3ooqg9tBM47p101HxlmYyWI",
    authDomain: "flashlearn-eq7-1dfe5.firebaseapp.com",
    projectId: "flashlearn-eq7-1dfe5",
    storageBucket: "flashlearn-eq7-1dfe5.firebasestorage.app",
    messagingSenderId: "437235990707",
    appId: "1:437235990707:web:31f5f953480803bea970c6",
    measurementId: "G-3BPVLJFFKY"
};

console.log("Inicializando Firebase");
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app); // Inicializa Storage

console.log("Firebase inicializado correctamente");
export { db, auth, app, storage };