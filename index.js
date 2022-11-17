const express = require("express");
const cors = require("cors");
const app = express();
const port = process.env.PORT || 5000;
require("dotenv").config();

app.use(cors());
app.use(express.json());

//Mongodb connection
const { MongoClient, ServerApiVersion } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.gbyn4kb.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

const dbConnect = async () => {
  try {
    const appointmentCollection = client.db("doctorsPortal").collection("appointmentOptions");
    const bookingCollection = client.db("doctorsPortal").collection("bookings");

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

    app.get("/myAppointments", async (req, res) => {
      let query = {};

      if (req.query.email) {
        query = { email: req.query.email };
      }
      const myAppoints = await bookingCollection.find(query).toArray();
      res.send(myAppoints);
    });
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
