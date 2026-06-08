// ═══════════════════════════════════════════
//  BLOCK BATTLE — Firebase Configuration
// ═══════════════════════════════════════════

const firebaseConfig = {
  apiKey: "AIzaSyCHESLcfOfdUaDNTy2Lk11zBbk0ES9hPbc",
  authDomain: "blockbattle1-c0f6f.firebaseapp.com",
  projectId: "blockbattle1-c0f6f",
  storageBucket: "blockbattle1-c0f6f.firebasestorage.app",
  messagingSenderId: "13524151472",
  appId: "1:13524151472:web:0c8c872dbf924d7fccdf75",
  measurementId: "G-1TLQ5T15MC"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();
// Functions loaded via firebase-functions-compat in index.html

auth.languageCode = 'tr';

// Set persistence to local (stay logged in)
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
