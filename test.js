

const fs = require('fs');
const { PassThrough } = require('stream');
const axios = require('axios');
const path = require('path');
async function streamAudio() {
    const audioStream = new PassThrough(); // This will be the stream sent to the client

    // Step 1: Start streaming a long MP3 file
    const fileStream = fs.createReadStream('./fillers/Please give me a second t 1.mp3');
    fileStream.pipe(audioStream, { end: false });

    // Step 2: In parallel, check for text from a background task
    // const textPromise = fetchText();
    // textPromise.then(async (text) => {
    //     // Once text is available, get a stream from Playht
    //     fileStream.unpipe(audioStream); // Stop the mp3 stream from piping to the audioStream
    //     const playhtStream = await getPlayhtStream(text);
    //     playhtStream.pipe(audioStream, { end: true });
    // }).catch(error => {
    //     console.error("Error fetching text or getting stream from Playht:", error);
    //     audioStream.end(); // End the stream in case of an error
    // });
    
    return audioStream; // This stream is returned to be consumed by the client
}

async function fetchText() {
    // Simulating fetching text - replace this with your actual method of fetching text
    // This function should be modified to actually wait for a response from some async task
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve("Hello, this is a dynamically fetched text for TTS conversion.");
        }, 10000); // Simulating a delayed response, e.g., 10 seconds
    });
}

async function getPlayhtStream(text) {
    // Replace with actual Playht API call and response handling
    const response = await axios({
        method: 'get',
        url: 'https://api.playht.com/generate_stream',
        params: { text: text }
    });
    return response.data; // Assuming the API returns a stream
}

// Usage
streamAudio().then(stream => {
    // Here you would handle the stream, like sending it to a web client
    // For example, if used in an Express.js server, you might pipe this to a response object
    stream.pipe(process.stdout); // Output the audio stream to stdout for demonstration purposes
});