const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Farmer\'s Companion API',
      version: '1.0.0',
      description: 'API CRUD para gerenciar dados de previsão de tempo e localidades agrícolas'
    },
    servers: [
      {
        url: 'http://localhost:3351',
        description: 'Local server'
      }
    ]
  },
  apis: ['./server.js']
};

module.exports = swaggerJsdoc(options);