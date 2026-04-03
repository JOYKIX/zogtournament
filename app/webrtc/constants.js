export const MAX_GUEST_CAMERAS = 3;
export const WEBRTC_CONFIGURATION = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export const CAM_SLOT_IDS = ['slot1', 'slot2', 'slot3'];
export const CONNECTION_STATES = {
  idle: 'En attente',
  connecting: 'Connexion',
  connected: 'Connecté',
  disconnected: 'Déconnecté',
  cameraOff: 'Caméra coupée',
  error: 'Erreur',
};
