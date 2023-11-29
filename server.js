const express = require('express');
const { MongoClient, ObjectId , GridFSBucket } = require('mongodb');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
require('dotenv').config();

// Multer storage
const storage = multer.memoryStorage();
const upload = multer({ 
    storage: storage,
    // buffer: Buffer.alloc(10 * 1024 * 1024),
});


const app = express();
const port = 3000;
app.use(express.json());

// MongoDB connection string
const mongoURI = "mongodb+srv://udityaprakash01:"+process.env.MONGODBPASS+"@cluster0.za5wk8j.mongodb.net";
const dbName = 'videos';
const collectionName = 'uploadedVideos';

// MongoDB client
const client = new MongoClient(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true });
// 1 MB

// app.get('/stream/:id', async (req, res) => {
//   try {
//     // Connect to MongoDB
//     await client.connect();
//     console.log('Connected to MongoDB');

//     // Select the database and collection
//     const database = client.db(dbName);
//     const collection = database.collection(collectionName);

//     const videoId = req.params.id;

//     // Find the video by ID in MongoDB
//     const videoData = await collection.findOne({ _id: ObjectId(videoId) });

//     if (!videoData) {
//       return res.status(404).json({ error: 'Video not found' });
//     }

//     // Set headers for video streaming
//     res.setHeader('Content-Type', 'video/mp4');

//     const videoBuffer = videoData.video;
//     const totalSize = videoBuffer.length;

//     // Set the initial range of the video to be streamed
//     let start = 0;
//     let end = chunkSize - 1;

//     // Loop to stream video in chunks
//     while (start < totalSize) {
//       if (end >= totalSize - 1) {
//         end = totalSize - 1;
//       }

//       // Send the chunk
//       res.status(206).header({
//         'Content-Range': `bytes ${start}-${end}/${totalSize}`,
//         'Accept-Ranges': 'bytes',
//         'Content-Length': end - start + 1,
//       }).end(videoBuffer.slice(start, end + 1));

//       // Move to the next chunk
//       start = end + 1;
//       end = start + chunkSize - 1;

//       // Add a delay to simulate streaming (adjust as needed)
//       await new Promise(resolve => setTimeout(resolve, 100));
//     }
//   } catch (error) {
//     console.error('Error during video streaming:', error);
//     res.status(500).json({ error: 'Internal Server Error' });
//   } finally {
//     // Close the MongoDB connection
//     await client.close();
//   }
// });

let gfs;

app.post('/upload', upload.single('video'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }
  
      // Connect to MongoDB
      await client.connect();
      console.log('Connected to MongoDB');
  
      // Select the database
      const database = client.db(dbName);
  
      // Create a new GridFSBucket
      gfs = new GridFSBucket(database);
  
      // Create a readable stream from the uploaded file
      const readStream = gfs.openUploadStream(req.file.originalname);
  
      // Write the buffer to the stream
      readStream.end(req.file.buffer);
  
      // Listen for the 'finish' event to know when the upload is complete
      readStream.on('finish', async () => {
        console.log('Video uploaded and stored in MongoDB');
        res.status(200).json({ message: 'Video uploaded and stored in MongoDB' });
      });
  
      // Listen for any errors during the upload
      readStream.on('error', (error) => {
        console.error('Error during upload:', error);
        res.status(500).json({ error: 'Internal Server Error' });
      });
    } catch (error) {
      console.error('Error during upload:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  let gfc;

  async function initializeMongoDB() {
    await client.connect();
    console.log('Connected to MongoDB');
    const database = client.db(dbName);
    gfc = new GridFSBucket(database);
  }

  initializeMongoDB();

  app.get('/stream/:filename', async (req, res) => {
    try {
      const filename = req.params.filename;
  
      // Check if the file exists in GridFS
      const file = await gfc.find({ filename }).toArray();
  
      if (file.length === 0) {
        return res.status(404).json({ error: 'File not found' });
      }
  
      // Set the proper content type
      res.setHeader('Content-Type', 'video/mp4');
  
      // Set the content length based on the total file size
      res.setHeader('Content-Length', file[0].length);
  
      // Set the range of the video to be streamed
      const range = req.headers.range;
  
      if (range == undefined || !range.includes('bytes=')) {
        const readStream = gfc.openDownloadStreamByName(filename);
        readStream.pipe(res);
        readStream.on('end', () => {
            res.end();
        });
        // return res.status(400).send('Range header is required');
      }
  
      const positions = range.replace(/bytes=/, '').split('-');
      const start = parseInt(positions[0], 10);
      const end = positions[1] ? parseInt(positions[1], 10) : file[0].length - 1;
  
      const chunkSize = 2 * 1024 * 1024; // 2 MB chunk size

      // Set the Content-Range header
      res.setHeader('Content-Range', `bytes ${start}-${end}/${file[0].length}`);

      // Set the 206 Partial Content status code
      res.status(206);
  
      // Calculate the number of chunks needed
      const numChunks = Math.ceil((end - start + 1) / chunkSize);

      res.setMaxListeners(numChunks + 1);
  
      for (let i = 0; i < numChunks; i++) {
        const chunkStart = start + i * chunkSize;
        const chunkEnd = Math.min(chunkStart + chunkSize - 1, end);
  
        // Create a readable stream from the video chunk
        const readStream = gfc.openDownloadStreamByName(filename, {
          start: chunkStart,
          end: chunkEnd,
        });
  
        // Pipe the read stream to the response stream
        readStream.pipe(res, { end: false });
  
        // Close the read stream when the pipe is finished
        readStream.on('end', () => {
          if (i === numChunks - 1) {
            res.end();
          }
        });
      }
    } catch (error) {
      console.error('Error during streaming:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

// Start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
