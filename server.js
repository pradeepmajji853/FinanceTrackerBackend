require('dotenv').config(); // This must be the first line!

const express = require("express");
const bodyParser = require("body-parser");
const bcrypt = require("bcrypt");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const mongoose = require('mongoose');
const app = express();
const saltRounds = 10;
const secretKey = process.env.JWT_SECRET || 'Pradeep@00';
const moment = require('moment');

// Use environment variables for configuration
const port = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;

// Add this for debugging
console.log('MongoDB URI:', MONGODB_URI);

// Connect to MongoDB Atlas with additional options
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  dbName: 'financetracker' // specify the database name explicitly
})
.then(() => console.log('Connected to MongoDB Atlas'))
.catch(err => {
  console.error('MongoDB connection error:', err);
  process.exit(1); // Exit the process if unable to connect to database
});

// Add error handling for MongoDB connection
mongoose.connection.on('error', err => {
  console.error('MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('MongoDB disconnected');
});

// Define MongoDB Schemas
const userSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true }
});

const transactionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  amount: { type: Number, required: true },
  description: String,
  category: String,
  date: Date,
  type: { type: String, enum: ['credit', 'debit'] }
});

const savingsWalletSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  type: { type: String, enum: ['credit', 'debit'] },
  amount: Number,
  date: Date
});

const budgetSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  budgetName: String,
  amount: Number,
  currency: String,
  category: String,
  recurrence: String,
  startDate: Date,
  endDate: Date
});

// Create models
const User = mongoose.model('User', userSchema);
const Transaction = mongoose.model('Transaction', transactionSchema);
const SavingsWallet = mongoose.model('SavingsWallet', savingsWalletSchema);
const Budget = mongoose.model('Budget', budgetSchema);

app.use(bodyParser.json());
app.use(cors());

app.post("/register", async (req, res) => {
  try {
    const { firstName, lastName, email, password } = req.body;

    if (!firstName || !lastName || !email || !password) {
      return res.status(400).send("All fields are required");
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).send("Email already registered");
    }

    const hashedPassword = await bcrypt.hash(password, saltRounds);
    const user = new User({
      firstName,
      lastName,
      email,
      password: hashedPassword
    });

    await user.save();
    const token = jwt.sign({ userId: user._id }, secretKey, { expiresIn: '1h' });
    res.json({ message: "Registration successful", token, user: {
      id: user._id,
      firstName,
      lastName,
      email
    }});
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).send("An error occurred during registration");
  }
});

app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).send("Email and password are required");
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).send("Invalid email or password");
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).send("Invalid email or password");
    }

    const token = jwt.sign({ userId: user._id }, secretKey, { expiresIn: '1h' });
    res.json({ token });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).send("An error occurred during login");
  }
});

app.get('/users/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    const user = await User.findById(userId).select('-password');
    if (!user) {
      return res.status(404).send("User not found");
    }
    res.json(user);
  } catch (error) {
    console.error("Error fetching user data:", error);
    res.status(500).send("An error occurred while fetching user data");
  }
});

app.post('/savingswallet', async (req, res) => {
  try {
    const { userId, type, amount, date } = req.body;
    const wallet = new SavingsWallet({ userId, type, amount, date });
    await wallet.save();
    res.status(201).send('Transaction added to database');
  } catch (error) {
    console.error("Error adding transaction:", error);
    res.status(500).send("An error occurred while adding transaction");
  }
});

app.get('/savingswallet/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    const transactions = await SavingsWallet.find({ userId });
    res.json(transactions);
  } catch (error) {
    console.error("Error fetching transactions:", error);
    res.status(500).send("An error occurred while fetching transactions");
  }
});

app.post('/transactions', async (req, res) => {
  try {
    const { userId, amount, description, category, date, type } = req.body;
    if (!userId || !amount || !description || !category || !date || !type) {
      return res.status(400).send("All fields are required");
    }
    
    const transaction = new Transaction({
      userId,
      amount,
      description,
      category,
      date,
      type
    });
    await transaction.save();
    res.status(201).send('Transaction added successfully');
  } catch (error) {
    console.error("Error adding transaction:", error);
    res.status(500).send("An error occurred while adding transaction");
  }
});

app.get('/transactions', async (req, res) => {
  try {
    const userId = req.query.userId;
    if (!userId) {
      return res.status(400).send("User ID is required");
    }
    const transactions = await Transaction.find({ userId });
    res.json(transactions);
  } catch (error) {
    console.error("Error fetching transactions:", error);
    res.status(500).send("An error occurred while fetching transactions");
  }
});

app.get('/transactions/balance', async (req, res) => {
  try {
    const userId = req.query.userId;
    const transactions = await Transaction.find({ userId });
    
    const balance = transactions.reduce((acc, trans) => {
      return acc + (trans.type === 'credit' ? trans.amount : -trans.amount);
    }, 0);
    
    res.json({ balance });
  } catch (error) {
    console.error("Error fetching balance:", error);
    res.status(500).send("An error occurred while fetching balance");
  }
});

app.post('/BankAccountdashboard', (req, res) => {
  const { userId, transactions } = req.body;

  if (!userId || !transactions || !Array.isArray(transactions)) {
    return res.status(400).send("Invalid input data");
  }

  for (const transaction of transactions) {
    const { date, amount, description, category, type } = transaction;
    if (!date || !amount || !description || !category || !type) {
      return res.status(400).send("Transaction data is incomplete");
    }
  }

  const query = 'INSERT INTO BAtransactions (user_id, date, amount, description, category, type) VALUES ?';
  const values = transactions.map(t => [
    userId,
    moment(t.date).format('YYYY-MM-DD'), 
    t.amount,
    t.description,
    t.category,
    t.type
  ]);

  console.log("Inserting values:", values);

  db.query(query, [values], (err) => {
    if (err) {
      console.error("Error inserting transactions:", err);
      return res.status(500).send("An error occurred while inserting transactions");
    }
    res.send("Transactions inserted successfully");
  });
});

app.get('/BankAccountdashboard', (req, res) => {
  const userId = req.query.userId;

  if (!userId) {
    return res.status(400).send("User ID is required");
  }

  const query = 'SELECT * FROM BAtransactions WHERE user_id = ?';
  db.query(query, [userId], (err, results) => {
    if (err) {
      console.error("Error fetching transactions:", err);
      return res.status(500).send("An error occurred while fetching transactions");
    }
    res.json(results);
  });
});

app.post('/budgets', async (req, res) => {
  try {
    const budget = new Budget(req.body);
    await budget.save();
    res.status(201).json(budget);
  } catch (error) {
    console.error('Error adding budget:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/budgets/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const budgets = await Budget.find({ userId });
    res.status(200).json(budgets);
  } catch (error) {
    console.error('Error fetching budgets:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/budgets/:userId/details', async (req, res) => {
  try {
    const userId = req.params.userId;
    const budgets = await Budget.find({ userId });
    const transactions = await Transaction.find({ 
      userId, 
      type: 'debit' 
    });

    const spentByCategory = transactions.reduce((acc, trans) => {
      acc[trans.category] = (acc[trans.category] || 0) + trans.amount;
      return acc;
    }, {});

    const budgetDetails = budgets.map(budget => ({
      ...budget.toObject(),
      spentAmount: spentByCategory[budget.category] || 0,
      remainingAmount: budget.amount - (spentByCategory[budget.category] || 0)
    }));

    res.status(200).json(budgetDetails);
  } catch (error) {
    console.error('Error fetching budget details:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/transactions', async (req, res) => {
  const { userId } = req.query;
  if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
  }

  try {
      const [rows] = await db.query(
       ` SELECT 
                t.id AS transaction_id,
                t.amount AS transaction_amount,
                t.description AS transaction_description,
                t.category AS transaction_category,
                t.date AS transaction_date,
                t.type AS transaction_type,
                b.id AS batransaction_id,
                b.amount AS batransaction_amount,
                b.description AS batransaction_description,
                b.category AS batransaction_category,
                b.date AS batransaction_date,
                b.type AS batransaction_type
            FROM 
                transactions t
            LEFT JOIN 
                batransactions b
            ON 
                t.user_id = b.user_id
            WHERE 
                t.user_id = ?;
      `);
      res.json(rows);
  } catch (err) {
      res.status(500).json({ error: 'Database error' });
  }
});

app.get('/balance-over-time', async (req, res) => {
  const { userId } = req.query;
  if (!userId) {
    return res.status(400).json({ error: 'User ID is required' });
  }

  try {
    const [rows] = await db.promise().query(`
      SELECT
        DATE(date) AS date,
        SUM(CASE WHEN type = 'credit' THEN amount ELSE -amount END) AS balance
      FROM transactions
      WHERE user_id = ?
      GROUP BY DATE(date)
      ORDER BY DATE(date);
    `, [userId]);

    res.json(rows);
  } catch (err) {
    console.error("Error fetching balance over time:", err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/income-expenses', async (req, res) => {
  const { userId, period, date } = req.query;
  if (!userId || !period || !date) {
    return res.status(400).json({ error: 'User ID, period, and date are required' });
  }

  let startDate;
  let endDate;

  switch (period) {
    case 'day':
      startDate = moment(date).startOf('day').format('YYYY-MM-DD');
      endDate = moment(date).endOf('day').format('YYYY-MM-DD');
      break;
    case 'week':
      startDate = moment(date).startOf('week').format('YYYY-MM-DD');
      endDate = moment(date).endOf('week').format('YYYY-MM-DD');
      break;
    case 'month':
      startDate = moment(date).startOf('month').format('YYYY-MM-DD');
      endDate = moment(date).endOf('month').format('YYYY-MM-DD');
      break;
    default:
      return res.status(400).json({ error: 'Invalid period' });
  }

  try {
    const [rows] = await db.query(`
      SELECT 
        DATE(date) as date,
        SUM(CASE WHEN type = 'credit' THEN amount ELSE 0 END) as income,
        SUM(CASE WHEN type = 'debit' THEN amount ELSE 0 END) as expenses
      FROM transactions
      WHERE user_id = ? AND date BETWEEN ? AND ?
      GROUP BY DATE(date)
      ORDER BY DATE(date);
    `, [userId, startDate, endDate]);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Enable trust proxy if deploying behind a proxy
app.set('trust proxy', 1);

// Add security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
