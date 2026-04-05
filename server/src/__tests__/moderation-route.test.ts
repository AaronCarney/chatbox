import { describe, it, expect, vi } from 'vitest'
import request from 'supertest'
import express from 'express'
import { moderationRouter } from '../routes/moderation.js'

vi.mock('../middleware/moderation.js', () => ({
  moderateImage: vi.fn().mockResolvedValue({
    flagged: false,
    categories: { sexual: false, violence: false },
    categoryScores: { sexual: 0.001, violence: 0.002 },
  }),
}))

const app = express()
app.use(express.json())
app.use('/api', moderationRouter)

describe('POST /api/moderate-image', () => {
  it('returns moderation result for valid base64 image', async () => {
    const res = await request(app)
      .post('/api/moderate-image')
      .send({ image: 'data:image/png;base64,iVBORw0KGgo=' })
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('categoryScores')
    expect(res.body).toHaveProperty('flagged', false)
  })

  it('rejects missing image', async () => {
    const res = await request(app).post('/api/moderate-image').send({})
    expect(res.status).toBe(400)
  })

  it('rejects non-data-URL string', async () => {
    const res = await request(app).post('/api/moderate-image').send({ image: 'https://example.com/img.png' })
    expect(res.status).toBe(400)
  })
})
