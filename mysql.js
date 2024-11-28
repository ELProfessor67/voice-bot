
const OpenAI = require("openai");
require('dotenv').config();

const openai = new OpenAI();

const userContext = [
    { role: 'system', content: 'callSid: CA1104812fe310c32469900ca8b6eb2b85' },
    { role: 'user', content: 'Hi. Please let me know about your capabilities.' },
    { role: 'assistant', content: 'Hi there! This is Fight Flow Academy calling in response to your inquiry. How can I assist you today?' },
    { role: 'user', content: 'What type of classes do you offer?' },
    { role: 'assistant', content: 'I can arrange a time for you to speak with a staff member, and I can also answer questions about our programs and set up free trial classes. How can I assist you today?' },
    { role: 'user', content: 'Oh, can you please set up a free trial for me?' },
    { role: 'assistant', content: 'We offer a variety of classes including Brazilian Jiu-Jitsu, Muay Thai, Boxing, and Youth Martial Arts. Each class is designed for different skill levels, from beginners to advanced practitioners. Is there a specific class you’re interested in?' },
    { role: 'user', content: "Yes. I'm interested in boxing." },
    { role: 'assistant', content: '' },
    { role: 'user', content: 'Hello. Are you there?' },
    { role: 'assistant', content: 'Great choice! We have several Boxing classes, including Boxing Bootcamp and Boxing Technique. Would you like to try the Boxing Technique class, which is available on Wednesdays at 7:30 PM, or is there another time that works better for you?' },
    { role: 'assistant', content: "If you'd like to schedule a free trial for the Boxing Technique class, I just need your full name and contact number to confirm your spot. Would you like to proceed with that?" },
    { role: 'user', content: 'Yes.' },
    { role: 'assistant', content: 'Great! Can I get your full name and contact number to set up your free trial for the Boxing Technique class?' },
    { role: 'user', content: 'Yes, Ankit and my contact number is double one, double two, double three, double four, double five.' },
    { role: 'assistant', content: "Thank you! Once I have your name and contact number, I'll schedule your free trial for the Boxing Technique class on Wednesday at 7:30 PM. What’s your full name and phone number?" },
    { role: 'user', content: 'Myself, Ankit. And my contact number is, double one, double two, double three, double four, double five.' },
    { role: 'assistant', content: "Thanks, Ankit! I’ve scheduled your free trial for the Boxing Technique class on Wednesday at 7:30 PM. You'll receive a confirmation email shortly with all the details. Is there anything else I can assist you with today?" },
    { role: 'user', content: "No. Thanks. That's all for now." },
    { role: 'assistant', content: "You're welcome, Ankit! We look forward to seeing you at Fight Flow Academy. Have a great day! Goodbye!" },
];

async function runConversation() {
    // Step 1: send the conversation and available functions to the model
    userContext.push({ role: "user", content: "Get user details from this conversation in JSON format. If some fields do not exist, add an empty string to them and respond with correct JSON format data, including email, contact, and name. make sure respond with only JSON don't add any extra information example {'email':'deepak@gmail.com', 'contact':'9639973583', 'name':'Deepak'}" },)

    const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: userContext,
    });
    const responseMessage = response.choices[0].message;
    const jsonString = responseMessage.content
        .replace(/^```json\n/, '')
        .replace(/\n```$/, '')
        .trim();

    const jsonObject = JSON.parse(jsonString);

    console.log(jsonObject);
}


runConversation().then(console.log).catch(console.error);