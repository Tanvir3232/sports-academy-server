const express = require('express')
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();
const stripe = require('stripe')(process.env.PAYMENT_SECRET_KEY)
const app = express();
const port = process.env.PORT || 5000;
const moment = require('moment');

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
    app.get('/classes/topclasses', async (req, res) => {
      console.log('hellow')
      const query = { status: 'approved' }
      const result = await classCollection.find(query).sort({ totalEnrolled: -1 }).limit(6).toArray();
      res.send(result);
    });
    app.get('/instructors/topinstructors', async (req, res) => {
      try {
        const pipeline = [
          {
            $lookup: {
              from: 'users',
              localField: 'instructorEmail',
              foreignField: 'email',
              as: 'instructor',
            },
          },
          {
            $unwind: '$instructor',
          },
          {
            $group: {
              _id: '$instructorEmail',
              instructorName: { $first: '$instructorName' },
              totalStudents: { $sum: '$totalEnrolled' },
              classes: {
                $push: {
                  name: '$name',
                  totalEnrolled: '$totalEnrolled',
                },
              },
              instructorImage: { $first: '$instructor.photo' },
            },
          },
          {
            $sort: { totalStudents: -1 },
          },
          {
            $limit: 6,
          },
        ];

        const result = await classCollection.aggregate(pipeline).toArray();
        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
      }
    });



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
    app.get('/payments', async (req, res) => {
      const email = req.query.email;
      console.log(email);
      const query = { email: email };
      const result = await paymentCollection.find(query).sort({ date: -1 }).toArray()
      res.send(result);
    })
    //Get all paid classes info Api
    app.get('/user/enrolledclasses', verifyJWT, async (req, res) => {
      const userEmail = req.query.email;
      const matchingPayments = await paymentCollection.find({ email: userEmail }).toArray();

      const classIds = matchingPayments.map(payment => payment.classId);


      const matchingClasses = await classCollection.find({ _id: { $in: classIds.map(id => new ObjectId(id)) } }).toArray();

      res.send(matchingClasses);
    });
    //Student dashboard related api 
    //get for Student stats cards
    app.get('/student-stats', async (req, res) => {
      try {
        const email = req.query.email;
        console.log(email);

        const enrolledClasses = await paymentCollection.countDocuments({ email: email });
        const selectedClasses = await selectedclassCollection.countDocuments({ studentEmail: email });
        const totalPayment = await paymentCollection.aggregate([
          {
            $match: { email: email }
          },
          {
            $group: {
              _id: null,
              totalPayment: { $sum: '$price' }
            }
          }
        ]).toArray();
        const totalPaymentValue = totalPayment.length > 0 ? totalPayment[0].totalPayment : 0;

        res.send({
          enrolledClasses,
          selectedClasses,
          totalPayment: totalPaymentValue
        });
      } catch (error) {
        res.status(500).send({ error: 'An error occurred while retrieving statistics.' });
      }
    });
    // payment-chart data
    app.get('/payment-chart', verifyJWT, async (req, res) => {
      try {
        const email = req.query.email;
        const paymentData = await paymentCollection.find({ email }).toArray();
    
        const sortedData = paymentData.sort((a, b) => {
          const dateA = moment(a.date, 'YYYY-MM-DD').toDate();
          const dateB = moment(b.date, 'YYYY-MM-DD').toDate();
          return dateA - dateB;
        });
    
        const chartData = sortedData.map((payment) => ({
          date: moment(payment.date).format('YYYY-MM-DD'),
          payment: payment.price,
        }));
    
        res.send(chartData);
      } catch (error) {
        res.status(500).send({ error: 'An error occurred while retrieving payment chart data.' });
      }
    });
    
    //Instructor dashboard related api 
    //get for Instructor stats cards
    app.get('/instructor-stats', verifyJWT, async (req, res) => {
      try {
        const email = req.query.email;
        console.log(email);
    
        const totalStudents = await classCollection.aggregate([
          {
            $match: { instructorEmail: email }
          },
          {
            $group: {
              _id: null,
              totalEnrolled: { $sum: '$totalEnrolled' }
            }
          }
        ]).toArray();
    
        const pendingClasses = await classCollection.countDocuments({
          instructorEmail: email,
          status: 'pending'
        });
    
        const totalApprovedClasses = await classCollection.countDocuments({
          instructorEmail: email,
          status: 'approved'
        });
    
        res.send({
          totalStudents: totalStudents[0]?.totalEnrolled || 0,
          pendingClasses,
          totalApprovedClasses
        });
      } catch (error) {
        res.status(500).send({ error: 'An error occurred while retrieving statistics.' });
      }
    });
    
    
    



    //Admin dashboard related api 
    //get for admin stats cards
    app.get('/admin-stats', verifyJWT, verifyAdmin, async (req, res) => {
      try {
        const users = await userCollection.estimatedDocumentCount();
        const approvedClasses = await classCollection.countDocuments({ status: 'approved' });
        const payments = await paymentCollection.countDocuments();
        const classes = await classCollection.estimatedDocumentCount();

        res.send({
          users,
          classes,
          approvedClasses,
          payments
        });
      } catch (error) {
        res.status(500).send({ error: 'An error occurred while retrieving statistics.' });
      }
    });
    //// user role distribution
    app.get('/user-role-distribution', async (req, res) => {
      try {
        const roleDistribution = await userCollection.aggregate([
          {
            $group: {
              _id: "$role",
              count: { $sum: 1 }
            }
          },
          {
            $project: {
              role: "$_id",
              count: 1,
              _id: 0
            }
          }
        ]).toArray();

        res.send(roleDistribution);
      } catch (error) {
        res.status(500).send({ error: 'An error occurred while retrieving role distribution.' });
      }
    });
    // monthly payments for barchart
    app.get('/monthly-payments', async (req, res) => {
      try {
        const payments = await paymentCollection.find().toArray();
        const monthlyTotals = {};

        payments.forEach((payment) => {
          const month = moment(payment.date).format('MMM');
          if (!monthlyTotals[month]) {
            monthlyTotals[month] = payment.price;
          } else {
            monthlyTotals[month] += payment.price;
          }
        });

        // Sort the monthly totals by month in ascending order
        const sortedMonthlyTotals = Object.entries(monthlyTotals)
          .sort((a, b) => moment().month(a[0]).diff(moment().month(b[0])))
          .map(([month, total]) => ({ month, total }));

        const chartData = sortedMonthlyTotals.map(({ month, total }) => ({
          month,
          total,
        }));

        res.json(chartData);
      } catch (error) {
        res.status(500).json({ error: 'An error occurred while retrieving payments.' });
      }
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