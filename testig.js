const axios = require('axios');

// Replace this with your actual API key for Cohere
const cohereApiKey = '7zZnZJ6z4nrYTO9IdCMcvwW3oPWpuelouDndkmel';

// Hardcoded inputs
const stringVar = '';
const extraString = 'I have two choices namely';
const var1 = '';
const var2 = '';
const var3 ="Tell me which one to choose out of these 2 based on my wants"

// Concatenate the strings
const concatenatedString = `${stringVar} ${extraString} ${var1} ${var2}`;

// Function to send the concatenated string to Cohere API
const sendToCohere = async () => {
  try {
    const response = await axios.post(
      'https://api.cohere.ai/v1/generate', // Replace with the actual Cohere API endpoint
      {
        model: 'command-xlarge', // Replace with the model you want to use
        prompt: concatenatedString,
        max_tokens: 100, // Adjust the number of tokens based on your needs
      },
      {
        headers: {
          'Authorization': `Bearer ${cohereApiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    // Print the response from Cohere
    console.log('Response from Cohere:', response.data.generations[0].text.trim());
  } catch (error) {
    console.error('Error interacting with Cohere API:', error.response ? error.response.data : error.message);
  }
};

// Run the function
sendToCohere();
