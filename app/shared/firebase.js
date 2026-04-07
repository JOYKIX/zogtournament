import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js';
import {
  getDatabase,
  get,
  onDisconnect,
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

const PRODUCT_KEYS = {
  tournament: 'zogtournament',
  quiz: 'zogquiz',
};

const DEFAULT_PRODUCT_KEY = PRODUCT_KEYS.tournament;

function normalizeProductKey(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === PRODUCT_KEYS.quiz || raw === 'quiz') {
    return PRODUCT_KEYS.quiz;
  }
  return DEFAULT_PRODUCT_KEY;
}

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const rootRef = ref(db, 'zog');
const legacyRootRef = ref(db, 'zogTournament');
const connectedRef = ref(db, '.info/connected');

function getAuthRefs() {
  const authRootRef = ref(db, 'zog/auth');
  return {
    authRootRef,
    usersRef: ref(db, 'zog/auth/users'),
    profileRef: ref(db, 'zog/auth/profile'),
  };
}

function getProductRefs(productKey = DEFAULT_PRODUCT_KEY) {
  const normalizedProductKey = normalizeProductKey(productKey);
  const productRootRef = ref(db, `zog/apps/${normalizedProductKey}`);

  return {
    productKey: normalizedProductKey,
    productRootRef,
    participantsRef: ref(db, `zog/apps/${normalizedProductKey}/participants`),
    participantImagesRef: ref(db, `zog/apps/${normalizedProductKey}/participantImages`),
    matchesRef: ref(db, `zog/apps/${normalizedProductKey}/matches`),
    overlayRef: ref(db, `zog/apps/${normalizedProductKey}/overlay`),
  };
}

function getProductRefsBySlug(slug) {
  if (String(slug || '').trim().toLowerCase() === 'quiz') {
    return getProductRefs(PRODUCT_KEYS.quiz);
  }

  return getProductRefs(PRODUCT_KEYS.tournament);
}

export {
  PRODUCT_KEYS,
  DEFAULT_PRODUCT_KEY,
  db,
  connectedRef,
  legacyRootRef,
  get,
  getAuthRefs,
  getProductRefs,
  getProductRefsBySlug,
  normalizeProductKey,
  onDisconnect,
  onValue,
  push,
  ref,
  remove,
  rootRef,
  set,
  update,
};
