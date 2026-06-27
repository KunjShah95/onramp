import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import axios from 'axios'
import 'dotenv/config'

const app = express()
const PORT = process.env.PORT || 3000

// Service URLs
const SERVICES = {
  userService: process.env.USER_SERVICE_URL || 'http://localhost:3001',
  repoAnalysis: process.env.REPO_ANALYSIS_URL || 'http://localhost:3002',
  learningPath: process.env.LEARNING_PATH_URL || 'http://localhost:3003',
  aiTutor: process.env.AI_TUTOR_URL || 'http://localhost:3004',
  teamAnalytics: process.env.TEAM_ANALYTICS_URL || 'http://localhost:3005',
  notification: process.env.NOTIFICATION_URL || 'http://localhost:3006',
  knowledgeCompiler: process.env.KNOWLEDGE_COMPILER_URL || 'http://localhost:3007',
  waitlist: process.env.WAITLIST_URL || 'http://localhost:3008',
}

// Middleware
app.use(helmet())
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true,
}))
app.use(express.json())

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please try again later.' }
})
app.use('/api', limiter)

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'gateway', timestamp: new Date().toISOString() })
})

// Auth middleware (simplified)
const authMiddleware = async (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (token) {
    req.user = { id: 'demo-user' }
  }
  next()
}

// Proxy routes to user service
app.use('/api/v1/auth', authMiddleware, async (req, res) => {
  try {
    const response = await axios({
      method: req.method,
      url: `${SERVICES.userService}${req.originalUrl}`,
      data: req.body,
      headers: req.headers
    })
    res.status(response.status).json(response.data)
  } catch (err) {
    res.status(err.response?.status || 500).json(err.response?.data || { error: err.message })
  }
})

// Proxy routes to repository analysis
app.use('/api/v1/repos', async (req, res) => {
  try {
    const response = await axios({
      method: req.method,
      url: `${SERVICES.repoAnalysis}${req.originalUrl}`,
      data: req.body,
      headers: req.headers
    })
    res.status(response.status).json(response.data)
  } catch (err) {
    res.status(err.response?.status || 500).json(err.response?.data || { error: err.message })
  }
})

// Proxy routes to knowledge compiler (LLM Wiki)
app.use('/api/v1/analyze', async (req, res) => {
  try {
    const response = await axios({
      method: req.method,
      url: `${SERVICES.knowledgeCompiler}${req.originalUrl}`,
      data: req.body,
      headers: req.headers
    })
    res.status(response.status).json(response.data)
  } catch (err) {
    res.status(err.response?.status || 500).json(err.response?.data || { error: err.message })
  }
})

app.use('/api/v1/files', async (req, res) => {
  try {
    const response = await axios({
      url: `${SERVICES.knowledgeCompiler}${req.originalUrl}`,
      method: req.method,
      data: req.body,
      headers: req.headers
    })
    res.status(response.status).json(response.data)
  } catch (err) {
    res.status(err.response?.status || 500).json(err.response?.data || { error: err.message })
  }
})

app.use('/api/v1/analysis', async (req, res) => {
  try {
    const response = await axios({
      method: req.method,
      url: `${SERVICES.repoAnalysis}${req.originalUrl}`,
      data: req.body,
      headers: req.headers
    })
    res.status(response.status).json(response.data)
  } catch (err) {
    res.status(err.response?.status || 500).json(err.response?.data || { error: err.message })
  }
})

// Proxy routes to learning path
app.use('/api/v1/roadmaps', async (req, res) => {
  try {
    const response = await axios({
      method: req.method,
      url: `${SERVICES.learningPath}${req.originalUrl}`,
      data: req.body,
      headers: req.headers
    })
    res.status(response.status).json(response.data)
  } catch (err) {
    res.status(err.response?.status || 500).json(err.response?.data || { error: err.message })
  }
})

app.use('/api/v1/tasks', async (req, res) => {
  try {
    const response = await axios({
      method: req.method,
      url: `${SERVICES.learningPath}${req.originalUrl}`,
      data: req.body,
      headers: req.headers
    })
    res.status(response.status).json(response.data)
  } catch (err) {
    res.status(err.response?.status || 500).json(err.response?.data || { error: err.message })
  }
})

app.use('/api/v1/progress', async (req, res) => {
  try {
    const response = await axios({
      method: req.method,
      url: `${SERVICES.learningPath}${req.originalUrl}`,
      data: req.body,
      headers: req.headers
    })
    res.status(response.status).json(response.data)
  } catch (err) {
    res.status(err.response?.status || 500).json(err.response?.data || { error: err.message })
  }
})

// Proxy routes to AI tutor
app.use('/api/v1/tutor', async (req, res) => {
  try {
    const response = await axios({
      method: req.method,
      url: `${SERVICES.aiTutor}${req.originalUrl}`,
      data: req.body,
      headers: req.headers
    })
    res.status(response.status).json(response.data)
  } catch (err) {
    res.status(err.response?.status || 500).json(err.response?.data || { error: err.message })
  }
})

// Proxy routes to team analytics
app.use('/api/v1/team', async (req, res) => {
  try {
    const response = await axios({
      method: req.method,
      url: `${SERVICES.teamAnalytics}${req.originalUrl}`,
      data: req.body,
      headers: req.headers
    })
    res.status(response.status).json(response.data)
  } catch (err) {
    res.status(err.response?.status || 500).json(err.response?.data || { error: err.message })
  }
})

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack)
  res.status(500).json({ error: 'Internal server error' })
})

app.listen(PORT, () => {
  console.log(`[Gateway] Running on http://localhost:${PORT}`)
  console.log(`[Gateway] Routing to:`)
  console.log(`  - User Service: ${SERVICES.userService}`)
  console.log(`  - Repo Analysis: ${SERVICES.repoAnalysis}`)
  console.log(`  - Learning Path: ${SERVICES.learningPath}`)
  console.log(`  - AI Tutor: ${SERVICES.aiTutor}`)
  console.log(`  - Team Analytics: ${SERVICES.teamAnalytics}`)
  console.log(`  - Knowledge Compiler: ${SERVICES.knowledgeCompiler}`)
})

export default app