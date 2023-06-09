const express = require('express')
const cors    = require('cors');
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion } = require('mongodb');
require('dotenv').config();
const app     = express();
const port    = process.env.PORT || 5000;
app.use(cors());
app.use(express.json())


const uri =`mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.xpliwro.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const verifyJWT=(req,res,next)=>{
  const authorization = req.headers.authorization;
  if(!authorization){
    return res.status(401).send({error:true,message:'unauthorized access'});
  }
  //bearer token
  const token = authorization.split(' ')[1];
  jwt.verify(token,process.env.ACCESS_TOKEN_SECRET,(err,decoded)=>{
    if(err){
      return res.status(401).send({error:true,message:'unauthorized access'});
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
    app.post('/jwt',async(req,res)=>{
      const user = req.body;
      const token = jwt.sign(user,process.env.ACCESS_TOKEN_SECRET,{expiresIn:'1h'});
      res.send({token})
    })
    //verify Admin or not
    const verifyAdmin =async(req,res,next)=>{
      const email= req.decoded.email;
      const query = {email:email};
      const user = await userCollection.findOne(query);
      if(user?.role !== 'admin'){
        return res.status(403).send({error:true,message:'forbidden'})
      }
      next();
    }
    const verifyInstructor =async(req,res,next)=>{
      const email= req.decoded.email;
      const query = {email:email};
      const user = await userCollection.findOne(query);
      if(user?.role !== 'instructor'){
        return res.status(403).send({error:true,message:'forbidden'})
      }
      next();
    }
    //Users related API
    app.get('/users',verifyJWT,async(req,res)=>{
       const result = await userCollection.find().toArray();
       res.send(result);
    })
    app.post('/users',async(req,res)=>{
      const newUser = req.body;
      const query = {email:newUser.email};
      const existUser = await userCollection.findOne(query);
      if(existUser){
        return res.send({message:'user already added'});
      }

      newUser.role = 'student'
      console.log(newUser);

      const result = await userCollection.insertOne(newUser);
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

app.get('/',(req,res)=>{
    res.send('Sports Elevate Server running');
})
app.listen(port,()=>{
    console.log('Sports server running on port:',port);
})