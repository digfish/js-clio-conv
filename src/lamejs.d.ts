declare module 'lamejs' {
  export class Mp3Encoder {
    constructor(channels: number, samplerate: number, kbps: number);
    encodeBuffer(left: Int16Array, right?: Int16Array): Uint8Array;
    flush(): Uint8Array;
  }
}

declare module 'lamejs/src/js/Lame.js' {
  const Lame: unknown;
  export default Lame;
}

declare module 'lamejs/src/js/MPEGMode.js' {
  const MPEGMode: unknown;
  export default MPEGMode;
}

declare module 'lamejs/src/js/BitStream.js' {
  const BitStream: unknown;
  export default BitStream;
}
