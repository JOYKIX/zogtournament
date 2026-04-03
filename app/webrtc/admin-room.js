import { db, ref } from '../shared/firebase.js';
import { CAM_SLOT_IDS, MAX_GUEST_CAMERAS, WEBRTC_CONFIGURATION } from './constants.js';
import {
  camGuestsRef,
  camCandidatesRef,
  clearSignals,
  listenValue,
  patchSlots,
  pushCandidate,
  writeSignalAnswer,
} from './signaling.js';

function sanitizeGuests(value) {
  if (!value || typeof value !== 'object') {
    return [];
  }

  return Object.entries(value).map(([id, guest]) => ({
    id,
    name: String(guest?.name || 'Invité'),
    status: String(guest?.status || 'idle'),
    cameraEnabled: Boolean(guest?.cameraEnabled),
    joinedAt: Number(guest?.joinedAt || 0),
    updatedAt: Number(guest?.updatedAt || 0),
  }));
}

export class GuestCamAdminManager {
  constructor({ onGuestsChanged, onRemoteTrack, onLog }) {
    this.onGuestsChanged = onGuestsChanged;
    this.onRemoteTrack = onRemoteTrack;
    this.onLog = onLog;
    this.connections = new Map();
    this.unsubscribers = [];
    this.offerFingerprints = new Map();
  }

  start() {
    this.unsubscribers.push(
      listenValue(camGuestsRef(), (snapshot) => {
        const guests = sanitizeGuests(snapshot.val()).sort((a, b) => a.joinedAt - b.joinedAt).slice(0, MAX_GUEST_CAMERAS);
        this.onGuestsChanged?.(guests);
        const guestIds = new Set(guests.map((guest) => guest.id));
        for (const [guestId] of this.connections) {
          if (!guestIds.has(guestId)) {
            this.closeGuestConnection(guestId);
          }
        }
      })
    );

    this.unsubscribers.push(
      listenValue(ref(db, 'zogTournament/cam/signals/admin'), (snapshot) => {
        const signals = snapshot.val() || {};
        Object.entries(signals).forEach(([guestId, payload]) => {
          if (!payload?.offer?.sdp) {
            return;
          }
          this.consumeOffer(guestId, payload.offer).catch((error) => {
            this.onLog?.(`Erreur WebRTC (${guestId}): ${error.message}`);
          });
        });
      })
    );
  }

  async consumeOffer(guestId, offer) {
    const fingerprint = JSON.stringify(offer);
    if (this.offerFingerprints.get(guestId) === fingerprint) {
      return;
    }
    this.offerFingerprints.set(guestId, fingerprint);

    this.closeGuestConnection(guestId);

    const connection = new RTCPeerConnection(WEBRTC_CONFIGURATION);
    const remoteStream = new MediaStream();

    connection.onconnectionstatechange = () => {
      this.onLog?.(`[admin/${guestId}] ${connection.connectionState}`);
      if (['failed', 'closed', 'disconnected'].includes(connection.connectionState)) {
        this.onRemoteTrack?.(guestId, null);
      }
    };

    connection.ontrack = (event) => {
      remoteStream.addTrack(event.track);
      this.onRemoteTrack?.(guestId, remoteStream);
    };

    connection.onicecandidate = async (event) => {
      if (!event.candidate) {
        return;
      }
      await pushCandidate('admin', 'admin', guestId, event.candidate.toJSON());
    };

    const unsubscribeCandidates = listenValue(camCandidatesRef('admin', 'guest', guestId), async (snapshot) => {
      const candidates = snapshot.val() || {};
      for (const candidate of Object.values(candidates)) {
        try {
          await connection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (error) {
          this.onLog?.(`[admin/${guestId}] ICE invalide: ${error.message}`);
        }
      }
    });

    this.connections.set(guestId, { connection, unsubscribeCandidates });

    await connection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await connection.createAnswer();
    await connection.setLocalDescription(answer);
    await writeSignalAnswer('admin', guestId, {
      type: answer.type,
      sdp: answer.sdp,
      updatedAt: Date.now(),
    });
  }

  async assignSlot(slotId, guestId) {
    if (!CAM_SLOT_IDS.includes(slotId)) {
      return;
    }
    await patchSlots({
      [slotId]: {
        guestId: guestId || null,
        visible: Boolean(guestId),
        updatedAt: Date.now(),
      },
    });
  }

  async setSlotVisibility(slotId, visible) {
    if (!CAM_SLOT_IDS.includes(slotId)) {
      return;
    }
    await patchSlots({
      [`${slotId}/visible`]: Boolean(visible),
      [`${slotId}/updatedAt`]: Date.now(),
    });
  }

  closeGuestConnection(guestId) {
    const item = this.connections.get(guestId);
    if (!item) {
      return;
    }
    item.unsubscribeCandidates?.();
    item.connection?.close();
    this.connections.delete(guestId);
    this.onRemoteTrack?.(guestId, null);
  }

  async removeGuestSlotBindings(guestId) {
    await clearSignals('admin', guestId);
    await clearSignals('overlay', guestId);
  }

  stop() {
    this.unsubscribers.forEach((unsubscribe) => unsubscribe?.());
    this.unsubscribers = [];
    for (const guestId of this.connections.keys()) {
      this.closeGuestConnection(guestId);
    }
  }
}
