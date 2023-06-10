const express = require('express')
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();
const app = express();
const port = process.env.PORT || 5000;
app.use(cors());
app.use(express.json())


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.xpliwro.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).send({ error: true, message: 'unauthorized access' });
  }
  //bearer token
  const token = authorization.split(' ')[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ error: true, message: 'unauthorized access' });
    }
    req.decoded = decoded;
    next();
  })
}
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    const userCollection = client.db('sportsDB').collection('users');
    const classCollection = client.db('sportsDB').collection('classes');
    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
      res.send({ token })
    })
    //verify Admin or not
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      if (user?.role !== 'admin') {
        return res.status(403).send({ error: true, message: 'forbidden' })
      }
      next();
    }
    const verifyInstructor = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      if (user?.role !== 'instructor') {
        return res.status(403).send({ error: true, message: 'forbidden' })
      }
      next();
    }
    //Users related API
    app.get('/users', verifyJWT,async (req, res) => {
      let query = {};
      if(req.query.instructors){
        console.log(req.query.instructors);
         query = {role:req.query.instructors};
      }
      const result = await userCollection.find(query).toArray();
      res.send(result);
    })
    app.delete('/users/:id', verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;

      const query = { _id: new ObjectId(id) };
      const result = await userCollection.deleteOne(query);
      res.send(result);
    })
    app.get('/users/admin/:email', verifyJWT, async (req, res) => {
      const email = req.params.email;
      if (req.decoded.email != email) {
        return res.send({ admin: false })
      }
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const result = { admin: user?.role === 'admin' }
      res.send(result);
    })
    app.get('/users/instructor/:email', verifyJWT, async (req, res) => {
      const email = req.params.email;
      if (req.decoded.email !== email) {
        return res.send({ instructor: false })
      }
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const result = { instructor: user?.role === 'instructor' }
      res.send(result);
    })
    app.post('/users', async (req, res) => {
      const newUser = req.body;
      const query = { email: newUser.email };
      const existUser = await userCollection.findOne(query);
      if (existUser) {
        return res.send({ message: 'user already added' });
      }

      newUser.role = 'student'


      const result = await userCollection.insertOne(newUser);
      res.send(result);
    })
    app.patch('/users/admin/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          role: 'admin'
        }
      }
      const result = await userCollection.updateOne(filter, updatedDoc);
      res.send(result);
    })
    app.patch('/users/instructor/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          role: 'instructor'
        }
      }
      const result = await userCollection.updateOne(filter, updatedDoc);
      res.send(result);
    })
    //Class related API
    app.get('/classes', verifyJWT, async (req, res) => {
      const email = req.query.email;
      let query = {}
      if (email) {
        const checkUser = await userCollection.findOne({ email: email });
        if(checkUser){
             query = {instructorEmail: email}
        }
      }
      const result = await classCollection.find(query).toArray();
      res.send(result);
    })
    app.get('/classes/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await classCollection.findOne(query);
      res.send(result);
    })
    app.patch('/classes/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedClass = req.body;
      const updatedDoc = {
        $set: {
          name: updatedClass.name,
          price: updatedClass.price,
          seats: updatedClass.seats
        }
      }
      const result = await classCollection.updateOne(filter, updatedDoc);
      res.send(result);

    })
    app.patch('/classes/approve/:id',verifyJWT,verifyAdmin, async (req, res) => {
      const id = req.params.id;
     
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          status: 'approved'
        }
      }
      const result = await classCollection.updateOne(filter, updatedDoc);
      res.send(result);
    })
    app.patch('/classes/disapprove/:id',verifyJWT,verifyAdmin, async (req, res) => {
      const id = req.params.id;
      
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          status: 'denied'
        }
      }
      const result = await classCollection.updateOne(filter, updatedDoc);
      res.send(result);
    })
    app.post('/classes', verifyJWT, verifyInstructor, async (req, res) => {
      const newClass = req.body;
      newClass.status = 'pending';
      newClass.totalEnrolled = parseFloat(0);
      const result = await classCollection.insertOne(newClass);
      res.send(result);
    })
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Sports Elevate Server running');
})
app.listen(port, () => {
  console.log('Sports server running on port:', port);
})