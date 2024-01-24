const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const app = express();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const port = process.env.PORT || 5000;

// middlewares
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
      "https://darling-sundae-71ebec.netlify.app",
      "https://65b098b12d2d443ef3ff2db7--darling-sundae-71ebec.netlify.app",
    ],
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

const jwtSecretKey = process.env.ACCESS_TOKEN_SECRET;

const verifyToken = (req, res, next) => {
  const token = req.cookies.token;

  if (!token) {
    return res.sendStatus(401);
  }

  jwt.verify(token, jwtSecretKey, (err, user) => {
    if (err) {
      return res.sendStatus(403);
    }
    req.user = user;
    next();
  });
};

const checkUserRole = (role) => {
  return (req, res, next) => {
    if (req.user && req.user.role === role) {
      next();
    } else {
      res.sendStatus(403);
    }
  };
};

// database
// const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ddl1jzo.mongodb.net/?retryWrites=true&w=majority`;
const uri = `mongodb://localhost:27017`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const database = client.db("houseHunter");

    // collection
    const userCollection = database.collection("users");
    const houseCollection = database.collection("houses");

    // endpoints
    // api for user registration
    app.post("/api/v1/user/register", async (req, res) => {
      const { fullName, role, phoneNumber, email, password } = req.body;

      if (!fullName || !role || !phoneNumber || !email || !password) {
        return res.status(400).json({ message: "All fields are mandatory" });
      }

      const newUser = {
        fullName,
        role,
        phoneNumber,
        email,
        password,
      };

      try {
        const result = await userCollection.insertOne(newUser);

        if (result.insertedId) {
          res.status(201).json({
            message: "User registered successfully",
            data: newUser,
          });
        } else {
          res.status(500).json({ message: "Internal server error" });
        }
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal server error" });
      }
    });

    // authenticated user
    app.get("/api/v1/authenticated-user", verifyToken, (req, res) => {
      res.json({ user: req.user });
    });

    // api for user login
    app.post("/api/v1/user/login", async (req, res) => {
      const { email, password } = req.body;

      if (!email || !password) {
        return res
          .status(400)
          .json({ message: "Email and password are required" });
      }

      try {
        const user = await userCollection.findOne({ email });

        if (!user) {
          return res.status(404).json({ message: "User not found" });
        }

        if (user.password !== password) {
          return res.status(401).json({ message: "Invalid password" });
        }

        const token = jwt.sign(
          { userId: user._id, email: user.email, role: user.role },
          jwtSecretKey,
          { expiresIn: "1h" }
        );

        res.status(200).json({
          message: "Login successful",
          data: {
            userId: user._id,
            fullName: user.fullName,
            email: user.email,
            role: user.role,
            token,
          },
        });
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal server error" });
      }
    });

    // API for adding houses
    app.post(
      "/api/v1/create-house",
      checkUserRole("house owner"),
      async (req, res) => {
        const house = req.body;        
        house.ownerId = req.user.userId;
        const result = await houseCollection.insertOne(house);
        res.send(result);
      }
    );

    // API for getting houses
    app.get("/api/v1/houses", async (req, res) => {
      const result = await houseCollection
        .find({ ownerId: req.user.userId })
        .toArray();
      res.send(result);
    });

    // API for updating house
    app.patch(
      "/api/v1/update-house/:id",
      checkUserRole("house owner"),
      async (req, res) => {
        const houseId = req.params.id;
        const filter = { _id: new ObjectId(houseId), ownerId: req.user.userId };
        const house = req.body;
        const updateDoc = {
          $set: {
            name: house.name,
            address: house.address,
            city: house.city,
            bedrooms: house.bedrooms,
            bathrooms: house.bathrooms,
            room_size: house.room_size,
            picture: house.picture,
            availability_date: house.availability_date,
            rent_per_month: house.rent_per_month,
            phone_number: house.phone_number,
            description: house.description,
          },
        };
        const result = await houseCollection.updateOne(filter, updateDoc);
        res.send(result);
      }
    );

    // API for deleting house
    app.delete(
      "/api/v1/delete-house/:id",
      checkUserRole("house owner"),
      async (req, res) => {
        const houseId = req.params.id;
        const query = { _id: new ObjectId(houseId), ownerId: req.user.userId };
        const result = await houseCollection.deleteOne(query);
        res.send(result);
      }
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Server is running");
});

app.listen(port, () => {
  console.log(`The server is running on port ${port}`);
});
