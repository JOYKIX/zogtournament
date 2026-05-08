import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js';
import {
  getDatabase,
  child,
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

function normalizeProfileId(value) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function getProductRefs(productKey = DEFAULT_PRODUCT_KEY, profileId = null) {
  const normalizedProductKey = normalizeProductKey(productKey);
  const normalizedProfileId = normalizeProfileId(profileId);
  const basePath = normalizedProfileId ? `zog/profiles/${normalizedProfileId}/apps` : 'zog/apps';
  const productRootRef = ref(db, `${basePath}/${normalizedProductKey}`);

  return {
    productKey: normalizedProductKey,
    profileId: normalizedProfileId,
    productRootRef,
    participantsRef: ref(db, `${basePath}/${normalizedProductKey}/participants`),
    participantImagesRef: ref(db, `${basePath}/${normalizedProductKey}/participantImages`),
    matchesRef: ref(db, `${basePath}/${normalizedProductKey}/matches`),
    overlayRef: ref(db, `${basePath}/${normalizedProductKey}/overlay`),
  };
}

function getProductRefsBySlug(slug, profileId = null) {
  if (String(slug || '').trim().toLowerCase() === 'quiz') {
    return getProductRefs(PRODUCT_KEYS.quiz, profileId);
  }

  return getProductRefs(PRODUCT_KEYS.tournament, profileId);
}

export {
  PRODUCT_KEYS,
  DEFAULT_PRODUCT_KEY,
  db,
  connectedRef,
  legacyRootRef,
  child,
  get,
  getAuthRefs,
  getProductRefs,
  getProductRefsBySlug,
  normalizeProductKey,
  normalizeProfileId,
  onDisconnect,
  onValue,
  push,
  ref,
  remove,
  rootRef,
  set,
  update,
};
