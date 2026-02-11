# 🌾 Assistente IA para Agricultura

## Objetivo

O intuito do nosso projeto é criar um **companheiro assistido por IA** para fazendeiros! 🚜✨ 

Ele irá reunir dados sobre o clima da região, fazendo:
- Previsões meteorológicas
- Análise de tendências climáticas
- Suporte nas tomadas de decisões sobre a colheita

Isso inclui recomendações sobre:
- Irrigação
- Controle de pragas
- Manejo da plantação

Acompanhando essa IA, temos um **dashboard** onde dados de monitoramento em tempo real são logados e ficam prontos para consulta! 📈

## Execução

1. **Modelagem de Dados**
   - Usar os dados retornados pela API de clima para montar o schema do banco de dados

2. **Automação de Coleta**
   - Selecionar uma API de monitoramento de clima
   - Criar um fluxo no n8n para realizar queries agendadas
   - Logar os dados automaticamente no banco de dados PostgreSQL

3. **API Backend**
   - Criar uma API REST em Python com operações CRUD
   - Desenvolver endpoints específicos para integração com a IA

4. **Dashboard de Monitoramento**
   - Configurar visualizações no Grafana
   - Implementar gráficos time series
   - Criar heatmaps de monitoramento da região (dependendo dos dados disponíveis)

5. **Interface do Usuário**
   - Criar um site com o dashboard integrado
   - Implementar chatbot para interação com o usuário
   - Permitir consultas aos dados e recebimento de sugestões personalizadas

## Tech Stack

### Frontend
- ![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)
- ![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)

### Backend
- ![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white) REST API
- ![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)
- ![n8n](https://img.shields.io/badge/n8n-EA4B71?style=for-the-badge&logo=n8n&logoColor=white)

### Monitoramento
- ![Grafana](https://img.shields.io/badge/Grafana-F46800?style=for-the-badge&logo=grafana&logoColor=white)

---

<div align="center">
  Feito com 💚 para ajudar os agricultores 🌾
</div>
