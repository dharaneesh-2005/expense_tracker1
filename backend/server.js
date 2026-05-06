import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import Groq from 'groq-sdk';
import multer from 'multer';
import fs from 'fs';
import pool, { initDB } from './db.js';

const app = express();
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const upload = multer({ dest: 'uploads/' });

app.use(cors());
app.use(express.json());

await initDB();

const SYSTEM_PROMPT = `You are an expert financial advisor analyzing expense data. Your responsibilities:

1. Analyze categorized expenses and identify:
   - Highest spending category
   - Spending trends and patterns
   - Unusual or excessive transactions
   - Daily/weekly/monthly totals

2. Generate actionable recommendations:
   - Suggest specific spending caps for high-expense categories
   - Identify unnecessary spending patterns
   - Provide day-wise detailed savings plans
   - Highlight areas where user can cut costs

3. Communication style:
   - Be direct and specific with numbers
   - Provide practical, implementable advice
   - Use data-driven insights from the expense history
   - Format recommendations as clear action items

Always base your analysis on the actual expense data provided and give personalized advice.`;

const OCR_PROMPT = `Extract expense information from this receipt/bill image. Return ONLY a valid JSON object with this exact structure:

{
  "amount": <number>,
  "category": "<standardized_category>",
  "date": "<YYYY-MM-DD>"
}

Standardize categories to one of these ONLY:
- Food (restaurants, groceries, food delivery)
- Transport (fuel, taxi, bus, train, auto)
- Shopping (clothes, electronics, general shopping)
- Entertainment (movies, games, subscriptions)
- Healthcare (medicine, doctor, hospital)
- Bills (electricity, water, internet, phone)
- Education (books, courses, fees)
- Other (anything else)

Rules:
- Extract the total amount as a number
- Map any category to the closest standard category above
- If date is not visible, use today's date
- Return ONLY the JSON object, no other text`;

const CATEGORY_MAPPING = {
  'food': 'Food',
  'restaurant': 'Food',
  'grocery': 'Food',
  'dining': 'Food',
  'cafe': 'Food',
  'transport': 'Transport',
  'fuel': 'Transport',
  'petrol': 'Transport',
  'taxi': 'Transport',
  'uber': 'Transport',
  'ola': 'Transport',
  'shopping': 'Shopping',
  'clothes': 'Shopping',
  'electronics': 'Shopping',
  'entertainment': 'Entertainment',
  'movie': 'Entertainment',
  'netflix': 'Entertainment',
  'healthcare': 'Healthcare',
  'medicine': 'Healthcare',
  'doctor': 'Healthcare',
  'bills': 'Bills',
  'electricity': 'Bills',
  'internet': 'Bills',
  'education': 'Education',
  'books': 'Education'
};

app.post('/expenses', async (req, res) => {
  const { amount, category, date } = req.body;
  const result = await pool.query(
    'INSERT INTO expenses (amount, category, date) VALUES ($1, $2, $3) RETURNING *',
    [amount, category, date || new Date()]
  );
  res.json(result.rows[0]);
});

app.get('/expenses', async (req, res) => {
  const result = await pool.query('SELECT * FROM expenses ORDER BY date DESC');
  res.json(result.rows);
});

app.get('/reports/:period', async (req, res) => {
  const { period } = req.params;
  const intervals = { daily: '1 day', weekly: '7 days', monthly: '30 days' };
  
  const result = await pool.query(`
    SELECT category, SUM(amount) as total, COUNT(*) as count
    FROM expenses
    WHERE date >= CURRENT_DATE - INTERVAL '${intervals[period]}'
    GROUP BY category
    ORDER BY total DESC
  `);
  
  const total = await pool.query(`
    SELECT SUM(amount) as total FROM expenses
    WHERE date >= CURRENT_DATE - INTERVAL '${intervals[period]}'
  `);
  
  res.json({ breakdown: result.rows, total: total.rows[0].total || 0 });
});

app.post('/ocr', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'No image uploaded'
      });
    }

    const imageBuffer =
      fs.readFileSync(req.file.path);

    const base64Image =
      imageBuffer.toString('base64');

    const mimeType =
      req.file.mimetype;

    const completion =
      await groq.chat.completions.create({
        model:
          'meta-llama/llama-4-scout-17b-16e-instruct',

        temperature: 0.1,

        max_tokens: 500,

        response_format: {
          type: 'json_object'
        },

        messages: [
          {
            role: 'system',
            content: `
You are an OCR financial extraction system.

Extract expense details from receipt images.

Return ONLY valid JSON.

Allowed categories:
- Food
- Transport
- Shopping
- Entertainment
- Healthcare
- Bills
- Education
- Other

Category normalization examples:
- Swiggy, Zomato, Restaurant → Food
- Uber, Ola, Petrol → Transport
- Netflix, Spotify → Entertainment
- Amazon, Flipkart → Shopping
- Hospital, Pharmacy → Healthcare

Rules:
- amount must be numeric
- date format must be YYYY-MM-DD
- category must match ONLY allowed categories
- if uncertain use "Other"

Return format:
{
  "amount": 0,
  "category": "",
  "date": ""
}
`
          },

          {
            role: 'user',

            content: [
              {
                type: 'text',

                text:
                  'Extract expense details from this receipt image'
              },

              {
                type: 'image_url',

                image_url: {
                  url:
                    `data:${mimeType};base64,${base64Image}`
                }
              }
            ]
          }
        ]
      });

    const raw =
      completion.choices[0]
        .message.content;

    console.log('Scout Output:', raw);

    let parsed;

    try {
      parsed = JSON.parse(raw);
    } catch {
      return res.status(500).json({
        error:
          'Scout returned invalid JSON',
        raw
      });
    }

    // Handle array response - insert all items
    if (!Array.isArray(parsed)) {
      parsed = [parsed];
    }

    if (parsed.length === 0) {
      return res.status(400).json({
        error: 'No expenses found in image'
      });
    }

    const inserted = [];
    for (const expense of parsed) {
      const amount = parseFloat(expense.amount);
      const category = expense.category || 'Other';
      const dateStr = expense.date || new Date().toISOString().split('T')[0];

      if (!amount || isNaN(amount)) {
        continue;
      }

      const result = await pool.query(
        'INSERT INTO expenses (amount, category, date) VALUES ($1, $2, $3) RETURNING *',
        [amount, category, dateStr]
      );
      inserted.push(result.rows[0]);
    }

    if (req.file?.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch {}
    }

    res.json({
      success: true,
      count: inserted.length,
      saved: inserted
    });

  } catch (error) {
    console.log(error);

    if (req.file?.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch {}
    }

    res.status(500).json({
      error:
        'Failed to extract data from image',
      details: error.message
    });
  }
});

app.post('/chat', async (req, res) => {
  const { message } = req.body;
  
  const expenses = await pool.query('SELECT * FROM expenses ORDER BY date DESC LIMIT 100');
  const expenseContext = JSON.stringify(expenses.rows);
  
  const completion = await groq.chat.completions.create({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'system', content: `Current expense data: ${expenseContext}` },
      { role: 'user', content: message }
    ],
    model: 'llama-3.3-70b-versatile',
    temperature: 0.7,
    max_tokens: 1024
  });
  
  res.json({ response: completion.choices[0].message.content });
});

app.listen(process.env.PORT || 3001, () => {
  console.log(`Server running on port ${process.env.PORT || 3001}`);
});
