const EventEmitter = require('events');
const { Buffer } = require('node:buffer');
const fetch = require('node-fetch');
const PlayHT = require("playht");
const { ElevenLabsClient } = require('elevenlabs');

const elevenlabs = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY
});
class TextToSpeechService extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.config.voiceId ||= process.env.VOICE_ID;
    this.nextExpectedIndex = 0;
    this.speechBuffer = {};
    PlayHT.init({
      apiKey: process.env.PLAYHT_API_KEY,
      userId: process.env.PLAYHT_USER_ID,
    });
  }

  async generate(gptReply, interactionCount) {
    const { partialResponseIndex, partialResponse } = gptReply;
    if (!partialResponse) { return; }

    try {
      // const response = await elevenlabs.textToSpeech.convert(this.config.voiceId, {
      //   model_id: 'eleven_turbo_v2',
      //   output_format: 'ulaw_8000',
      //   text: partialResponse,
      // });

      // const audioArrayBuffer = await this.streamToArrayBuffer(response);
      // this.emit('speech', partialResponseIndex, Buffer.from(audioArrayBuffer).toString('base64'), partialResponse, interactionCount);

      // const bfr = Buffer.from(audioArrayBuffer).toString('base64')
      // console.log(bfr);

      // const outputFormat = 'ulaw_8000';
      // const response = await fetch(
      //   `https://api.elevenlabs.io/v1/text-to-speech/${this.config.voiceId}/stream?output_format=${outputFormat}&optimize_streaming_latency=3`,
      //   {
      //     method: 'POST',
      //     headers: {
      //       'xi-api-key': process.env.XI_API_KEY,
      //       'Content-Type': 'application/json',
      //       accept: 'audio/wav',
      //     },
      //     // TODO: Pull more config? https://docs.elevenlabs.io/api-reference/text-to-speech-stream
      //     body: JSON.stringify({
      //       model_id: process.env.XI_MODEL_ID,
      //       text: partialResponse,
      //     }),
      //   }
      // );
      // const audioArrayBuffer = await response.arrayBuffer();
      // this.emit('speech', partialResponseIndex, Buffer.from(audioArrayBuffer).toString('base64'), partialResponse, interactionCount);

      // const streamingOptions = {
      //   // must use turbo for the best latency
      //   voiceEngine: "PlayHT2.0-turbo",
      //   // this voice id can be one of our prebuilt voices or your own voice clone id, refer to the`listVoices()` method for a list of supported voices.
      //   voiceId:
      //     "s3://voice-cloning-zero-shot/d9ff78ba-d016-47f6-b0ef-dd630f59414e/female-cs/manifest.json",
      //   // you can pass any value between 8000 and 48000, 24000 is default
      //   sampleRate: 44100,
      //   // the generated audio encoding, supports 'raw' | 'mp3' | 'wav' | 'ogg' | 'flac' | 'mulaw'
      //   outputFormat: 'mp3',
      //   // playback rate of generated speech
      //   speed: 1,
      // };

      // // start streaming!
      // const text = "Hey, this is Jennifer from Play. Please hold on a moment, let me just um pull up your details real quick."
      // const stream = await PlayHT.stream(text, streamingOptions);

      // stream.on("data", (chunk) => {
      //   console.log(chunk, '===========>>>>playht');
      // });
      // console.log(partialResponse);
      const streamFromStream = await PlayHT.stream(partialResponse, {
        voiceEngine: 'PlayHT2.0-turbo',
        voiceId: 's3://voice-cloning-zero-shot/d9ff78ba-d016-47f6-b0ef-dd630f59414e/female-cs/manifest.json',
        outputFormat: 'mulaw',
        sampleRate: 8000,
        speed: 1,
      });

      streamFromStream.on('data', (data) => {
        this.emit('speech', partialResponseIndex, data.toString('base64'), partialResponse, interactionCount);
      });

      // streamFromStream.on('end', (data) => {
      //   console.log('Stream ended');
      // });
      // streamFromStream.on('error', (err) => {
      //   console.error('Error occurred while handling speech stream:', err);
      // });

      // const url = 'https://api.play.ht/api/v2/tts/stream';
      // const options = {
      //   method: 'POST',
      //   headers: {
      //     'content-type': 'application/json',
      //     AUTHORIZATION: process.env.PLAYHT_API_KEY,
      //     'X-USER-ID': process.env.PLAYHT_USER_ID
      //   },
      //   body: JSON.stringify({
      //     text: partialResponse,
      //     voice: 's3://voice-cloning-zero-shot/d9ff78ba-d016-47f6-b0ef-dd630f59414e/female-cs/manifest.json',
      //     output_format: 'mulaw',
      //     sample_rate: 8000
      //   })
      // };

      // fetch(url, options)
      //   .then(async res => {
      //     const audioArrayBuffer = await res.arrayBuffer();
      //     console.log(audioArrayBuffer);
      //     this.emit('speech', partialResponseIndex, Buffer.from(audioArrayBuffer).toString('base64'), partialResponse, interactionCount);
      //   })
      //   .catch(err => console.error('error:' + err));

    } catch (err) {
      console.error('Error occurred in TextToSpeech service');
      console.error(err, '---err');
    }
  }
}

module.exports = { TextToSpeechService };
