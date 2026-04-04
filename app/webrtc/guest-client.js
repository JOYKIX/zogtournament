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
  constructor({ onState, onLog, onLocalStream, onVoicePeerStream, onPeersChanged, onMuteChanged }) {
    this.onState = onState;
    this.onLog = onLog;
    this.onLocalStream = onLocalStream;
    this.onVoicePeerStream = onVoicePeerStream;
    this.onPeersChanged = onPeersChanged;
    this.onMuteChanged = onMuteChanged;
    this.guestId = null;
    this.name = '';
    this.localStream = null;
    this.connections = new Map();
    this.voiceConnections = new Map();
    this.unsubscribers = [];
    this.selectedAudioInputId = '';
    this.connectionLossHandled = false;
    this.ownerKey = createOwnerKey();
    this.streamConnected = false;
    this.voiceGroupConnected = false;
    this.voiceRoomStarted = false;
    this.muted = false;
    this.audioProcessingContext = null;
    this.audioProcessingNodes = null;
    this.captureStream = null;
    this.microphoneDeadzone = 0.06;
    this.microphoneGateOpen = true;
    this.reconnectTimers = new Map();
    this.reconnectAttempts = new Map();
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

  setMicrophoneDeadzone(value) {
    const deadzone = Number.isFinite(value) ? Math.max(0, Math.min(0.3, value)) : 0;
    this.microphoneDeadzone = deadzone;
  }

  stopCaptureStream() {
    if (!this.captureStream) {
      return;
    }
    this.captureStream.getTracks().forEach((track) => track.stop());
    this.captureStream = null;
  }

  hasAudioTrack() {
    return Boolean(this.localStream?.getAudioTracks()?.[0]);
  }

  isMuted() {
    return this.muted;
  }

  async toggleMuted() {
    await this.setMuted(!this.muted);
    return this.muted;
  }

  async setMuted(isMuted) {
    this.muted = Boolean(isMuted);
    const audioTrack = this.localStream?.getAudioTracks()?.[0];
    if (audioTrack) {
      audioTrack.enabled = !this.muted;
    }
    this.onMuteChanged?.(this.muted);
    await this.updateGuestConnectionFlags();
  }

  buildAudioConstraints() {
    const supported = navigator.mediaDevices.getSupportedConstraints?.() || {};
    const audio = {};
    const requestedFeatures = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: { ideal: 1 },
      sampleRate: { ideal: 48000 },
      sampleSize: { ideal: 16 },
      latency: { ideal: 0.02 },
    };

    Object.entries(requestedFeatures).forEach(([key, value]) => {
      if (supported[key] || ['echoCancellation', 'noiseSuppression', 'autoGainControl'].includes(key)) {
        audio[key] = value;
      } else {
        this.onLog?.(`[audio] Contrainte non supportée: ${key}`);
      }
    });

    if (this.selectedAudioInputId) {
      if (supported.deviceId) {
        audio.deviceId = { exact: this.selectedAudioInputId };
      } else {
        this.onLog?.('[audio] Sélection deviceId non supportée, micro par défaut utilisé.');
      }
    }

    this.onLog?.(`[audio] Contraintes supportées navigateur: ${JSON.stringify(supported)}`);
    this.onLog?.(`[audio] Contraintes demandées: ${JSON.stringify(audio)}`);
    return audio;
  }

  stopAudioProcessing() {
    if (!this.audioProcessingNodes) {
      return;
    }
    if (this.audioProcessingNodes.gateInterval) {
      clearInterval(this.audioProcessingNodes.gateInterval);
    }
    this.audioProcessingNodes.source?.disconnect();
    this.audioProcessingNodes.highPass?.disconnect();
    this.audioProcessingNodes.compressor?.disconnect();
    this.audioProcessingNodes.analyser?.disconnect();
    this.audioProcessingNodes.gateGain?.disconnect();
    this.audioProcessingNodes.outputGain?.disconnect();
    this.audioProcessingNodes.destination?.disconnect();
    this.audioProcessingNodes = null;

    if (this.audioProcessingContext?.state !== 'closed') {
      this.audioProcessingContext?.close().catch(() => {});
    }
    this.audioProcessingContext = null;
  }

  buildProcessedAudioTrack(rawAudioTrack) {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) {
      this.onLog?.('[audio] Web Audio indisponible: aucune post-prod appliquée.');
      return rawAudioTrack;
    }

    try {
      this.stopAudioProcessing();
      const sourceStream = new MediaStream([rawAudioTrack]);
      const context = new AudioContextCtor({ latencyHint: 'interactive' });
      const source = context.createMediaStreamSource(sourceStream);
      const highPass = context.createBiquadFilter();
      highPass.type = 'highpass';
      highPass.frequency.value = 80;
      highPass.Q.value = 0.707;

      const compressor = context.createDynamicsCompressor();
      compressor.threshold.value = -20;
      compressor.knee.value = 20;
      compressor.ratio.value = 2.5;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.2;

      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.7;
      const analyserBuffer = new Uint8Array(analyser.fftSize);

      const gateGain = context.createGain();
      gateGain.gain.value = 1;

      const outputGain = context.createGain();
      outputGain.gain.value = 1;

      const destination = context.createMediaStreamDestination();
      source.connect(highPass);
      highPass.connect(compressor);
      compressor.connect(analyser);
      compressor.connect(gateGain);
      gateGain.connect(outputGain);
      outputGain.connect(destination);

      const applyGateState = (isOpen) => {
        this.microphoneGateOpen = isOpen;
        gateGain.gain.setTargetAtTime(isOpen ? 1 : 0, context.currentTime, 0.012);
      };
      applyGateState(true);

      const deadzoneChecker = window.setInterval(() => {
        analyser.getByteTimeDomainData(analyserBuffer);
        let squaredSum = 0;
        for (let i = 0; i < analyserBuffer.length; i += 1) {
          const centered = (analyserBuffer[i] - 128) / 128;
          squaredSum += centered * centered;
        }
        const rms = Math.sqrt(squaredSum / analyserBuffer.length);
        const baseThreshold = this.microphoneDeadzone;
        const openThreshold = Math.max(0, baseThreshold * 0.8);
        const closeThreshold = Math.min(0.35, baseThreshold * 1.2);

        if (this.microphoneGateOpen) {
          if (rms < openThreshold) {
            applyGateState(false);
          }
        } else if (rms > closeThreshold) {
          applyGateState(true);
        }
      }, 65);

      const processedTrack = destination.stream.getAudioTracks()[0];
      if (!processedTrack) {
        clearInterval(deadzoneChecker);
        context.close().catch(() => {});
        this.onLog?.('[audio] Pipeline Web Audio indisponible: piste brute conservée.');
        return rawAudioTrack;
      }

      this.audioProcessingContext = context;
      this.audioProcessingNodes = {
        source,
        highPass,
        compressor,
        analyser,
        gateGain,
        outputGain,
        destination,
        gateInterval: deadzoneChecker,
      };
      this.onLog?.('[audio] Pipeline Web Audio active (high-pass + compresseur + gate zone morte).');
      return processedTrack;
    } catch (error) {
      this.onLog?.(`[audio] Pipeline Web Audio en échec (${error.message}), piste brute conservée.`);
      this.stopAudioProcessing();
      return rawAudioTrack;
    }
  }

  async enableCamera() {
    this.localStream?.getTracks().forEach((track) => track.stop());
    this.stopCaptureStream();
    this.stopAudioProcessing();
    const audio = this.buildAudioConstraints();

    let captureStream;
    try {
      captureStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio,
      });
    } catch (error) {
      const canFallbackToDefaultMic =
        this.selectedAudioInputId &&
        (error?.name === 'OverconstrainedError' || error?.name === 'NotFoundError');
      if (!canFallbackToDefaultMic) {
        throw error;
      }
      this.onLog?.(
        `[audio] Micro sélectionné indisponible (${error.name}), bascule automatique vers le micro par défaut.`,
      );
      this.selectedAudioInputId = '';
      captureStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: this.buildAudioConstraints(),
      });
    }
    this.captureStream = captureStream;
    const videoTrack = captureStream.getVideoTracks()[0];
    const rawAudioTrack = captureStream.getAudioTracks()[0];
    const outputAudioTrack = rawAudioTrack ? this.buildProcessedAudioTrack(rawAudioTrack) : null;

    if (rawAudioTrack) {
      this.onLog?.(`[audio] Settings micro appliqués: ${JSON.stringify(rawAudioTrack.getSettings?.() || {})}`);
    }
    if (outputAudioTrack && outputAudioTrack !== rawAudioTrack) {
      this.onLog?.(`[audio] Settings piste traitée: ${JSON.stringify(outputAudioTrack.getSettings?.() || {})}`);
    }

    this.localStream = new MediaStream([videoTrack, ...(outputAudioTrack ? [outputAudioTrack] : [])]);
    this.localStream.getAudioTracks().forEach((track) => {
      track.enabled = !this.muted;
    });
    this.onLocalStream?.(this.localStream);
    this.onMuteChanged?.(this.muted);
    this.onState?.('camera-ready');
  }

  emitConnectionState() {
    if (this.streamConnected && this.voiceGroupConnected) {
      this.onState?.('connected');
      return;
    }
    if (this.streamConnected) {
      this.onState?.('stream-connected');
      return;
    }
    if (this.voiceGroupConnected) {
      this.onState?.('voice-connected');
      return;
    }
    this.onState?.('camera-ready');
  }

  async ensureGuestSession(name) {
    if (this.guestId) {
      return;
    }

    if (!this.localStream) {
      throw new Error('Active la caméra et le microphone avant de rejoindre.');
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
      microphoneEnabled: !this.muted,
      includeOverlayAudio: true,
      streamConnected: false,
      voiceGroupConnected: false,
      ownerKey: this.ownerKey,
      joinedAt: Date.now(),
      updatedAt: Date.now(),
    });
    this.registerDisconnectCleanup();
  }

  async updateGuestConnectionFlags() {
    if (!this.guestId) {
      return;
    }

    await patchGuest(this.guestId, {
      status: this.streamConnected || this.voiceGroupConnected ? 'connected' : 'connecting',
      streamConnected: this.streamConnected,
      voiceGroupConnected: this.voiceGroupConnected,
      cameraEnabled: Boolean(this.localStream?.getVideoTracks()?.length),
      microphoneEnabled: Boolean(this.localStream?.getAudioTracks()?.length) && !this.muted,
      updatedAt: Date.now(),
    });
  }

  async connectStream(name) {
    await this.ensureGuestSession(name);
    const pendingConnections = [];
    if (!this.connections.has('admin')) {
      pendingConnections.push(this.startRoleConnection('admin'));
    }
    if (!this.connections.has('overlay')) {
      pendingConnections.push(this.startRoleConnection('overlay'));
    }
    if (!pendingConnections.length) {
      throw new Error('Flux déjà connecté.');
    }
    await Promise.all(pendingConnections);
    this.streamConnected = true;
    await this.updateGuestConnectionFlags();
    this.emitConnectionState();
  }

  async connectVoiceGroup(name) {
    await this.ensureGuestSession(name);
    if (this.voiceRoomStarted) {
      throw new Error('Groupe vocal déjà connecté.');
    }
    this.startGuestVoiceRoom();
    this.voiceGroupConnected = true;
    await this.updateGuestConnectionFlags();
    this.emitConnectionState();
  }

  async startRoleConnection(role) {
    if (!this.guestId || !this.localStream) {
      return;
    }
    this.clearReconnectTimer(role);

    const connection = new RTCPeerConnection(WEBRTC_CONFIGURATION);
    const videoTrack = this.localStream.getVideoTracks()[0];
    const audioTrack = this.localStream.getAudioTracks()[0];
    if (videoTrack) {
      connection.addTrack(videoTrack, this.localStream);
    }
    if (audioTrack) {
      connection.addTrack(audioTrack, this.localStream);
    }

    connection.onconnectionstatechange = async () => {
      this.onLog?.(`[guest/${role}] ${connection.connectionState}`);
      if (['connected'].includes(connection.connectionState)) {
        this.reconnectAttempts.set(role, 0);
      }
      if (['failed', 'disconnected', 'closed'].includes(connection.connectionState)) {
        this.scheduleRoleReconnect(role, connection);
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

  clearReconnectTimer(role) {
    const timer = this.reconnectTimers.get(role);
    if (timer) {
      clearTimeout(timer);
    }
    this.reconnectTimers.delete(role);
  }

  scheduleRoleReconnect(role, sourceConnection, force = false) {
    if (!this.guestId || !this.localStream || !this.streamConnected) {
      return;
    }
    const current = this.connections.get(role);
    if (!force && (!current || current.connection !== sourceConnection)) {
      return;
    }
    if (this.reconnectTimers.has(role)) {
      return;
    }

    const attempt = (this.reconnectAttempts.get(role) || 0) + 1;
    this.reconnectAttempts.set(role, attempt);
    const delayMs = Math.min(15000, 1200 * attempt);
    this.onLog?.(`[guest/${role}] Reconnexion automatique dans ${Math.round(delayMs / 1000)}s.`);

    const timer = window.setTimeout(async () => {
      this.reconnectTimers.delete(role);
      this.closeRoleConnection(role);
      if (!this.guestId || !this.localStream || !this.streamConnected) {
        return;
      }
      try {
        await clearSignals(role, this.guestId);
        await this.startRoleConnection(role);
        await this.updateGuestConnectionFlags();
        this.emitConnectionState();
      } catch (error) {
        this.onLog?.(`[guest/${role}] Échec reconnexion: ${error.message}`);
        this.scheduleRoleReconnect(role, sourceConnection, true);
      }
    }, delayMs);

    this.reconnectTimers.set(role, timer);
  }

  closeRoleConnection(role) {
    const item = this.connections.get(role);
    if (!item) {
      return;
    }
    item.unsubscribeAnswer?.();
    item.unsubscribeCandidates?.();
    item.connection?.close();
    this.connections.delete(role);
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
    if (!this.guestId || this.voiceRoomStarted) {
      return;
    }
    this.voiceRoomStarted = true;

    const unsubscribeGuests = listenValue(camGuestsRef(), (snapshot) => {
      const guests = snapshot.val() || {};
      const peers = Object.entries(guests)
        .filter(([id, guest]) => {
          if (id === this.guestId) {
            return false;
          }
          return Boolean(guest?.voiceGroupConnected);
        })
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
    const pendingRemoteCandidates = [];
    let remoteDescriptionReady = false;

    const addRemoteCandidate = async (candidate) => {
      if (!candidate) {
        return;
      }

      if (!remoteDescriptionReady) {
        pendingRemoteCandidates.push(candidate);
        return;
      }

      await connection.addIceCandidate(new RTCIceCandidate(candidate));
    };

    const flushRemoteCandidates = async () => {
      if (!remoteDescriptionReady || !pendingRemoteCandidates.length) {
        return;
      }

      while (pendingRemoteCandidates.length > 0) {
        const candidate = pendingRemoteCandidates.shift();
        await connection.addIceCandidate(new RTCIceCandidate(candidate));
      }
    };

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
          await addRemoteCandidate(candidate);
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
      remoteDescriptionReady = true;
      await flushRemoteCandidates();
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
      remoteDescriptionReady = true;
      await flushRemoteCandidates();
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

    for (const role of this.reconnectTimers.keys()) {
      this.clearReconnectTimer(role);
    }

    for (const role of [...this.connections.keys()]) {
      this.closeRoleConnection(role);
    }
    this.connections.clear();
    this.reconnectAttempts.clear();
    for (const peerId of [...this.voiceConnections.keys()]) {
      this.closeVoiceConnection(peerId);
    }

    if (this.guestId) {
      await clearSignals('admin', this.guestId);
      await clearSignals('overlay', this.guestId);
      await removeGuest(this.guestId);
    }

    this.localStream?.getTracks().forEach((track) => track.stop());
    this.stopCaptureStream();
    this.stopAudioProcessing();
    this.localStream = null;
    this.guestId = null;
    this.connectionLossHandled = false;
    this.streamConnected = false;
    this.voiceGroupConnected = false;
    this.voiceRoomStarted = false;
    this.muted = false;
    this.onState?.('idle');
    this.onLocalStream?.(null);
    this.onMuteChanged?.(this.muted);
    this.onPeersChanged?.([]);
  }
}
