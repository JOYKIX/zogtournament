import { WEBRTC_CONFIGURATION } from './constants.js';
import {
  camGuestVoiceAnswerRef,
  camGuestVoiceCandidatesRef,
  camGuestVoiceOfferRef,
  camGuestsRef,
  camSignalAnswerRef,
  camCandidatesRef,
  clearGuestVoicePair,
  clearSignals,
  listenValue,
  patchGuest,
  pushGuestVoiceCandidate,
  pushCandidate,
  removeGuest,
  writeGuestVoiceAnswer,
  writeGuestVoiceOffer,
  writeGuest,
  writeSignalOffer,
} from './signaling.js';

function createId() {
  return `guest-${Math.random().toString(36).slice(2, 10)}`;
}

export class GuestCamPublisher {
  constructor({ onState, onLog, onLocalStream, onVoicePeerStream }) {
    this.onState = onState;
    this.onLog = onLog;
    this.onLocalStream = onLocalStream;
    this.onVoicePeerStream = onVoicePeerStream;
    this.guestId = null;
    this.name = '';
    this.localStream = null;
    this.connections = new Map();
    this.voiceConnections = new Map();
    this.unsubscribers = [];
    this.selectedAudioInputId = '';
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
    this.guestId = createId();
    this.name = String(name || 'Invité').trim() || 'Invité';

    await writeGuest(this.guestId, {
      name: this.name,
      status: 'connecting',
      cameraEnabled: true,
      microphoneEnabled: true,
      joinedAt: Date.now(),
      updatedAt: Date.now(),
    });

    await this.startRoleConnection('admin');
    await this.startRoleConnection('overlay');
    this.startGuestVoiceRoom();

    await patchGuest(this.guestId, { status: 'connected', updatedAt: Date.now() });
    this.onState?.('connected');
  }

  async startRoleConnection(role) {
    const connection = new RTCPeerConnection(WEBRTC_CONFIGURATION);
    this.localStream.getTracks().forEach((track) => connection.addTrack(track, this.localStream));

    connection.onconnectionstatechange = async () => {
      this.onLog?.(`[guest/${role}] ${connection.connectionState}`);
      if (['failed', 'disconnected', 'closed'].includes(connection.connectionState) && this.guestId) {
        await patchGuest(this.guestId, { status: 'disconnected', updatedAt: Date.now() });
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

  startGuestVoiceRoom() {
    if (!this.guestId) {
      return;
    }

    const unsubscribeGuests = listenValue(camGuestsRef(), (snapshot) => {
      const guests = snapshot.val() || {};
      const peerIds = Object.keys(guests)
        .filter((id) => id !== this.guestId)
        .sort();

      const activePeerIds = new Set(peerIds);
      for (const peerId of peerIds) {
        if (!this.voiceConnections.has(peerId)) {
          this.setupVoiceConnection(peerId).catch((error) => {
            this.onLog?.(`[voice/${peerId}] ${error.message}`);
          });
        }
      }

      for (const peerId of this.voiceConnections.keys()) {
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
    this.onState?.('idle');
    this.onLocalStream?.(null);
  }
}
