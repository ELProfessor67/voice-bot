require('colors');
const EventEmitter = require('events');
const OpenAI = require('openai');
const tools = require('../functions/function-manifest');
const axios = require('axios');
const { CohereClient } = require('cohere-ai');
const https = require("https");
const fs = require("fs");

const DEEPGRAM_URL = "https://api.deepgram.com/v1/speak?model=aura-asteria-en&encoding=mulaw";
const DEEPGRAM_API_KEY = "e162a8af9703f7130dd7786d1534981c3a7ccc97";

const availableFunctions = {};
tools.forEach((tool) => {
  const functionName = tool.function.name;
  availableFunctions[functionName] = require(`../functions/${functionName}`);
});

const cohere = new CohereClient({ token: process.env.COHERE_TOKEN });

class GptService extends EventEmitter {
  constructor() {
    super();
    this.openai = new OpenAI();
    this.userContext = [];
    this.questions = [];
    this.prompt = '';
    this.partialResponseIndex = 0;
    this.aiModel = '';
  }

  setCallSid(callSid) {
    const roleContent = { role: this.aiModel[0]?.name === "cohere" ? 'CHATBOT' : 'system', content: `callSid: ${callSid}` };
    this.userContext.push(roleContent);
  }

  validateFunctionArgs(args, interactionCount) {
    try {
      return JSON.parse(args);
    } catch (error) {
      try {
        const firstBracket = args.indexOf('{');
        const lastBracket = args.lastIndexOf('}');
        if (firstBracket !== -1 && lastBracket !== -1 && firstBracket < lastBracket) {
          return JSON.parse(args.substring(firstBracket, lastBracket + 1));
        }
      } catch (innerError) {
        return JSON.parse(JSON.stringify(args));
      }
    }
  }

  async updateUserContext(name, role, text) {
    const context = { role, content: text };
    if (name !== 'user') {
      context.name = name;
    }
    this.userContext.push(context);
  }

  async completion(text, interactionCount, role = 'user', name = 'user') {
    try {
      let responseReceived = false;
      this.updateUserContext(name, role, text);
      const stream = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: this.userContext,
        stream: true,
      });

      const completeResponse = [];
      const iterator = stream[Symbol.asyncIterator]();
      while (true) {
        const { value, done } = await iterator.next();
        if (done) break;
        completeResponse.push(value.choices[0]?.delta?.content || '');
      }
      responseReceived = true;
      // if (completeResponse.join('').includes("closeCall")) {
      //   this.emit('close');
      // } else {
      this.emit('gptreply', completeResponse.join(''));
      this.partialResponseIndex++;
      this.userContext.push({ 'role': 'assistant', 'content': completeResponse.join('') });
      console.log(`GPT -> user context length: ${completeResponse.join('')}`.green);
      // }
      // }

      // const timeout = setTimeout(() => {
      //   if (!responseReceived) {
      //     this.emit('gptreply', "give me a sec");
      //     console.log('No response in 2 seconds, resubmitting the request.');
      //     performCompletion();
      //   }
      // }, 3000); // 2 minutes in milliseconds

      // // Perform the initial completion request
      // await performCompletion();

      // // Clear the timeout if response is received in time
      // if (responseReceived) {
      //   clearTimeout(timeout);
      // }
    } catch (error) {
      if (error.code === 'insufficient_quota') {
        console.error('Quota exceeded. Please check your OpenAI plan and billing details.');
        // You can add logic here to handle the error, such as retrying later, sending a notification, etc.
      } else {
        console.error('An unexpected error occurred:', error);
      }
    }
  }


  // async completion(text, interactionCount, role = 'user', name = 'user') {
  //   this.updateUserContext(name, role, text);
  //   if (this.aiModel?.name === "cohere") {
  //     await this.handleCohereCompletion(text, interactionCount);
  //   } else {
  //     await this.handleGptCompletion(text, interactionCount);
  //   }
  // }

  // async handleGptCompletion(text, interactionCount) {
  //   try {
  //     const stream = await this.openai.chat.completions.create({
  //       model: 'gpt-4o',
  //       messages: this.userContext,
  //       stream: true,
  //     });

  //     let completeResponse = '';
  //     for await (const chunk of stream) {
  //       completeResponse += chunk.choices[0]?.delta?.content || '';
  //     }
  //     this.processGptResponse(completeResponse);
  //   } catch (error) {
  //     console.error('Error in GPT completion:', error);
  //   }
  // }

  // processGptResponse(responseText) {
  //   if (responseText.includes("closeCall")) {
  //     this.emit('close');
  //   } else {
  //     this.emit('gptreply', responseText);
  //     this.userContext.push({ role: 'assistant', content: responseText });
  //     console.log(`GPT -> user context length: ${this.userContext.length}`.green);
  //   }
  // }
}

const getAudioFromDeepgram = (text) => {
  const payload = JSON.stringify({
    text
  });

  const requestConfig = {
    method: "POST",
    headers: {
      Authorization: `Token ${DEEPGRAM_API_KEY}`,
      "Content-Type": "application/json",
    },
  };


  const req = https.request(DEEPGRAM_URL, requestConfig, (res) => {
    res.on("data", async (chunk) => {
      console.log(chunk);
    });

    const dest = fs.createWriteStream(`${Date.now()}output.mp3`);
    res.pipe(dest);
    res.on("end", () => {
      console.log("Audio download complete");
    });
  });

  req.on("error", (error) => {
    console.error("Error:", error);
  });

  req.write(payload);
  req.end();
}

module.exports = { GptService };
