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

  app.delete('/delete/:videoId', async (req, res) => {
    try {
      const videoId = req.params.videoId;
      
      // Check if the video with the given ID exists in GridFS
      const file = await gfc.find({ _id: new ObjectId(videoId) }).toArray();
  
      if (file.length === 0) {
        return res.status(404).json({ error: 'Video not found' });
      }
  
      // Delete the video document and its chunks
      await gfc.delete(file[0]._id);
  
      console.log(`Video with ID ${videoId} deleted from MongoDB`);
      res.status(200).json({ message: `Video with ID ${videoId} deleted from MongoDB` });
    } catch (error) {
      console.error('Error during deletion:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

// Start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
