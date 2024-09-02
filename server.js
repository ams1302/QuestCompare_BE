const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { MongoClient } = require('mongodb');
const app = express();
const port = 3001; // You can choose any port that is not in use

const clientID = 'vwbk9a29qsgfhp2ixl6hkrb1poaygm'; // Your Client ID
const clientSecret = 'ze2dxw2yp2mvv6zlssywy47xxjhrvs'; // Your Client Secret

const mongoURI = 'mongodb+srv://ameyashetty18:ameyadbuser18@sacluster.rqzuo.mongodb.net/?retryWrites=true&w=majority&appName=SACluster';
const dbName = 'SA_Mongo';
const collectionName = 'Games';

app.use(cors()); // Enable CORS for all routes
app.use(express.json());

// Function to fetch popularity data
const fetchPopularityData = async (accessToken) => {
  try {
    const response = await axios.post(
      'https://api.igdb.com/v4/popularity_primitives',
      'fields game_id, value;',
      {
        headers: {
          'Client-ID': clientID,
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error fetching popularity data:', error.message);
    throw error;
  }
};

// Endpoint to get IGDB game data
app.post('/api/games', async (req, res) => {
  try {
    // Get the access token
    const tokenResponse = await axios.post(
      'https://id.twitch.tv/oauth2/token',
      null,
      {
        params: {
          client_id: clientID,
          client_secret: clientSecret,
          grant_type: 'client_credentials',
        },
      }
    );
    const token = tokenResponse.data.access_token;

    // Ensure gameName is provided in the request body
    const gameName = req.body.gameName;
    if (!gameName) {
      return res.status(400).json({ error: 'Game name is required' });
    }

    // Fetch popularity data
    const popularityData = await fetchPopularityData(token);

    // Fetch game data from IGDB
    const gameResponse = await axios.post(
      'https://api.igdb.com/v4/games',
      `fields id, name; where name ~ *"${gameName}"* & version_parent = null & category = 0;`,
      {
        headers: {
          'Client-ID': clientID.toLowerCase(),
          'Authorization': `Bearer ${token}`,
        },
      }
    );

    // Combine the game data with the popularity data
    const gamesWithPopularity = gameResponse.data.map(game => {
      const popularityEntry = popularityData.find(p => p.game_id === game.id);
      return {
        id: game.id, // Include ID for the result
        name: game.name,
        popularity: popularityEntry ? popularityEntry.value : 0, // Assign 0 if no popularity data is found
      };
    });

    // Sort by popularity and take the top 10
    const top10Games = gamesWithPopularity
      .sort((a, b) => b.popularity - a.popularity)
      .slice(0, 10);

    res.json(top10Games);
    console.log(top10Games);
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Function to fetch access token
const fetchAccessToken = async () => {
  try {
    const response = await axios.post('https://id.twitch.tv/oauth2/token', null, {
      params: {
        client_id: clientID,
        client_secret: clientSecret,
        grant_type: 'client_credentials',
      },
    });
    return response.data.access_token;
  } catch (error) {
    console.error('Error fetching access token:', error.response ? error.response.data : error.message);
    throw error;
  }
};

// Function to fetch game data from IGDB
const fetchGameData = async (accessToken, gameName) => {
  try {
    const response = await axios.post(
      'https://api.igdb.com/v4/games',
      `fields name, cover.url, screenshots.url, aggregated_rating, aggregated_rating_count, genres.name, platforms.name, franchise.name, involved_companies.company.name, involved_companies.developer, storyline, release_dates.date, release_dates.platform, themes.name, game_modes.name; 
      where name = "${gameName}" & version_parent = null & category=0; limit 10;`,
      {
        headers: {
          'Client-ID': clientID.toLowerCase(),
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    );
    
    // Filter the game data to find the exact match
    const exactMatch = response.data.find(game => game.name.toLowerCase() === gameName.toLowerCase());

    if (exactMatch) {
      // Create the JSON object with the desired structure
      const gameInfo = {
        cover_url: exactMatch.cover ? exactMatch.cover.url : 'N/A',
        name: exactMatch.name || 'N/A',
        rating: exactMatch.aggregated_rating || 'N/A',
        genre_names: exactMatch.genres ? exactMatch.genres.map(genre => genre.name) : [],
        themes: exactMatch.themes ? exactMatch.themes.map(theme => theme.name) : [],
        release_date: exactMatch.release_dates && exactMatch.release_dates.length > 0
          ? new Date(exactMatch.release_dates[0].date * 1000).toISOString().split('T')[0]
          : 'N/A',
        game_mode: exactMatch.game_modes ? exactMatch.game_modes.map(mode => mode.name) : [],
        developer: exactMatch.involved_companies
          ? exactMatch.involved_companies.filter(companyInfo => companyInfo.developer)
              .map(companyInfo => companyInfo.company.name)
          : [],
        storyline: exactMatch.storyline || 'N/A',
        platform_names: exactMatch.platforms ? exactMatch.platforms.map(platform => platform.name) : [],
        screenshot_urls: exactMatch.screenshots ? exactMatch.screenshots.map(screenshot => screenshot.url) : [],
      };

      // Print the JSON object
      console.log('Game Info:', JSON.stringify(gameInfo, null, 2));

      // Insert the data into MongoDB
      await insertIntoMongoDB(gameInfo);
    } else {
      console.log(`No exact match found for "${gameName}".`);
    }
  } catch (error) {
    console.error('Error fetching game data:', error.response ? error.response.data : error.message);
  }
};

// Function to insert game data into MongoDB
const insertIntoMongoDB = async (gameInfo) => {
  const client = new MongoClient(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true });
  
  try {
    await client.connect();
    const db = client.db(dbName);
    const collection = db.collection(collectionName);
    
    const result = await collection.insertOne(gameInfo);
    console.log('Data inserted with id:', result.insertedId);
  } catch (error) {
    console.error('Error inserting data into MongoDB:', error.message);
  } finally {
    await client.close();
  }
};

// Endpoint to add games to MongoDB
app.post('/api/mongoadd', async (req, res) => {
  try {
    const { game1, game2 } = req.body;
    if (!game1 || !game2) {
      return res.status(400).json({ error: 'Both game names are required' });
    }

    const accessToken = await fetchAccessToken();
    
    // Fetch and insert data for both games
    await fetchGameData(accessToken, game1);
    await fetchGameData(accessToken, game2);

    res.status(200).json({ message: 'Games added to database' });
  } catch (error) {
    console.error('Error adding games to MongoDB:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Endpoint to clear all documents from MongoDB
app.post('/api/clear', async (req, res) => {
  const client = new MongoClient(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true });

  try {
    await client.connect();
    const db = client.db(dbName);
    const collection = db.collection(collectionName);
    
    // Delete all documents in the collection
    await collection.deleteMany({});
    console.log('All documents deleted');
    res.json({ message: 'All documents deleted successfully' });
  } catch (error) {
    console.error('Error deleting documents:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    await client.close();
  }
});

app.get('/api/latest-games', async (req, res) => {
  const client = new MongoClient(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true });

  try {
    await client.connect();
    const db = client.db(dbName);
    const collection = db.collection(collectionName);
    
    // Fetch the latest two games sorted by insertion order (assuming MongoDB's default _id sorting)
    const latestGames = await collection.find().sort({ _id: -1 }).limit(2).toArray();

    res.json(latestGames);
  } catch (error) {
    console.error('Error fetching latest games from MongoDB:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    await client.close();
  }
});

app.post('/api/send-to-api', async (req, res) => {
  const cohereApiKey = '7zZnZJ6z4nrYTO9IdCMcvwW3oPWpuelouDndkmel';
  const { inputValue, firstGame, secondGame } = req.body;
  
  if (!inputValue || !firstGame || !secondGame) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  try {
    const response = await axios.post(
      'https://api.cohere.ai/v1/generate',
      {
        model: 'command-xlarge',
        prompt: `${inputValue} I have two choices namely ${firstGame} and ${secondGame}. Tell me only the name of the game and a two line reason why  I should choose that game  to play, Start the response with You chould choose`,
        max_tokens: 100,
      },
      {
        headers: {
          'Authorization': `Bearer ${cohereApiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    res.json({ result: response.data.generations[0].text.trim() });
    console.log(res)
  } catch (error) {
    console.error('Error interacting with Cohere API:', error.response ? error.response.data : error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});




app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
