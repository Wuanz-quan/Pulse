import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyC8pYi2mOXWyBJYe0jq2fGojBYzcioiHzc",
  authDomain: "pulse-4a636.firebaseapp.com",
  projectId: "pulse-4a636",
  storageBucket: "pulse-4a636.firebasestorage.app",
  messagingSenderId: "402242035780",
  appId: "1:402242035780:web:b09f8843a36df94d33dc11",
  measurementId: "G-0T241XBP96",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

export { auth };
