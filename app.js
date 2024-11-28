
require('dotenv').config();
require('colors');
const express = require('express');
const ExpressWs = require('express-ws');
const mongoose = require('mongoose');
const { GptService } = require('./services/gpt-service');
const { TranscriptionService } = require('./services/transcription-service');
const PlayHT = require("playht");
const promotModel = require("./models/prompts.model");
const configsModel = require("./models/confings.model");
const callHistoryModel = require("./models/callHistory.model");
const gptService = new GptService();
const https = require("https");
const OpenAI = require("openai");
const openai = new OpenAI();
const fs = require("fs");
const fetch = require('node-fetch');
const { ElevenLabsClient, ElevenLabs } = require('elevenlabs');
const twilio = require('twilio');
const bodyParser = require('body-parser');
const http = require('http');
const { Server } = require('socket.io');
const DEEPGRAM_URL = "https://api.deepgram.com/v1/speak?model=aura-asteria-en&encoding=mulaw";
const app = express();
console.log(process.env.ELEVENLABS_API_KEY);
const clients = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const server = http.createServer(app);
ExpressWs(app, server);
mongoose.connect(process.env.MONGO_URI);
console.log(process.env.MONGO_URI)
const db = mongoose.connection;
db.on("error", (err) => {
  console.log(err);
});

db.once("open", () => {
  console.log("Database Connected");
});
const PORT = process.env.PORT || 3000;

PlayHT.init({
  apiKey: process.env.PLAYHT_API_KEY,
  userId: process.env.PLAYHT_USER_ID,
});

let streamSid;
let callSid;
let prompt;
let resPrompt;
let isSpeaking = false;
let isStreaming = false;
let isApiKey = false;
let history = [];

const axios = require('axios');
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const elevenLabsApiKeys = [
  { apiKey: "sk_9b57900e4b76dc11d8aaa55d5030047883befe88fad6eeb4", voiceId: "QwvsCFsQcnpWxmP1z7V9" },
  { apiKey: "sk_e309cb621ab05decbb6694584fa435e1b1552c43ae742f97", voiceId: "CODoDGqiRYsYJGyWRdMw" },
  { apiKey: "sk_f4d938c4d35189c1632ff71eeea8453ba19cfb84dea55f26", voiceId: "CODoDGqiRYsYJGyWRdMw" },
];

let elevenlabsCurrentIndex = 0;

function getNextApiKey() {
  const apiKey = elevenLabsApiKeys[elevenlabsCurrentIndex]["apiKey"];
  const voiceId = elevenLabsApiKeys[elevenlabsCurrentIndex]["voiceId"];
  // Move to the next index, reset to 0 if at the end of the array
  elevenlabsCurrentIndex = (elevenlabsCurrentIndex + 1) % elevenLabsApiKeys.length;
  return { apiKey, voiceId };
}

app.post('/incoming', async (req, res) => {
  const promptData = await promotModel.findOne({ twilioNumber: `+1${req.query.id}`, isDefault: true }).populate("configId");
  resPrompt = promptData;
  console.log(`wss://${process.env.SERVER}/connection`);
  res.status(200);
  res.type('text/xml');
  res.end(`
  <Response>
    <Connect>
      <Stream url="wss://${process.env.SERVER}/connection" />
    </Connect>
  </Response>
  `);
});

io.on('connection', async (socket) => {
  console.log('Client connected');
  let apiKey = socket.handshake.query.apiKey;
  let isVoiceNeeded = socket.handshake.query.isVoiceNeeded;
  console.log('API Key:', apiKey);

  if (apiKey) {
    const promptData = await promotModel.findOne({ apiKey }).populate("configId");
    if (promptData) {
      console.log("Prompt data loaded");
      resPrompt = promptData;
      history = [{ role: 'system', content: resPrompt.instructions }];
      model = promptData?.configId?.aiModels.filter(e => e.status == true);
      isApiKey = true;

      socket.on("firstFiller", (data) => {
        console.log("Generating initial response");
        generateDeepgramStream(promptData?.configId?.firstFiller, socket);
      });
    } else {
      socket.emit('audio-chunk', "Invalid API key.");
    }
  } else {
    socket.emit('audio-chunk', "API key is required.");
  }

  socket.on('message', async (message) => {
    console.log('Received user message:', message);
    history.push({ role: 'user', content: message });

    if (!isApiKey) {
      socket.emit('audio-chunk', "API key not provided or invalid.");
      return;
    }

    try {
      console.log('Sending message to OpenAI');
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: history,
      });

      let assistantResponse;
      if (response.choices && response.choices.length > 0) {
        assistantResponse = response.choices[0].message.content;
        console.log("OpenAI response:", assistantResponse);
      } else {
        console.error("No choices returned from OpenAI");
      }

      if (isVoiceNeeded === "true") {
        console.log("Generating voice response");
        generateDeepgramStream(assistantResponse, socket);
      } else {
        socket.emit('audio-chunk', assistantResponse);
      }

      if (assistantResponse.toLowerCase().trim().includes("goodbye")) {
        await extractNeededIformation(history);
      }
    } catch (error) {
      console.error('Error making request to OpenAI:', error.message);
      if (error.response) {
        console.error('OpenAI response error:', error.response.status, error.response.data);
      }
      socket.emit('response', 'Error: Unable to process your request to OpenAI.');
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});


app.ws('/connection', async (ws) => {
  try {
    if (!resPrompt) {
      ws.close();
    }
    await callPlayHt(resPrompt?.configId?.firstFiller || 'Hi, how can I assist you?', ws);
    const transcriptionService = new TranscriptionService(ws);
    gptService.aiModel = resPrompt.configId.aiModels.filter((e) => e.status == true);
    gptService.userContext = [{ role: "system", content: resPrompt?.assistantId }, { role: "user", content: resPrompt?.instructions }];
    let marks = [];
    let interactionCount = 0;

    // Track the current task
    let currentTask = null;

    ws.on('message', async function message(data) {
      const msg = JSON.parse(data);
      if (msg.event === 'start') {
        streamSid = msg.start.streamSid;
        callSid = msg.start.callSid;
        gptService.setCallSid(callSid);
      } else if (msg.event === 'media') {
        transcriptionService.send(msg.media.payload);
      } else if (msg.event === 'mark') {
        const label = msg.mark.name;
        marks = marks.filter(m => m !== msg.mark.name);
      } else if (msg.event === 'stop') {
        await callHistoryModel.create({
          streamSid: msg?.streamSid,
          accountSid: msg["stop"]["accountSid"],
          callSid: msg["stop"]["callSid"],
          userId: resPrompt?.userId,
          twilioNumber: resPrompt?.twilioNumber,
          userContext: gptService?.userContext
        });
      }
    });

    transcriptionService.on('transcription', async (text) => {
      if (!text) { return; }
      console.log(`user: ${text}`.yellow);

      // Clear any ongoing task
      if (currentTask) {
        currentTask.cancel();
        ws.send(
          JSON.stringify({
            streamSid,
            event: 'clear',
          })
        );
      }

      // Start a new task
      currentTask = createTask(async () => {
        try {
          const randomNumber = Math.floor(Math.random() * resPrompt?.configId?.fillers?.length);
          if (resPrompt?.configId?.fillers?.length) {
            console.log("=============first filler time");
            await callPlayHt(resPrompt?.configId?.fillers[randomNumber], ws)
          }
          isSpeaking = true;
          await gptService.completion(text, interactionCount);
          interactionCount += 1;
        } catch (error) {
          ws.close();
          console.log(error);
        }
      });
      currentTask.start();
    });

    gptService.on('gptreply', async (gptReply) => {
      isSpeaking = false;
      isStreaming = false;
      console.log("==============gpt calling");
      await callPlayHt(gptReply, ws);
    });

    gptService.on('close', async () => {
      ws.close();
    });

    transcriptionService.on('deepgramClose', async () => {
      extractNeededIformation("close from deepgram")
    });
  } catch (error) {
    console.log(error);
  }
});

function createTask(callback) {
  let isCancelled = false;

  return {
    start: async () => {
      if (!isCancelled) {
        await callback();
      }
    },
    cancel: () => {
      isCancelled = true;
    }
  };
}

async function callPlayHt(text, ws) {
  try {
    callElevenLabs(text, ws)
    // getAudioFromDeepgram(text, ws)
    // const streamFromStream = await PlayHT.stream(text, {
    //   voiceEngine: 'PlayHT2.0-turbo',
    //   voiceId: resPrompt?.configId?.voiceId || "s3://voice-cloning-zero-shot/d9ff78ba-d016-47f6-b0ef-dd630f59414e/female-cs/manifest.json",
    //   outputFormat: 'mulaw',
    //   sampleRate: 8000,
    //   speed: resPrompt?.configId?.audioSpeed || 0.9
    // });
    // addStream(ws, streamFromStream, text);
  } catch (error) {
    console.log(error);
  }
}

async function addStream(ws, streamFromStream, text) {
  try {
    // Flag to track if stream should be stopped
    let stopStream = false;

    streamFromStream.on('data', async (data) => {
      if (stopStream) {
        streamFromStream.destroy();  // Stop the stream
        ws.send(
          JSON.stringify({
            streamSid,
            event: 'clear',
          })
        );
      } else {
        isStreaming = true;
        const message = JSON.stringify({
          event: 'media',
          streamSid,
          media: {
            payload: data.toString('base64'),
          },
        });
        await ws.send(message);
      }
    });

    streamFromStream.on('end', async () => {
      if (text.toLowerCase().trim().includes("goodbye")) {
        setTimeout(() => {
          ws.close();
        }, 5000);
      }
    });

    streamFromStream.on('error', (error) => {
      console.log("playht error:", error);
    });

    // Listen to WebSocket messages for interruption
    ws.on('message', (message) => {
      const msg = JSON.parse(message);
      if (msg.event === 'stop') {
        stopStream = true;  // Set flag to stop the stream
      }
    });

    ws.on('close', () => {
      console.log("WebSocket connection closed.");
      streamFromStream.destroy();  // Ensure stream is destroyed when WebSocket closes
    });

  } catch (error) {
    console.log(error);
  }
}


const getAudioFromDeepgram = (text, ws) => {
  const payload = JSON.stringify({
    text
  });

  const requestConfig = {
    method: "POST",
    headers: {
      Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
      "Content-Type": "application/json",
    },
  };

  const req = https.request(DEEPGRAM_URL, requestConfig, (res) => {
    res.on("data", async (chunk) => {
      const message = JSON.stringify({
        event: 'media',
        streamSid,
        media: {
          payload: chunk.toString('base64'),
        },
      });
      await ws.send(message);
    });

    res.on("end", async () => {
      if (text.toLowerCase().trim().includes("goodbye")) {
        closeTimeout = setTimeout(() => {
          ws.close();
        }, 5000);
      }
    });
  });

  req.on("error", (error) => {
    console.error("Error:", error);
  });

  req.write(payload);
  req.end();
}

const extractNeededIformation = async (calledFrom) => {
  if (resPrompt?.configId?.informationNeeded && resPrompt?.configId?.informationNeeded?.length) {
    let userContext = gptService?.userContext;
    userContext.push({ role: "user", content: resPrompt?.configId?.informationNeeded });
    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: userContext,
    });
    try {
      const responseMessage = response.choices[0].message;
      const jsonString = responseMessage.content
        .replace(/^```json\n/, '')
        .replace(/\n```$/, '')
        .trim();
      const jsonObject = JSON.parse(jsonString);
      const zapierWebhookUrl = 'https://hooks.zapier.com/hooks/catch/19547307/26xujs2/'; // Zapier webhook URL
      axios.post(zapierWebhookUrl, jsonObject)
        .then(response => {
          console.log(jsonObject, calledFrom, 'Data sent successfully!');
          // extractAnalysis("examinar")
        })
        .catch(error => {
          console.log(jsonObject,'==========examiner');
          console.error('Failed to send data', error.message);
        });
    } catch (error) {
      console.log(error);
    }
  }
}

const callElevenLabs = async (text, ws) => {
  try {
    const { apiKey, voiceId } = await getNextApiKey();
    const client = new ElevenLabsClient({ apiKey });
    console.log(apiKey, "===called ElevenLabs====", new Date(), "=====", elevenlabsCurrentIndex);
    const streamFromStream = await client.textToSpeech.convertAsStream(voiceId, {
      optimize_streaming_latency: ElevenLabs.OptimizeStreamingLatency.Zero,
      output_format: ElevenLabs.OutputFormat.Ulaw8000,
      text,
      voice_settings: {
        stability: 0.1,
        similarity_boost: 0.3,
        style: 0.2
      }
    });

    let stopStream = false;

    streamFromStream.on('data', async (data) => {
      if (stopStream) {
        streamFromStream.destroy();  // Stop the stream
        ws.send(
          JSON.stringify({
            streamSid,
            event: 'clear',
          })
        );
      } else {
        isStreaming = true;
        const message = JSON.stringify({
          event: 'media',
          streamSid,
          media: {
            payload: data.toString('base64'),
          },
        });
        await ws.send(message);
      }
    });

    streamFromStream.on('end', async () => {
      if (text.toLowerCase().trim().includes("goodbye")) {
        setTimeout(() => {
          ws.close();
        }, 5000);
      }
    });

    streamFromStream.on('error', (error) => {
      console.log("eleven labs error:");
    });

    // Listen to WebSocket messages for interruption
    ws.on('message', (message) => {
      const msg = JSON.parse(message);
      if (msg.event === 'stop') {
        stopStream = true;  // Set flag to stop the stream
      }
    });

    ws.on('close', () => {
      console.log("WebSocket connection closed.");
      streamFromStream.destroy();  // Ensure stream is destroyed when WebSocket closes
    });

    // const outputFormat = 'ulaw_8000';
    // const response = await fetch(
    //   `https://api.elevenlabs.io/v1/text-to-speech/xQdYsQBNJ585kyi9AC6I/stream?output_format=${outputFormat}&optimize_streaming_latency=3`,
    //   {
    //     method: 'POST',
    //     headers: {
    //       'xi-api-key': "sk_70e254b6efd6ef7c9ad158897b7f336d318bb79aacb8e40d",
    //       'Content-Type': 'application/json',
    //       accept: 'audio/wav',
    //     },
    //     // TODO: Pull more config? https://docs.elevenlabs.io/api-reference/text-to-speech-stream
    //     body: JSON.stringify({
    //       model_id: process.env.XI_MODEL_ID,
    //       text: text,
    //     }),
    //   }
    // );
    // const audioArrayBuffer = await response.arrayBuffer();
    // const message = JSON.stringify({
    //   event: 'media',
    //   streamSid,
    //   media: {
    //     payload: Buffer.from(audioArrayBuffer).toString('base64'),
    //   },
    // });
    // await ws.send(message);
    // if (text.toLowerCase().trim().includes("goodbye")) {
    //   closeTimeout = setTimeout(() => {
    //     ws.close();
    //   }, 8000);
    // }
  } catch (error) {
    console.log(error, "eleven labs api");
  }
}


app.post('/make-call', (req, res) => {
  console.log(req.query.to);
  clients.calls
    .create({
      url: `https://${process.env.SERVER}/twiml`, // Replace with your TwiML URL  
      to: req.query.to,   // The phone number to call (in E.164 format)  
      from: '+18288880659' // Your Twilio number  
    })
    .then(call => res.send(`Call initiated: ${call.sid}`))
    .catch(error => {
      console.log(error);
      res.status(500).send(error)
    });
});

// Endpoint to return TwiML  
app.post('/twiml', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  twiml.say('Hello, this is a test call from Twilio!');
  res.type('text/xml');
  res.send(twiml.toString());
});

function generateDeepgramStream(assistantResponse, socket) {
  console.log("called Deepgram ====", new Date());

  const data = JSON.stringify({
    text: assistantResponse,
  });

  const options = {
    method: "POST",
    headers: {
      Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
      "Content-Type": "application/json",
    },
  };

  const req = https.request(DEEPGRAM_URL, options, (res) => {
    if (res.statusCode !== 200) {
      console.error(`HTTP error! Status: ${res.statusCode}`);
      return;
    }

    const audioChunks = [];
    res.on('data', (chunk) => {
      audioChunks.push(chunk);
    });

    res.on('end', () => {
      const audioBuffer = Buffer.concat(audioChunks);
      socket.emit('audio-chunk', audioBuffer);
      console.log('Audio stream complete');
    });
  });

  req.on("error", (error) => {
    console.error("Error making request to Deepgram:", error.message);
    socket.emit('response', 'Error: Unable to process your request to Deepgram.');
  });

  req.write(data);
  req.end();
}

const extractAnalysis = async (calledFrom) => {
  // if (resPrompt?.configId?.informationNeeded && resPrompt?.configId?.informationNeeded?.length) {
  let userContext = gptService?.userContext;
  userContext.push({
    role: "user", content: `Extract a detailed analysis of the customer's English proficiency from this conversation in JSON format, focusing on the specified evaluation parameters. For each parameter, provide a score (if applicable) and a brief qualitative assessment. Ensure the data is structured as follows:
    Pronunciation and Accent: Evaluate clarity, regional influence, and intelligibility.
    Grammar and Syntax: Assess sentence structure, tense accuracy, and overall grammatical correctness.
    Vocabulary and Word Choice: Analyze the range, appropriateness, and correctness of vocabulary used.
    Fluency and Coherence: Evaluate the smoothness of speech, logical flow, and ability to connect ideas.
    Comprehension: Measure understanding and appropriate responses to questions or prompts.
    Pronouns and Plurals: Check the correct use of pronouns and plural forms.
    Idiomatic Expression: Assess the correct usage and understanding of idiomatic phrases.
    Listening Skills: Evaluate the ability to accurately hear and respond to spoken prompts.
    Pronunciation of Specific Sounds: Identify any difficulties with particular sounds or phonemes.
    Pacing and Intonation: Measure the rhythm and expressiveness of speech, noting any unnatural pauses or monotony.
    Cultural Context Understanding: Assess the ability to understand and appropriately respond to culturally specific references or contexts.
    Confidence and Articulation: Evaluate the speaker's confidence level and clarity of speech delivery.
    Output Format:
    
    Customer Name: Customer name.
    Assessment Date: Date the conversation took place.
    Pronunciation and Accent: {"Score": "X/10", "Assessment": "Brief qualitative feedback"}
    Grammar and Syntax: {"Score": "X/10", "Assessment": "Brief qualitative feedback"}
    Vocabulary and Word Choice: {"Score": "X/10", "Assessment": "Brief qualitative feedback"}
    Fluency and Coherence: {"Score": "X/10", "Assessment": "Brief qualitative feedback"}
    Comprehension: {"Score": "X/10", "Assessment": "Brief qualitative feedback"}
    Pronouns and Plurals: {"Score": "X/10", "Assessment": "Brief qualitative feedback"}
    Idiomatic Expression: {"Score": "X/10", "Assessment": "Brief qualitative feedback"}
    Listening Skills: {"Score": "X/10", "Assessment": "Brief qualitative feedback"}
    Pronunciation of Specific Sounds: {"Score": "X/10", "Assessment": "Brief qualitative feedback"}
    Pacing and Intonation: {"Score": "X/10", "Assessment": "Brief qualitative feedback"}
    Cultural Context Understanding: {"Score": "X/10", "Assessment": "Brief qualitative feedback"}
    Confidence and Articulation: {"Score": "X/10", "Assessment": "Brief qualitative feedback"}
    Ensure the JSON is well-formed and only contains the relevant data. If a particular parameter is not assessable, leave it as an empty string or note "Not Assessed". Avoid repeating or extracting irrelevant information. Do not speak the JSON action aloud, and ensure the data is concise and accurate.` });
  const response = await openai.chat.completions.create({
    model: "gpt-4",
    messages: userContext,
  });
  try {
    const responseMessage = response.choices[0].message;
    console.log(responseMessage);
    const jsonString = responseMessage.content
      .replace(/^```json\n/, '')
      .replace(/\n```$/, '')
      .trim();
    const jsonObject = JSON.parse(jsonString);
    const zapierWebhookUrl = 'https://hooks.zapier.com/hooks/catch/19547307/26z8gau/'; // Zapier webhook URL
    axios.post(zapierWebhookUrl, jsonObject)
      .then(response => {
        console.log(jsonObject, calledFrom, 'Data sent successfully!');
      })
      .catch(error => {
        console.error('Failed to send data', error.message);
      });
  } catch (error) {
    console.log(error);
  }
  // }
}

server.listen(PORT);
console.log(`Server running on port ${PORT}`);