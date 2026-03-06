require('dotenv').config();
const express = require('express');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');
const { Sequelize, DataTypes } = require('sequelize');

const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Farmer\'s Companion API',
      version: '1.0.0',
      description: 'API CRUD para gerenciar previsão de tempo e localidades agrícolas'
    },
    servers: [{ url: 'http://localhost:3000', description: 'Local server' }]
  },
  apis: ['./server.js']
};
const swaggerSpec = swaggerJsdoc(swaggerOptions);

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    dialect: 'postgres',
    logging: false
  }
);

// Models
const Location = sequelize.define('Location', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING },
  lat: { type: DataTypes.FLOAT },
  lon: { type: DataTypes.FLOAT }
}, { tableName: 'locations', timestamps: false });

const ForecastDay = sequelize.define('ForecastDay', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  location_id: { type: DataTypes.INTEGER },
  date: { type: DataTypes.STRING },
  maxtemp_c: { type: DataTypes.FLOAT },
  mintemp_c: { type: DataTypes.FLOAT },
  avgtemp_c: { type: DataTypes.FLOAT },
  totalprecip_mm: { type: DataTypes.FLOAT },
  avghumidity: { type: DataTypes.FLOAT },
  daily_chance_of_rain: { type: DataTypes.INTEGER },
  condition_text: { type: DataTypes.STRING },
  uv: { type: DataTypes.FLOAT }
}, { tableName: 'forecast_days', timestamps: false });

const ForecastHour = sequelize.define('ForecastHour', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  forecast_day_id: { type: DataTypes.INTEGER },
  time: { type: DataTypes.STRING },
  temp_c: { type: DataTypes.FLOAT },
  condition_text: { type: DataTypes.STRING },
  chance_of_rain: { type: DataTypes.INTEGER },
  precip_mm: { type: DataTypes.FLOAT },
  humidity: { type: DataTypes.INTEGER },
  uv: { type: DataTypes.FLOAT }
}, { tableName: 'forecast_hours', timestamps: false });

const CurrentWeather = sequelize.define('CurrentWeather', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  location_id: { type: DataTypes.INTEGER },
  temp_c: { type: DataTypes.FLOAT },
  humidity: { type: DataTypes.INTEGER },
  precip_mm: { type: DataTypes.FLOAT },
  wind_kph: { type: DataTypes.FLOAT },
  condition_text: { type: DataTypes.STRING },
  uv: { type: DataTypes.FLOAT }
}, { tableName: 'current_weather', timestamps: false });

const Chat = sequelize.define('Chat', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  title: { type: DataTypes.STRING(255), defaultValue: 'Nova Conversa' },
  location_id: { type: DataTypes.INTEGER, allowNull: true }
}, { tableName: 'chats', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });

const ChatMessage = sequelize.define('ChatMessage', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  chat_id: { type: DataTypes.INTEGER, allowNull: false },
  role: { type: DataTypes.STRING(20), allowNull: false },
  content: { type: DataTypes.TEXT, allowNull: false }
}, { tableName: 'chat_messages', timestamps: true, createdAt: 'created_at', updatedAt: false });

// Associations
Location.hasMany(ForecastDay, { foreignKey: 'location_id', as: 'forecasts' });
ForecastDay.belongsTo(Location, { foreignKey: 'location_id', as: 'location' });
ForecastDay.hasMany(ForecastHour, { foreignKey: 'forecast_day_id', as: 'hours' });
ForecastHour.belongsTo(ForecastDay, { foreignKey: 'forecast_day_id', as: 'forecast_day' });
Location.hasOne(CurrentWeather, { foreignKey: 'location_id', as: 'current_weather' });
CurrentWeather.belongsTo(Location, { foreignKey: 'location_id', as: 'location' });

Chat.hasMany(ChatMessage, { foreignKey: 'chat_id', as: 'messages', onDelete: 'CASCADE' });
ChatMessage.belongsTo(Chat, { foreignKey: 'chat_id', as: 'chat' });
Location.hasMany(Chat, { foreignKey: 'location_id', as: 'chats' });
Chat.belongsTo(Location, { foreignKey: 'location_id', as: 'location' });

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.get('/', (req, res) => res.json({ ok: true }));

// ========== LOCATIONS ==========
/**
 * @swagger
 * /locations:
 *   get:
 *     summary: Listar todas as localidades
 *     tags:
 *       - Locations
 *     responses:
 *       200:
 *         description: Lista de localidades
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                   name:
 *                     type: string
 *                   lat:
 *                     type: number
 *                   lon:
 *                     type: number
 */
app.get('/locations', async (req, res) => {
  try {
    const list = await Location.findAll();
    res.json(list);
  } catch (err) { console.error(err); res.status(500).json({ error: 'server error' }); }
});

/**
 * @swagger
 * /locations/{id}:
 *   get:
 *     summary: Obter localidade por ID
 *     tags:
 *       - Locations
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Localidade encontrada
 *       404:
 *         description: Localidade não encontrada
 */
app.get('/locations/:id', async (req, res) => {
  try {
    const item = await Location.findByPk(req.params.id, {
      include: [
        { model: ForecastDay, as: 'forecasts', include: [{ model: ForecastHour, as: 'hours' }] },
        { model: CurrentWeather, as: 'current_weather' }
      ]
    });
    if (!item) return res.status(404).json({ error: 'not found' });
    res.json(item);
  } catch (err) { console.error(err); res.status(500).json({ error: 'server error' }); }
});

/**
 * @swagger
 * /locations:
 *   post:
 *     summary: Criar nova localidade
 *     tags:
 *       - Locations
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               lat:
 *                 type: number
 *               lon:
 *                 type: number
 *     responses:
 *       201:
 *         description: Localidade criada
 */
app.post('/locations', async (req, res) => {
  try {
    const created = await Location.create(req.body);
    res.status(201).json(created);
  } catch (err) { console.error(err); res.status(400).json({ error: 'bad request' }); }
});

/**
 * @swagger
 * /locations/{id}:
 *   put:
 *     summary: Atualizar localidade
 *     tags:
 *       - Locations
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Localidade atualizada
 */
app.put('/locations/:id', async (req, res) => {
  try {
    const obj = await Location.findByPk(req.params.id);
    if (!obj) return res.status(404).json({ error: 'not found' });
    await obj.update(req.body);
    res.json(obj);
  } catch (err) { console.error(err); res.status(400).json({ error: 'bad request' }); }
});

/**
 * @swagger
 * /locations/{id}:
 *   delete:
 *     summary: Deletar localidade
 *     tags:
 *       - Locations
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       204:
 *         description: Localidade deletada
 */
app.delete('/locations/:id', async (req, res) => {
  try {
    const obj = await Location.findByPk(req.params.id);
    if (!obj) return res.status(404).json({ error: 'not found' });
    await obj.destroy();
    res.status(204).send();
  } catch (err) { console.error(err); res.status(500).json({ error: 'server error' }); }
});

// ========== FORECAST DAYS ==========
/**
 * @swagger
 * /forecast-days:
 *   get:
 *     summary: Listar todos os dias de previsão
 *     tags:
 *       - Forecast Days
 *     responses:
 *       200:
 *         description: Lista de dias de previsão
 */
app.get('/forecast-days', async (req, res) => {
  try {
    const list = await ForecastDay.findAll();
    res.json(list);
  } catch (err) { console.error(err); res.status(500).json({ error: 'server error' }); }
});

/**
 * @swagger
 * /forecast-days/{id}:
 *   get:
 *     summary: Obter previsão de dia por ID
 *     tags:
 *       - Forecast Days
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Previsão encontrada
 */
app.get('/forecast-days/:id', async (req, res) => {
  try {
    const item = await ForecastDay.findByPk(req.params.id, { include: [{ model: ForecastHour, as: 'hours' }] });
    if (!item) return res.status(404).json({ error: 'not found' });
    res.json(item);
  } catch (err) { console.error(err); res.status(500).json({ error: 'server error' }); }
});

/**
 * @swagger
 * /forecast-days:
 *   post:
 *     summary: Criar nova previsão de dia
 *     tags:
 *       - Forecast Days
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               location_id:
 *                 type: integer
 *               date:
 *                 type: string
 *               maxtemp_c:
 *                 type: number
 *               mintemp_c:
 *                 type: number
 *               avgtemp_c:
 *                 type: number
 *               totalprecip_mm:
 *                 type: number
 *               avghumidity:
 *                 type: number
 *               daily_chance_of_rain:
 *                 type: integer
 *               condition_text:
 *                 type: string
 *               uv:
 *                 type: number
 *               hours:
 *                 type: array
 *     responses:
 *       201:
 *         description: Previsão criada
 */
app.post('/forecast-days', async (req, res) => {
  try {
    const { hours, ...dayData } = req.body;
    const day = await ForecastDay.create(dayData);
    if (Array.isArray(hours)) {
      await Promise.all(hours.map(h => ForecastHour.create({ ...h, forecast_day_id: day.id })));
    }
    const created = await ForecastDay.findByPk(day.id, { include: [{ model: ForecastHour, as: 'hours' }] });
    res.status(201).json(created);
  } catch (err) { console.error(err); res.status(400).json({ error: 'bad request' }); }
});

/**
 * @swagger
 * /forecast-days/{id}:
 *   put:
 *     summary: Atualizar previsão de dia
 *     tags:
 *       - Forecast Days
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Previsão atualizada
 */
app.put('/forecast-days/:id', async (req, res) => {
  try {
    const obj = await ForecastDay.findByPk(req.params.id);
    if (!obj) return res.status(404).json({ error: 'not found' });
    await obj.update(req.body);
    res.json(obj);
  } catch (err) { console.error(err); res.status(400).json({ error: 'bad request' }); }
});

/**
 * @swagger
 * /forecast-days/{id}:
 *   delete:
 *     summary: Deletar previsão de dia
 *     tags:
 *       - Forecast Days
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       204:
 *         description: Previsão deletada
 */
app.delete('/forecast-days/:id', async (req, res) => {
  try {
    const obj = await ForecastDay.findByPk(req.params.id);
    if (!obj) return res.status(404).json({ error: 'not found' });
    await obj.destroy();
    res.status(204).send();
  } catch (err) { console.error(err); res.status(500).json({ error: 'server error' }); }
});

// ========== FORECAST HOURS ==========
/**
 * @swagger
 * /forecast-hours:
 *   get:
 *     summary: Listar todas as horas de previsão
 *     tags:
 *       - Forecast Hours
 *     responses:
 *       200:
 *         description: Lista de horas de previsão
 */
app.get('/forecast-hours', async (req, res) => {
  try {
    const list = await ForecastHour.findAll();
    res.json(list);
  } catch (err) { console.error(err); res.status(500).json({ error: 'server error' }); }
});

/**
 * @swagger
 * /forecast-hours/{id}:
 *   get:
 *     summary: Obter previsão de hora por ID
 *     tags:
 *       - Forecast Hours
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Previsão encontrada
 */
app.get('/forecast-hours/:id', async (req, res) => {
  try {
    const item = await ForecastHour.findByPk(req.params.id);
    if (!item) return res.status(404).json({ error: 'not found' });
    res.json(item);
  } catch (err) { console.error(err); res.status(500).json({ error: 'server error' }); }
});

/**
 * @swagger
 * /forecast-hours:
 *   post:
 *     summary: Criar nova previsão de hora
 *     tags:
 *       - Forecast Hours
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               forecast_day_id:
 *                 type: integer
 *               time:
 *                 type: string
 *               temp_c:
 *                 type: number
 *               condition_text:
 *                 type: string
 *               chance_of_rain:
 *                 type: integer
 *               precip_mm:
 *                 type: number
 *               humidity:
 *                 type: integer
 *               uv:
 *                 type: number
 *     responses:
 *       201:
 *         description: Previsão criada
 */
app.post('/forecast-hours', async (req, res) => {
  try {
    const created = await ForecastHour.create(req.body);
    res.status(201).json(created);
  } catch (err) { console.error(err); res.status(400).json({ error: 'bad request' }); }
});

/**
 * @swagger
 * /forecast-hours/{id}:
 *   put:
 *     summary: Atualizar previsão de hora
 *     tags:
 *       - Forecast Hours
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Previsão atualizada
 */
app.put('/forecast-hours/:id', async (req, res) => {
  try {
    const obj = await ForecastHour.findByPk(req.params.id);
    if (!obj) return res.status(404).json({ error: 'not found' });
    await obj.update(req.body);
    res.json(obj);
  } catch (err) { console.error(err); res.status(400).json({ error: 'bad request' }); }
});

/**
 * @swagger
 * /forecast-hours/{id}:
 *   delete:
 *     summary: Deletar previsão de hora
 *     tags:
 *       - Forecast Hours
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       204:
 *         description: Previsão deletada
 */
app.delete('/forecast-hours/:id', async (req, res) => {
  try {
    const obj = await ForecastHour.findByPk(req.params.id);
    if (!obj) return res.status(404).json({ error: 'not found' });
    await obj.destroy();
    res.status(204).send();
  } catch (err) { console.error(err); res.status(500).json({ error: 'server error' }); }
});

// ========== CURRENT WEATHER ==========
/**
 * @swagger
 * /current-weather:
 *   get:
 *     summary: Listar todos os registros de tempo atual
 *     tags:
 *       - Current Weather
 *     responses:
 *       200:
 *         description: Lista de registros de tempo atual
 */
app.get('/current-weather', async (req, res) => {
  try {
    const list = await CurrentWeather.findAll();
    res.json(list);
  } catch (err) { console.error(err); res.status(500).json({ error: 'server error' }); }
});

/**
 * @swagger
 * /current-weather/{id}:
 *   get:
 *     summary: Obter tempo atual por ID
 *     tags:
 *       - Current Weather
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Registro encontrado
 */
app.get('/current-weather/:id', async (req, res) => {
  try {
    const item = await CurrentWeather.findByPk(req.params.id);
    if (!item) return res.status(404).json({ error: 'not found' });
    res.json(item);
  } catch (err) { console.error(err); res.status(500).json({ error: 'server error' }); }
});

/**
 * @swagger
 * /current-weather:
 *   post:
 *     summary: Criar novo registro de tempo atual
 *     tags:
 *       - Current Weather
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               location_id:
 *                 type: integer
 *               temp_c:
 *                 type: number
 *               humidity:
 *                 type: integer
 *               precip_mm:
 *                 type: number
 *               wind_kph:
 *                 type: number
 *               condition_text:
 *                 type: string
 *               uv:
 *                 type: number
 *     responses:
 *       201:
 *         description: Registro criado
 */
app.post('/current-weather', async (req, res) => {
  try {
    const created = await CurrentWeather.create(req.body);
    res.status(201).json(created);
  } catch (err) { console.error(err); res.status(400).json({ error: 'bad request' }); }
});

/**
 * @swagger
 * /current-weather/{id}:
 *   put:
 *     summary: Atualizar tempo atual
 *     tags:
 *       - Current Weather
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Registro atualizado
 */
app.put('/current-weather/:id', async (req, res) => {
  try {
    const obj = await CurrentWeather.findByPk(req.params.id);
    if (!obj) return res.status(404).json({ error: 'not found' });
    await obj.update(req.body);
    res.json(obj);
  } catch (err) { console.error(err); res.status(400).json({ error: 'bad request' }); }
});

/**
 * @swagger
 * /current-weather/{id}:
 *   delete:
 *     summary: Deletar tempo atual
 *     tags:
 *       - Current Weather
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       204:
 *         description: Registro deletado
 */
app.delete('/current-weather/:id', async (req, res) => {
  try {
    const obj = await CurrentWeather.findByPk(req.params.id);
    if (!obj) return res.status(404).json({ error: 'not found' });
    await obj.destroy();
    res.status(204).send();
  } catch (err) { console.error(err); res.status(500).json({ error: 'server error' }); }
});

// ========== CHATS ==========
const PYTHON_API_URL = (process.env.PYTHON_API_URL || 'http://localhost:8000').replace(/\/$/, '');

app.get('/api/chats', async (req, res) => {
  try {
    const chats = await Chat.findAll({
      order: [['updated_at', 'DESC']],
      include: [{ model: ChatMessage, as: 'messages', attributes: ['id'] }]
    });
    res.json(chats);
  } catch (err) { console.error(err); res.status(500).json({ error: 'server error' }); }
});

app.post('/api/chats', async (req, res) => {
  try {
    const { title, location_id } = req.body;
    const chat = await Chat.create({ title: title || 'Nova Conversa', location_id: location_id || null });
    res.status(201).json({ id: chat.id, chatId: chat.id, title: chat.title, created_at: chat.created_at });
  } catch (err) { console.error(err); res.status(400).json({ error: 'bad request' }); }
});

app.get('/api/chats/:id', async (req, res) => {
  try {
    const chat = await Chat.findByPk(req.params.id, {
      include: [{ model: ChatMessage, as: 'messages', order: [['created_at', 'ASC']] }]
    });
    if (!chat) return res.status(404).json({ error: 'not found' });
    res.json(chat);
  } catch (err) { console.error(err); res.status(500).json({ error: 'server error' }); }
});

app.delete('/api/chats/:id', async (req, res) => {
  try {
    const chat = await Chat.findByPk(req.params.id);
    if (!chat) return res.status(404).json({ error: 'not found' });
    await ChatMessage.destroy({ where: { chat_id: chat.id } });
    await chat.destroy();
    res.status(204).send();
  } catch (err) { console.error(err); res.status(500).json({ error: 'server error' }); }
});

app.post('/api/chat', async (req, res) => {
  const { message, chatId, history, locationId } = req.body;
  try {
    const pyRes = await fetch(`${PYTHON_API_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history: history || [], locationId: locationId || null })
    });
    if (!pyRes.ok) {
      const err = await pyRes.text();
      return res.status(502).json({ error: 'python api error', detail: err });
    }
    const data = await pyRes.json();
    const reply = data.reply;

    if (chatId && !String(chatId).startsWith('local_')) {
      const chat = await Chat.findByPk(chatId);
      if (chat) {
        await ChatMessage.bulkCreate([
          { chat_id: chat.id, role: 'user', content: message },
          { chat_id: chat.id, role: 'assistant', content: reply }
        ]);
        await chat.update({ updated_at: new Date() });
      }
    }

    res.json({ reply });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: 'Erro ao processar mensagem. Verifique se a API Python está rodando.' });
  }
});

// Start
const PORT = process.env.PORT || 3000;
sequelize.authenticate()
  .then(() => sequelize.sync({ alter: true }))
  .then(() => {
    app.listen(PORT, () => console.log(`API running on port ${PORT}`));
  })
  .catch(err => {
    console.error('DB connection/sync failed:', err);
    process.exit(1);
  });