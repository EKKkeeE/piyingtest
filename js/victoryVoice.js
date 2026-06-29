const VOICE_GAIN = 1.45;

/** 通关台词：帷幕落下后单次播放。 */
export class VictoryVoicePlayer {
  constructor(src = "assets/audio/victory-wukong.mp3") {
    this.audio = new Audio(src);
    this.audio.preload = "auto";
    this.audio.volume = 1;
    /** @type {AudioContext | null} */
    this._ctx = null;
    /** @type {GainNode | null} */
    this._gain = null;
  }

  _ensureGain() {
    if (this._gain) return;
    this._ctx = new AudioContext();
    const source = this._ctx.createMediaElementSource(this.audio);
    this._gain = this._ctx.createGain();
    this._gain.gain.value = VOICE_GAIN;
    source.connect(this._gain);
    this._gain.connect(this._ctx.destination);
  }

  play() {
    this._ensureGain();
    if (this._ctx?.state === "suspended") {
      void this._ctx.resume();
    }
    this.audio.currentTime = 0;
    this.audio.play().catch(() => {});
  }

  stop() {
    this.audio.pause();
    this.audio.currentTime = 0;
  }
}
