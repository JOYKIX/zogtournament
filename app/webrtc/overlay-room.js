import { db, ref } from '../shared/firebase.js';
import { CAM_SLOT_IDS, WEBRTC_CONFIGURATION } from './constants.js';
import {
  camCandidatesRef,
  camGuestsRef,
  listenValue,
  pushCandidate,
  writeSignalAnswer,
} from './signaling.js';

export class GuestCamOverlayReceiver {
  constructor({ onSlotUpdate, onLog }) {
    this.onSlotUpdate = onSlotUpdate;
    this.onLog = onLog;
    this.slots = {};
    this.guests = {};
    this.connections = new Map();
    this.unsubscribers = [];
    this.offerFingerprints = new Map();
  }

  start() {
    this.unsubscribers.push(
      listenValue(ref(db, 'zogTournament/cam/slots'), (snapshot) => {
        this.slots = snapshot.val() || {};
        this.syncSlots();
      })
    );
    this.unsubscribers.push(
      listenValue(camGuestsRef(), (snapshot) => {
        this.guests = snapshot.val() || {};
        this.syncSlots();
      })
    );

    this.unsubscribers.push(
      listenValue(ref(db, 'zogTournament/cam/signals/overlay'), (snapshot) => {
        const signals = snapshot.val() || {};
        Object.entries(signals).forEach(([guestId, payload]) => {
          if (!payload?.offer?.sdp) {
            return;
          }
          this.consumeOffer(guestId, payload.offer).catch((error) => {
            this.onLog?.(`Erreur overlay/${guestId}: ${error.message}`);
          });
        });
      })
    );
  }

  syncSlots() {
    CAM_SLOT_IDS.forEach((slotId) => {
      const slot = this.slots[slotId] || {};
      const guest = slot.guestId ? this.guests?.[slot.guestId] : null;
      const guestIsConnected = guest && (guest.status === 'connected' || guest.status === 'connecting');
      const shouldShow = Boolean(slot.visible && slot.guestId && guestIsConnected);
      if (!shouldShow) {
        this.onSlotUpdate?.(slotId, null, false, { guestId: null, includeOverlayAudio: false });
        return;
      }
      const connection = this.connections.get(slot.guestId);
      this.onSlotUpdate?.(slotId, connection?.remoteStream || null, true, {
        guestId: slot.guestId,
        includeOverlayAudio: Boolean(guest?.includeOverlayAudio),
      });
    });
  }

  async consumeOffer(guestId, offer) {
    const fingerprint = JSON.stringify(offer);
    if (this.offerFingerprints.get(guestId) === fingerprint) {
      return;
    }
    this.offerFingerprints.set(guestId, fingerprint);

    this.closeConnection(guestId);

    const connection = new RTCPeerConnection(WEBRTC_CONFIGURATION);
    const remoteStream = new MediaStream();

    connection.ontrack = (event) => {
      remoteStream.addTrack(event.track);
      this.connections.set(guestId, { ...this.connections.get(guestId), remoteStream, connection });
      this.syncSlots();
    };

    connection.onicecandidate = async (event) => {
      if (!event.candidate) {
        return;
      }
      await pushCandidate('overlay', 'overlay', guestId, event.candidate.toJSON());
    };

    const unsubscribeCandidates = listenValue(camCandidatesRef('overlay', 'guest', guestId), async (snapshot) => {
      const candidates = snapshot.val() || {};
      for (const candidate of Object.values(candidates)) {
        try {
          await connection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (error) {
          this.onLog?.(`[overlay/${guestId}] ICE invalide: ${error.message}`);
        }
      }
    });

    this.connections.set(guestId, { connection, remoteStream, unsubscribeCandidates });

    await connection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await connection.createAnswer();
    await connection.setLocalDescription(answer);
    await writeSignalAnswer('overlay', guestId, {
      type: answer.type,
      sdp: answer.sdp,
      updatedAt: Date.now(),
    });
  }

  closeConnection(guestId) {
    const item = this.connections.get(guestId);
    if (!item) {
      return;
    }
    item.unsubscribeCandidates?.();
    item.connection?.close();
    this.connections.delete(guestId);
    this.syncSlots();
  }

  stop() {
    this.unsubscribers.forEach((unsubscribe) => unsubscribe?.());
    this.unsubscribers = [];
    for (const guestId of this.connections.keys()) {
      this.closeConnection(guestId);
    }
  }
}
