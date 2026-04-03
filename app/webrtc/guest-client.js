import { WEBRTC_CONFIGURATION } from './constants.js';
import {
  camGuestVoiceAnswerRef,
  camGuestVoiceCandidatesRef,
  camGuestVoiceOfferRef,
  camGuestRef,
  camGuestsRef,
  camSignalAnswerRef,
  camSignalsRef,
  camCandidatesRef,
  clearGuestVoicePair,
  clearSignals,
  getGuests,
  listenValue,
  patchGuest,
  pushGuestVoiceCandidate,
  pushCandidate,
  registerOnDisconnectRemove,
  removeGuest,
  writeGuestVoiceAnswer,
  writeGuestVoiceOffer,
  writeGuest,
  writeSignalOffer,
} from './signaling.js';

function createId() {
  return `guest-${Math.random().toString(36).slice(2, 10)}`;
}

function createOwnerKey() {
  const storageKey = 'zogtournament-guest-owner-key';
  try {
    const existing = window.localStorage.getItem(storageKey);
    if (existing) {
      return existing;
    }
    const generated = `owner-${Math.random().toString(36).slice(2, 12)}`;
    window.localStorage.setItem(storageKey, generated);
    return generated;
  } catch {
    return `owner-volatile-${Math.random().toString(36).slice(2, 12)}`;
  }
}

export class GuestCamPublisher {
  constructor({ onState, onLog, onLocalStream, onVoicePeerStream, onPeersChanged }) {
    this.onState = onState;
    this.onLog = onLog;
    this.onLocalStream = onLocalStream;
    this.onVoicePeerStream = onVoicePeerStream;
    this.onPeersChanged = onPeersChanged;
    this.guestId = null;
    this.name = '';
    this.localStream = null;
    this.connections = new Map();
    this.voiceConnections = new Map();
    this.unsubscribers = [];
    this.selectedAudioInputId = '';
    this.includeAudioInOverlay = true;
    this.connectionLossHandled = false;
    this.ownerKey = createOwnerKey();
  }

  createPairKey(guestA, guestB) {
    return [guestA, guestB].sort().join('__');
  }

  async listAudioInputs() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((device) => device.kind === 'audioinput');
  }

  setAudioInput(deviceId) {
    this.selectedAudioInputId = deviceId || '';
  }

  setIncludeOverlayAudio(enabled) {
    this.includeAudioInOverlay = Boolean(enabled);
  }

  async enableCamera() {
    this.localStream?.getTracks().forEach((track) => track.stop());
    const audio = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1,
    };
    if (this.selectedAudioInputId) {
      audio.deviceId = { exact: this.selectedAudioInputId };
    }

    this.localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio,
    });
    this.onLocalStream?.(this.localStream);
    this.onState?.('camera-ready');
  }

  async join(name) {
    if (!this.localStream) {
      throw new Error('Active la caméra et le microphone avant de rejoindre.');
    }
    if (this.guestId) {
      throw new Error('Tu es déjà connecté.');
    }
    this.guestId = createId();
    this.name = String(name || 'Invité').trim() || 'Invité';
    this.connectionLossHandled = false;

    const guests = await getGuests();
    const normalizedName = this.name.toLowerCase();
    const duplicateGuest = Object.entries(guests).find(([, guest]) => {
      const status = String(guest?.status || '');
      const isOnline = status === 'connecting' || status === 'connected';
      if (!isOnline) {
        return false;
      }
      const ownerMatch = guest?.ownerKey && guest.ownerKey === this.ownerKey;
      const nameMatch = String(guest?.name || '').trim().toLowerCase() === normalizedName;
      return ownerMatch || nameMatch;
    });
    if (duplicateGuest) {
      this.guestId = null;
      throw new Error('Connexion refusée: cette personne est déjà connectée.');
    }

    await writeGuest(this.guestId, {
      name: this.name,
      status: 'connecting',
      cameraEnabled: true,
      microphoneEnabled: true,
      includeOverlayAudio: this.includeAudioInOverlay,
      ownerKey: this.ownerKey,
      joinedAt: Date.now(),
      updatedAt: Date.now(),
    });
    this.registerDisconnectCleanup();

    await this.startRoleConnection('admin');
    await this.startRoleConnection('overlay');
    this.startGuestVoiceRoom();

    await patchGuest(this.guestId, { status: 'connected', updatedAt: Date.now() });
    this.onState?.('connected');
  }

  async startRoleConnection(role) {
    const connection = new RTCPeerConnection(WEBRTC_CONFIGURATION);
    const videoTrack = this.localStream.getVideoTracks()[0];
    const audioTrack = this.localStream.getAudioTracks()[0];
    if (videoTrack) {
      connection.addTrack(videoTrack, this.localStream);
    }
    if (audioTrack && (role !== 'overlay' || this.includeAudioInOverlay)) {
      connection.addTrack(audioTrack, this.localStream);
    }

    connection.onconnectionstatechange = async () => {
      this.onLog?.(`[guest/${role}] ${connection.connectionState}`);
      if (['failed', 'disconnected', 'closed'].includes(connection.connectionState) && this.guestId) {
        await patchGuest(this.guestId, { status: 'disconnected', updatedAt: Date.now() });
        this.handleConnectionLoss(`[guest/${role}] Connexion perdue`);
      }
    };

    connection.onicecandidate = async (event) => {
      if (!event.candidate || !this.guestId) {
        return;
      }
      await pushCandidate(role, 'guest', this.guestId, event.candidate.toJSON());
    };

    const unsubscribeAnswer = listenValue(camSignalAnswerRef(role, this.guestId), async (snapshot) => {
      const answer = snapshot.val();
      if (!answer?.sdp || connection.currentRemoteDescription) {
        return;
      }
      await connection.setRemoteDescription(new RTCSessionDescription(answer));
    });

    const unsubscribeCandidates = listenValue(camCandidatesRef(role, role, this.guestId), async (snapshot) => {
      const candidates = snapshot.val() || {};
      for (const candidate of Object.values(candidates)) {
        try {
          await connection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (error) {
          this.onLog?.(`[guest/${role}] ICE invalide: ${error.message}`);
        }
      }
    });

    const offer = await connection.createOffer();
    await connection.setLocalDescription(offer);
    await writeSignalOffer(role, this.guestId, {
      type: offer.type,
      sdp: offer.sdp,
      updatedAt: Date.now(),
    });

    this.connections.set(role, { connection, unsubscribeAnswer, unsubscribeCandidates });
  }

  registerDisconnectCleanup() {
    if (!this.guestId) {
      return;
    }

    registerOnDisconnectRemove(camGuestRef(this.guestId));
    registerOnDisconnectRemove(camSignalsRef('admin', this.guestId));
    registerOnDisconnectRemove(camSignalsRef('overlay', this.guestId));
  }

  async handleConnectionLoss(message) {
    if (this.connectionLossHandled) {
      return;
    }
    this.connectionLossHandled = true;
    this.onState?.('disconnected');
    this.onLog?.(message);
    await this.leave();
  }

  startGuestVoiceRoom() {
    if (!this.guestId) {
      return;
    }

    const unsubscribeGuests = listenValue(camGuestsRef(), (snapshot) => {
      const guests = snapshot.val() || {};
      const peers = Object.entries(guests)
        .filter(([id]) => id !== this.guestId)
        .map(([id, guest]) => ({
          id,
          name: String(guest?.name || 'Invité'),
          status: String(guest?.status || 'connecting'),
        }))
        .sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }));
      const peerIds = peers.map((peer) => peer.id);
      this.onPeersChanged?.(peers);

      const activePeerIds = new Set(peerIds);
      for (const peerId of peerIds) {
        if (!this.voiceConnections.has(peerId)) {
          this.setupVoiceConnection(peerId).catch((error) => {
            this.onLog?.(`[voice/${peerId}] ${error.message}`);
          });
        }
      }

      for (const peerId of Array.from(this.voiceConnections.keys())) {
        if (!activePeerIds.has(peerId)) {
          this.closeVoiceConnection(peerId);
        }
      }
    });

    this.unsubscribers.push(unsubscribeGuests);
  }

  async setupVoiceConnection(peerId) {
    if (!this.guestId || !this.localStream || this.voiceConnections.has(peerId)) {
      return;
    }

    const pairKey = this.createPairKey(this.guestId, peerId);
    const isInitiator = this.guestId < peerId;
    const connection = new RTCPeerConnection(WEBRTC_CONFIGURATION);
    const remoteStream = new MediaStream();
    const localAudioTracks = this.localStream.getAudioTracks();

    localAudioTracks.forEach((track) => connection.addTrack(track, this.localStream));

    connection.ontrack = (event) => {
      remoteStream.addTrack(event.track);
      this.onVoicePeerStream?.(peerId, remoteStream);
    };

    connection.onicecandidate = async (event) => {
      if (!event.candidate || !this.guestId) {
        return;
      }
      await pushGuestVoiceCandidate(pairKey, this.guestId, event.candidate.toJSON());
    };

    connection.onconnectionstatechange = () => {
      this.onLog?.(`[voice/${peerId}] ${connection.connectionState}`);
      if (['failed', 'closed', 'disconnected'].includes(connection.connectionState)) {
        this.onVoicePeerStream?.(peerId, null);
      }
    };

    const unsubscribeCandidates = listenValue(camGuestVoiceCandidatesRef(pairKey, peerId), async (snapshot) => {
      const candidates = snapshot.val() || {};
      for (const candidate of Object.values(candidates)) {
        try {
          await connection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (error) {
          this.onLog?.(`[voice/${peerId}] ICE invalide: ${error.message}`);
        }
      }
    });

    const unsubscribeOffer = listenValue(camGuestVoiceOfferRef(pairKey), async (snapshot) => {
      const offer = snapshot.val();
      if (!offer?.sdp || offer.from === this.guestId || connection.currentRemoteDescription) {
        return;
      }
      await connection.setRemoteDescription(new RTCSessionDescription(offer));
      if (!connection.currentLocalDescription) {
        const answer = await connection.createAnswer();
        await connection.setLocalDescription(answer);
        await writeGuestVoiceAnswer(pairKey, {
          from: this.guestId,
          type: answer.type,
          sdp: answer.sdp,
          updatedAt: Date.now(),
        });
      }
    });

    const unsubscribeAnswer = listenValue(camGuestVoiceAnswerRef(pairKey), async (snapshot) => {
      const answer = snapshot.val();
      if (!answer?.sdp || answer.from === this.guestId || connection.currentRemoteDescription) {
        return;
      }
      await connection.setRemoteDescription(new RTCSessionDescription(answer));
    });

    this.voiceConnections.set(peerId, {
      pairKey,
      isInitiator,
      connection,
      unsubscribeCandidates,
      unsubscribeOffer,
      unsubscribeAnswer,
    });

    if (isInitiator) {
      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      await writeGuestVoiceOffer(pairKey, {
        from: this.guestId,
        type: offer.type,
        sdp: offer.sdp,
        updatedAt: Date.now(),
      });
    }
  }

  closeVoiceConnection(peerId) {
    const voice = this.voiceConnections.get(peerId);
    if (!voice) {
      return;
    }
    voice.unsubscribeCandidates?.();
    voice.unsubscribeOffer?.();
    voice.unsubscribeAnswer?.();
    voice.connection?.close();
    this.voiceConnections.delete(peerId);
    this.onVoicePeerStream?.(peerId, null);

    if (voice.isInitiator) {
      clearGuestVoicePair(voice.pairKey).catch(() => {});
    }
  }

  async leave() {
    this.unsubscribers.forEach((unsubscribe) => unsubscribe?.());
    this.unsubscribers = [];

    for (const { connection, unsubscribeAnswer, unsubscribeCandidates } of this.connections.values()) {
      unsubscribeAnswer?.();
      unsubscribeCandidates?.();
      connection.close();
    }
    this.connections.clear();
    for (const peerId of [...this.voiceConnections.keys()]) {
      this.closeVoiceConnection(peerId);
    }

    if (this.guestId) {
      await clearSignals('admin', this.guestId);
      await clearSignals('overlay', this.guestId);
      await removeGuest(this.guestId);
    }

    this.localStream?.getTracks().forEach((track) => track.stop());
    this.localStream = null;
    this.guestId = null;
    this.connectionLossHandled = false;
    this.onState?.('idle');
    this.onLocalStream?.(null);
    this.onPeersChanged?.([]);
  }
}
