FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./backend/
<<<<<<< HEAD
COPY frontend/ ./frontend/
=======
>>>>>>> a6ba1731bce3faeb060101efc7c629262854bb34

EXPOSE 8005

CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8005"]
