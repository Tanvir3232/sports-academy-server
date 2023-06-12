const express = require('express')
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();
const stripe = require('stripe')(process.env.PAYMENT_SECRET_KEY)
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
    const paymentCollection = client.db('sportsDB').collection('payments');
    const classCollection = client.db('sportsDB').collection('classes');
    const selectedclassCollection = client.db('sportsDB').collection('selectedclasses');
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
    app.get('/users', async (req, res) => {
      let query = {};
      if (req.query.instructors) {
        console.log(req.query.instructors);
        query = { role: req.query.instructors };
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
    app.get('/classes', async (req, res) => {
      const email = req.query.email;

      let query = {}
      if (email) {
        const checkUser = await userCollection.findOne({ email: email });
        if (checkUser) {
          query = { instructorEmail: email }
        }

      }
      if (req.query.status) {
        query = { status: req.query.status }
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
    app.patch('/classes/approve/:id', verifyJWT, verifyAdmin, async (req, res) => {
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
    app.patch('/classes/disapprove/:id', verifyJWT, verifyAdmin, async (req, res) => {
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
    
    app.patch('/classes/feedback/:classId', async (req, res) => {
      const classId = req.params.classId;
      const message = req.body.message;
    
      const filter = { _id: new ObjectId(classId) };
      const updatedDoc = {
        $set: {
          feedback: message
        }
      };
    
      const result = await classCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });
    
    
    

    app.post('/classes', verifyJWT, verifyInstructor, async (req, res) => {
      const newClass = req.body;
      newClass.status = 'pending';
      newClass.totalEnrolled = parseFloat(0);
      const result = await classCollection.insertOne(newClass);
      res.send(result);
    })


    //Selected Class Related API
    app.get('/selectedclasses', async (req, res) => {
      let query = {};
      if (req.query.email) {

        query = { studentEmail: req.query.email };
      }
      const result = await selectedclassCollection.find(query).toArray();
      res.send(result);
    })
    app.get('/selectedclasses/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await selectedclassCollection.findOne(query);
      res.send(result)
    })
    app.post('/selectedclasses', async (req, res) => {
      const newClass = req.body;

      const result = await selectedclassCollection.insertOne(newClass);
      res.send(result);
    })
    app.delete('/selectedclasses/:id', async (req, res) => {
      const id = req.params.id;

      const query = { _id: new ObjectId(id) }
      const result = await selectedclassCollection.deleteOne(query);
      res.send(result);
    })

    // Payment related api
    app.post('/create-payment-intent', verifyJWT, async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: ['card']
      });
      res.send({
        clientSecret: paymentIntent.client_secret
      })
    })
    //Payment related Api
    app.post('/payments', verifyJWT, async (req, res) => {
      const payment = req.body;
      const insertResult = await paymentCollection.insertOne(payment);

      const query = { _id: new ObjectId(payment.selectedClassId) };
      const deleteResult = await selectedclassCollection.deleteOne(query);

      const filter = { _id: new ObjectId(payment.classId) };
      const classDoc = await classCollection.findOne(filter);

      if (!classDoc) {
        res.status(404).send('Class not found');
        return;
      }

      const seats = classDoc.seats;
      const totalEnrolled = classDoc.totalEnrolled;

      if (seats <= 0) {
        res.status(400).send('No available seats');
        return;
      }

      const updatedSeats = seats - 1;
      const updatedTotalEnrolled = totalEnrolled + 1;

      const updatedDoc = {
        $set: {
          seats: updatedSeats,
          totalEnrolled: updatedTotalEnrolled
        }
      };

      const updateResult = await classCollection.updateOne(filter, updatedDoc);

      res.send({ insertResult, deleteResult, updateResult });
    });
    //payment history for students
    app.get('/payments',async(req,res)=>{
      const email = req.query.email;
      console.log(email);
      const query = {email:email};
      const result = await paymentCollection.find(query).sort({ date: -1 }).toArray()
      res.send(result);
    })
    //Get all paid classes info Api
    app.get('/user/enrolledclasses', verifyJWT, async (req, res) => {
      const userEmail = req.query.email;
      const matchingPayments = await paymentCollection.find({ email: userEmail }).toArray();
      
      const classIds = matchingPayments.map(payment => payment.classId);
     

      const matchingClasses = await classCollection.find({_id:{$in: classIds.map(id=>new ObjectId(id))}}).toArray();
     
      res.send(matchingClasses);
    });
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