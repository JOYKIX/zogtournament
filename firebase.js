import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js';
import {
  getDatabase,
  onValue,
  push,
  ref,
  remove,
  set,
  update,
} from 'https://www.gstatic.com/firebasejs/12.11.0/firebase-database.js';

const firebaseConfig = {
  apiKey: 'AIzaSyBXuvakq9O3ovjSBuvhQDbBjQo4KPDR8mQ',
  authDomain: 'zogtournoi.firebaseapp.com',
  databaseURL: 'https://zogtournoi-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'zogtournoi',
  storageBucket: 'zogtournoi.firebasestorage.app',
  messagingSenderId: '818688239019',
  appId: '1:818688239019:web:ba3c946d372e6536f2deee',
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const rootRef = ref(db, 'zogTournament');
const usersRef = ref(db, 'zogTournament/users');
const participantsRef = ref(db, 'zogTournament/participants');
const matchesRef = ref(db, 'zogTournament/matches');
const overlayRef = ref(db, 'zogTournament/overlay');
const profileRef = ref(db, 'zogTournament/profile');

export {
  db,
  matchesRef,
  onValue,
  overlayRef,
  profileRef,
  participantsRef,
  push,
  ref,
  remove,
  rootRef,
  set,
  update,
  usersRef,
};
