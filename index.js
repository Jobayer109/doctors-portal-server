const express = require("express");
const cors = require("cors");
const app = express();
const port = process.env.PORT || 5000;
const jwt = require("jsonwebtoken");
const stripe = require("stripe")(
  "sk_test_51M6ARNB16mRcRBwtghZDWVXEnZ7buzkqGsONphwXADjLW0cCmhFuzf75i8DGnQK8UFkozJEwg6VsZAGGhI837rQT00bJX0iEf6"
);
require("dotenv").config();

app.use(cors());
app.use(express.json());

//Mongodb connection
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.gbyn4kb.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

const verifyJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send("unauthorized access");
  }
  const token = authHeader.split(" ")[1];
  jwt.verify(token, process.env.SECRET_JWT, function (error, decoded) {
    if (error) {
      return res.status(403).send("Forbidden access");
    }
    req.decoded = decoded;
    next();
  });
};

const dbConnect = async () => {
  try {
    const appointmentCollection = client.db("doctorsPortal").collection("appointmentOptions");
    const bookingCollection = client.db("doctorsPortal").collection("bookings");
    const userCollection = client.db("doctorsPortal").collection("users");
    const doctorsCollection = client.db("doctorsPortal").collection("doctors");
    const paymentCollection = client.db("doctorsPortal").collection("payments");

    app.get("/appointments", async (req, res) => {
      const date = req.query.date;

      const query = {};
      const options = await appointmentCollection.find(query).toArray();
      // console.log(options);
      const queryByDate = { appointmentDate: date };
      const alreadyBooked = await bookingCollection.find(queryByDate).toArray();

      options.forEach((option) => {
        const bookedOptions = alreadyBooked.filter((book) => book.treatment === option.name);
        const bookedSlots = bookedOptions.map((book) => book.slot);
        const availableSlots = option.slots.filter((slot) => !bookedSlots.includes(slot));
        option.slots = availableSlots;
      });
      res.send(options);
    });

    //
    app.get("/appointmentSpecialty", async (req, res) => {
      const result = await appointmentCollection.find({}).project({ name: 1 }).toArray();
      res.send(result);
    });

    // Booking data  from  client side
    app.post("/bookings", async (req, res) => {
      const book = req.body;
      const query = {
        appointmentDate: book.appointmentDate,
        email: book.email,
        treatment: book.treatment,
      };

      const alreadyBooked = await bookingCollection.find(query).toArray();

      if (alreadyBooked.length) {
        const message = `You have already booking on ${book.appointmentDate}`;
        return res.send({ acknowledged: false, message });
      }

      const bookings = await bookingCollection.insertOne(book);
      res.send(bookings);
    });

    // Bookings data by _id
    app.get("/bookings/:id", async (req, res) => {
      const query = { _id: ObjectId(req.params.id) };
      const result = await bookingCollection.findOne(query);
      res.send(result);
    });

    // Create payment intent
    app.post("/create-payment-intent", async (req, res) => {
      const booking = req.body;
      const price = booking.price;
      const amount = price * 100;

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    app.post("/payments", async (req, res) => {
      const payment = req.body;
      const result = await paymentCollection.insertOne(payment);
      const id = payment.bookingId;
      const filter = { _id: ObjectId(id) };
      const updatedDoc = {
        $set: {
          paid: true,
          transactionId: payment.transactionId,
        },
      };
      const updatedResult = await bookingCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    // My appointments API and JWT verify function called
    app.get("/myAppointments", verifyJWT, async (req, res) => {
      let query = {};

      const decodedEmail = req.decoded.email;
      if (req.query.email !== decodedEmail) {
        return res.status(403).send("Forbidden access");
      }

      if (req.query.email) {
        query = { email: req.query.email };
      }
      const myAppoints = await bookingCollection.find(query).toArray();
      res.send(myAppoints);
    });

    //Create user by registration
    app.post("/users", async (req, res) => {
      const user = req.body;
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    // JWT api create
    app.get("/jwt", async (req, res) => {
      const query = { email: req.query.email };
      const user = await userCollection.findOne(query);
      if (user) {
        const token = jwt.sign(user, process.env.SECRET_JWT, { expiresIn: "1d" });
        res.send({ token });
      } else {
        res.status(403).send("Forbidden access");
      }
    });

    // admin verification
    app.get("/users/admin/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const user = await userCollection.findOne(query);
      res.send({ isAdmin: user?.role === "admin" });
    });

    // Display all users in Browser.
    app.get("/users", async (req, res) => {
      const query = {};
      const result = await userCollection.find(query).toArray();
      res.send(result);
    });

    // Set user as a admin from users
    app.put("/users/admin/:id", async (req, res) => {
      const filter = { _id: ObjectId(req.params.id) };
      const updateDoc = {
        $set: {
          role: "admin",
        },
      };
      const options = { upsert: true };
      const result = await userCollection.updateOne(filter, updateDoc, options);
      console.log(result);
      res.send(result);
    });

    // Doctors info store in  database
    app.post("/doctors", async (req, res) => {
      const doctor = req.body;
      const query = {
        email: doctor.email,
      };
      const alreadyAdded = await doctorsCollection.find(query).toArray();
      if (alreadyAdded.length) {
        const message = `You have already added Dr. ${doctor.name}`;
        return res.send({ message });
      } else {
        const result = await doctorsCollection.insertOne(doctor);
        res.send(result);
      }
    });

    // Display doctors info  to UI
    app.get("/doctors", async (req, res) => {
      const doctors = await doctorsCollection.find({}).toArray();
      res.send(doctors);
    });

    //Delete action of doctors
    app.delete("/doctors/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const result = await doctorsCollection.deleteOne(query);
      res.send(result);
    });

    // Temporary API
    // app.get("/addPrice", async (req, res) => {
    //   const query = {};
    //   const options = { upsert: true };
    //   const updateDoc = {
    //     $set: {
    //       price: 99,
    //     },
    //   };
    //   const result = await appointmentCollection.updateMany(query, updateDoc, options);
    //   res.send(result);
    // });
  } finally {
  }
};
dbConnect().catch((error) => console.log(error.code));

app.get("/", (req, res) => {
  res.send("Doctors portal server is running");
});

app.listen(port, () => {
  console.log(`Doctors portal is listening on port: ${port}`);
});
