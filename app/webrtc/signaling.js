import { db, get, onDisconnect, onValue, push, ref, remove, set, update } from '../shared/firebase.js';

const CAM_ROOT = 'zogTournament/cam';

export function camRootRef() {
  return ref(db, CAM_ROOT);
}

export function camGuestsRef() {
  return ref(db, `${CAM_ROOT}/guests`);
}

export function camGuestRef(guestId) {
  return ref(db, `${CAM_ROOT}/guests/${guestId}`);
}

export function camSlotsRef() {
  return ref(db, `${CAM_ROOT}/slots`);
}

export function camGuestVoicePairRef(pairKey) {
  return ref(db, `${CAM_ROOT}/guestVoice/${pairKey}`);
}

export function camGuestVoiceOfferRef(pairKey) {
  return ref(db, `${CAM_ROOT}/guestVoice/${pairKey}/offer`);
}

export function camGuestVoiceAnswerRef(pairKey) {
  return ref(db, `${CAM_ROOT}/guestVoice/${pairKey}/answer`);
}

export function camGuestVoiceCandidatesRef(pairKey, guestId) {
  return ref(db, `${CAM_ROOT}/guestVoice/${pairKey}/candidates/${guestId}`);
}

export function camSignalsRef(role, guestId) {
  return ref(db, `${CAM_ROOT}/signals/${role}/${guestId}`);
}

export function camSignalOfferRef(role, guestId) {
  return ref(db, `${CAM_ROOT}/signals/${role}/${guestId}/offer`);
}

export function camSignalAnswerRef(role, guestId) {
  return ref(db, `${CAM_ROOT}/signals/${role}/${guestId}/answer`);
}

export function camCandidatesRef(role, sourceRole, guestId) {
  return ref(db, `${CAM_ROOT}/signals/${role}/${guestId}/candidates/${sourceRole}`);
}

export function listenValue(targetRef, callback) {
  return onValue(targetRef, callback);
}

export async function writeGuest(guestId, payload) {
  await set(camGuestRef(guestId), payload);
}

export async function patchGuest(guestId, payload) {
  await update(camGuestRef(guestId), payload);
}

export async function getGuests() {
  const snapshot = await get(camGuestsRef());
  return snapshot.val() || {};
}

export async function removeGuest(guestId) {
  await remove(camGuestRef(guestId));
}

export async function writeSignalOffer(role, guestId, payload) {
  await set(camSignalOfferRef(role, guestId), payload);
}

export async function writeSignalAnswer(role, guestId, payload) {
  await set(camSignalAnswerRef(role, guestId), payload);
}

export async function pushCandidate(role, sourceRole, guestId, payload) {
  await push(camCandidatesRef(role, sourceRole, guestId), payload);
}

export async function clearSignals(role, guestId) {
  await remove(camSignalsRef(role, guestId));
}

export async function writeGuestVoiceOffer(pairKey, payload) {
  await set(camGuestVoiceOfferRef(pairKey), payload);
}

export async function writeGuestVoiceAnswer(pairKey, payload) {
  await set(camGuestVoiceAnswerRef(pairKey), payload);
}

export async function pushGuestVoiceCandidate(pairKey, guestId, payload) {
  await push(camGuestVoiceCandidatesRef(pairKey, guestId), payload);
}

export async function clearGuestVoicePair(pairKey) {
  await remove(camGuestVoicePairRef(pairKey));
}

export function registerOnDisconnectRemove(targetRef) {
  return onDisconnect(targetRef).remove();
}

export async function writeSlots(payload) {
  await set(camSlotsRef(), payload);
}

export async function patchSlots(payload) {
  await update(camSlotsRef(), payload);
}
